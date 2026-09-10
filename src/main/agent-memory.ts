// ─── Agent Long-Term Memory Store ───
// Per-document persistent memory for the Lexicon AI agent.
// Stores facts, preferences, decisions, corrections, and summaries.
// Supports document-scoped and global memory, recency-weighted retrieval,
// consolidation, editing, and document-type templates.

import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomBytes, createHash } from 'crypto'
import type { AgentMemoryEntry, AgentMemoryResult, AgentMemoryApprovalState, AgentMemorySourceType } from '../shared/types'
import { isEligibleForPrompt, findCorrectionClusters, buildClusterSuggestion, defaultApprovalState } from './memory/policy'
import { isSuppressedContent, planForgetCascade, shingleHashes, configureFingerprintKey, type SuppressionRecord } from './memory/deletion'
import type { HistoricalEvent } from './memory/migration-sessions'
import {
  migrateLegacyData,
  verifyMigrationCounts,
  entriesChecksum,
  SCHEMA_VERSION,
  type QuarantinedRecord
} from './memory/migration'
import { AgentLedger, type MemoryLedgerState, type MemoryMigrationManifest } from './memory/ledger'
import { InProcessLedgerDriver, type LedgerDriver } from './memory/ledger-driver'
import { MemoryError } from './memory/errors'

export class AgentMemoryStore {
  private entries: Map<string, AgentMemoryEntry> = new Map()
  /** Ambiguous legacy records held for user review (§12 step 5) — not merged. */
  private quarantine: Array<QuarantinedRecord & { key: string }> = []
  /** Anti-re-learning fingerprints of forgotten content (§11) — hashes only. */
  private suppressions: SuppressionRecord[] = []
  /** Imported legacy chat sessions as historical events (§12 step 7). */
  private historicalEvents: HistoricalEvent[] = []
  /** Monotonic sequence assigned to imported events (§E). */
  private eventSequence = 0
  /** Write the legacy JSON compatibility mirror (§A; default on while migrating). */
  private writeJsonMirror = true
  private filePath: string
  /** Lexicon-owned transactional ledger — authoritative once materialized.
   *  Null when an off-thread worker owns the database (worker-backed store). */
  private ledger: AgentLedger | null
  /** Async driver over the ledger (in-process today, worker-swappable). */
  private driver: LedgerDriver
  /** True when the driver is an off-thread single writer (write-behind). */
  private workerBacked = false
  /** Coalesced pending ledger write for the worker path. */
  private dirty = false
  private pendingManifest?: MemoryMigrationManifest
  /** Serializes write-behind commits. */
  private flushChain: Promise<void> = Promise.resolve()
  /** Cached migration manifests, refreshed on init when worker-backed. */
  private manifestCache: MemoryMigrationManifest[] | null = null
  /** Cached pending outbox for worker-backed reads (sync API). */
  private outboxCache: Array<{ id: number; documentId: string; eventId: string; sequence: number }> = []
  private pendingOutboxDone = new Set<number>()

  private static TEMPLATES: Record<string, Array<{ type: AgentMemoryEntry['type']; content: string; scope: 'document' | 'global' }>> = {
    novel: [
      { type: 'preference', content: 'Maintain consistent character voices throughout dialogue', scope: 'global' },
      { type: 'preference', content: "Use past tense for narrative prose", scope: 'document' },
      { type: 'preference', content: "Show, don't tell — describe emotions through action and sensory detail", scope: 'document' },
      { type: 'decision', content: 'Chapter breaks at scene transitions, not arbitrary length targets', scope: 'document' },
    ],
    research: [
      { type: 'preference', content: 'Use APA citation style for references', scope: 'document' },
      { type: 'preference', content: 'Write in third person, passive voice for methodology sections', scope: 'document' },
      { type: 'decision', content: 'Structure: Abstract, Introduction, Methods, Results, Discussion, Conclusion', scope: 'document' },
      { type: 'preference', content: 'Cite claims with parenthetical author-year references', scope: 'document' },
    ],
    blog: [
      { type: 'preference', content: 'Conversational tone, second person ("you") address', scope: 'document' },
      { type: 'preference', content: 'Short paragraphs (2-3 sentences max) for readability', scope: 'document' },
      { type: 'decision', content: 'Open with a hook or question, close with a call to action', scope: 'document' },
      { type: 'preference', content: 'Use subheadings every 200-300 words to break up text', scope: 'document' },
    ],
  }

  constructor(filePath?: string, options: { driver?: LedgerDriver; skipLoad?: boolean } = {}) {
    // Path is injectable for tests; production uses the Electron userData dir.
    this.filePath = filePath ?? path.join(app.getPath('userData'), 'agent-memory.json')
    if (options.driver) {
      this.driver = options.driver
      this.ledger = options.driver.kind === 'in-process'
        ? (options.driver as InProcessLedgerDriver).syncLedger
        : null
    } else {
      this.ledger = new AgentLedger(this.filePath.replace(/\.json$/i, '.sqlite'))
      this.driver = new InProcessLedgerDriver(this.ledger)
    }
    this.workerBacked = this.driver.kind === 'worker'
    // Install the domain-separated fingerprint key before any hashing happens.
    configureFingerprintKey(this.loadFingerprintKey())
    // Worker-backed stores load asynchronously via initFromDriver() so the
    // main thread never reads a DB the worker is writing.
    if (!options.skipLoad && !this.workerBacked) this.load()
  }

  /**
   * Load (or create) the installation fingerprint key, protected with the OS
   * key store when available (§D/R17). Best-effort: if the OS store is not
   * available, the key is still written with restrictive permissions.
   */
  private loadFingerprintKey(): Buffer {
    const keyPath = `${this.filePath}.fingerprint.key`
    try {
      if (fs.existsSync(keyPath)) {
        const key = Buffer.from(this.unprotectString(fs.readFileSync(keyPath)), 'base64')
        if (key.length >= 16) return key
      }
    } catch {
      // Corrupt/unreadable key — regenerate below.
    }
    const key = randomBytes(32)
    try {
      fs.writeFileSync(keyPath, this.protectString(key.toString('base64')), { mode: 0o600 })
    } catch {
      // Best-effort persistence; the in-memory key still works this run.
    }
    return key
  }

  private protectString(text: string): Buffer {
    const ss = safeStorage as unknown as
      | { isEncryptionAvailable?: () => boolean; encryptString?: (value: string) => Buffer }
      | undefined
    try {
      if (ss?.isEncryptionAvailable?.() && ss.encryptString) return ss.encryptString(text)
    } catch { /* fall through to plain */ }
    return Buffer.from(text, 'utf-8')
  }

  private unprotectString(stored: Buffer): string {
    const ss = safeStorage as unknown as
      | { isEncryptionAvailable?: () => boolean; decryptString?: (value: Buffer) => string }
      | undefined
    try {
      if (ss?.isEncryptionAvailable?.() && ss.decryptString) return ss.decryptString(stored)
    } catch { /* fall through to plain */ }
    return stored.toString('utf-8')
  }

  /** The transactional ledger backing this store (shared by the bridge). */
  getLedger(): AgentLedger {
    if (!this.ledger) {
      throw new MemoryError('worker-unavailable', 'session ledger is not available on a worker-backed store')
    }
    return this.ledger
  }

  /** The async driver over the ledger (in-process, or a worker writer). */
  getDriver(): LedgerDriver {
    return this.driver
  }

  /**
   * Commit the current in-memory state through the driver (async). Used on the
   * worker-writer path, where SQLite work must leave the main thread. The
   * synchronous `save()` remains for the in-process/tests path.
   */
  async persistStateViaDriver(manifest?: MemoryMigrationManifest): Promise<void> {
    await this.driver.writeMemoryState(this.ledgerState(), manifest)
  }

  /** True when this store is backed by an off-thread worker writer. */
  isWorkerBacked(): boolean {
    return this.workerBacked
  }

  /**
   * Worker path: apply mutations had only updated memory synchronously and
   * marked the state dirty (write-behind). `flush` commits the coalesced state
   * through the driver and surfaces commit failures to the caller.
   */
  async flush(): Promise<void> {
    // Serialize commits so concurrent callers cannot interleave writes.
    const run = this.flushChain.then(() => this.flushOnce())
    this.flushChain = run.then(() => undefined, () => undefined)
    return await run
  }

  private async flushOnce(): Promise<void> {
    if (!this.workerBacked) return
    const hadStateWrite = this.dirty
    const outboxIds = Array.from(this.pendingOutboxDone)
    if (!hadStateWrite && outboxIds.length === 0) return

    const manifest = this.pendingManifest
    try {
      if (hadStateWrite) {
        this.dirty = false
        this.pendingManifest = undefined
        await this.driver.writeMemoryState(this.ledgerState(), manifest)
      }
      if (outboxIds.length > 0) {
        await this.driver.markOutboxDone(outboxIds)
        for (const id of outboxIds) this.pendingOutboxDone.delete(id)
      }
      // The worker may have enqueued new outbox rows; refresh the sync cache.
      this.outboxCache = await this.driver.listOutbox('pending')
    } catch (err) {
      // Keep the state pending so a later flush can retry.
      if (hadStateWrite) {
        this.dirty = true
        this.pendingManifest = manifest
      }
      throw new MemoryError('ledger-failed', `Failed to commit memory ledger: ${(err as Error).message}`)
    }
  }

  /**
   * Worker path: load the authoritative state from the worker before serving
   * reads. Safe to call once during startup.
   */
  async initFromDriver(): Promise<void> {
    if (!this.workerBacked) return
    const [state, manifests, outbox] = await Promise.all([
      this.driver.loadMemoryState(),
      this.driver.listMigrationManifests(),
      this.driver.listOutbox('pending')
    ])
    this.applyMemoryState(state)
    this.manifestCache = manifests
    this.outboxCache = outbox
    this.pendingOutboxDone.clear()
  }

  /** Replace the in-memory state from a loaded ledger snapshot. */
  private applyMemoryState(state: MemoryLedgerState): void {
    this.entries.clear()
    for (const e of state.entries) this.entries.set(e.id, e)
    this.suppressions = state.suppressions
    this.historicalEvents = state.historicalEvents
    this.quarantine = state.quarantine
    this.syncEventSequence()
  }

  /**
   * Compact the active ledger file after deletion maintenance (updates-2.md
   * §D): checkpoint + VACUUM so deleted plaintext does not linger in free pages.
   */
  compact(): void {
    if (this.workerBacked) return
    this.ledger!.compact()
  }

  /** Worker path: compact through the driver after flushing pending writes. */
  async compactAsync(): Promise<void> {
    if (!this.workerBacked) {
      this.ledger!.compact()
      return
    }
    await this.flush()
    await this.driver.compact()
  }

  /** Snapshot of the retained state for a ledger commit. */
  private ledgerState(): MemoryLedgerState {
    return {
      entries: Array.from(this.entries.values()),
      suppressions: this.suppressions,
      historicalEvents: this.historicalEvents,
      quarantine: this.quarantine
    }
  }

  /**
   * Initialize the ledger from the legacy JSON on first run. Failures are
   * logged, not fatal: construction must stay robust, and the JSON mirror
   * still holds the data until the next successful write.
   */
  private persistToLedger(): void {
    try {
      this.ledger!.writeMemoryState(this.ledgerState())
    } catch (err) {
      console.warn('[AgentMemoryStore] Ledger initialization failed:', err)
    }
  }

  private load(): void {
    // The ledger is authoritative once it has been materialized. A read
    // failure puts memory into an explicit limited mode instead of silently
    // starting empty and overwriting existing data.
    try {
      if (this.ledger!.isInitialized()) {
        this.applyMemoryState(this.ledger!.loadMemoryState())
        return
      }
    } catch (err) {
      console.warn('[AgentMemoryStore] Ledger read failed — memory is in limited mode:', err)
      return
    }

    try {
      if (fs.existsSync(this.filePath)) {
        const rawText = fs.readFileSync(this.filePath, 'utf-8')
        const data = JSON.parse(rawText)
        if (data && typeof data === 'object' && !Array.isArray(data) && data.meta?.schemaVersion === SCHEMA_VERSION) {
          // Canonical store (memory.md §12 step 10: switched after migration).
          const arr: AgentMemoryEntry[] = data.entries || []
          // §A: verify a recorded checksum before activating. A mismatch means
          // the file was altered/corrupt — do not load it (limited mode) rather
          // than silently trusting tampered data.
          if (typeof data.meta?.checksum === 'string' && data.meta.checksum !== entriesChecksum(arr)) {
            console.warn('[AgentMemoryStore] Memory checksum mismatch — refusing to activate this store')
            return
          }
          for (const e of arr) {
            // Backward compat: old entries without scope get 'document'
            if (!e.scope) e.scope = 'document'
            this.entries.set(e.id, e)
          }
          this.suppressions = Array.isArray(data.suppressions) ? (data.suppressions as SuppressionRecord[]) : []
          this.historicalEvents = Array.isArray(data.historicalEvents) ? (data.historicalEvents as HistoricalEvent[]) : []
          this.quarantine = this.synthesizeQuarantineKeys(data.quarantine || [])
          this.syncEventSequence()
          // Materialize the ledger so subsequent loads are authoritative.
          this.persistToLedger()
          return
        }
        this.migrateLegacyFile(rawText, data)
        return
      }
      // Fresh store: initialize the ledger so it becomes authoritative.
      this.persistToLedger()
    } catch {
      console.warn('Failed to load agent memory, starting with empty memory')
    }
  }

  /**
   * One-time legacy migration (memory.md §12 steps 1–12). Takes an explicit
   * backup, validates through the migration flow, quarantines ambiguous
   * keys instead of merging, and only switches to the canonical store when
   * count verification succeeds. Idempotent: the canonical file carries
   * schemaVersion and is never re-migrated; the original file is never
   * deleted — the backup stays until the user removes it explicitly.
   */
  private migrateLegacyFile(rawText: string, data: unknown): void {
    const totalLegacy = Array.isArray(data)
      ? (data as unknown[]).length
      : data && typeof data === 'object' && Array.isArray((data as { entries?: unknown[] }).entries)
        ? ((data as { entries: unknown[] }).entries).length
        : 0
    const result = migrateLegacyData(data)
    if (!verifyMigrationCounts(totalLegacy, result)) {
      // Count mismatch — do NOT switch stores. Fall back to the lenient
      // pre-migration behavior so nothing is lost.
      console.error('[AgentMemoryStore] Migration count verification failed — keeping legacy file untouched')
      const arr: AgentMemoryEntry[] = Array.isArray(data)
        ? (data as AgentMemoryEntry[])
        : ((data as { entries?: AgentMemoryEntry[] })?.entries ?? [])
      for (const e of arr) {
        if (!e.scope) e.scope = 'document'
        this.entries.set(e.id, e)
      }
      return
    }

    // Explicit local backup with the same privacy protections (same
    // directory/permissions as the original data) — §12 steps 2 and 11.
    // Uniquely named and created exclusively (`wx`) so a timestamp collision
    // never overwrites an existing backup.
    try {
      this.writeUniqueBackup(rawText)
    } catch {
      console.warn('[AgentMemoryStore] Failed to write migration backup — aborting switch to preserve originals')
      // Without a backup we must not rewrite the store.
      const arr: AgentMemoryEntry[] = Array.isArray(data)
        ? (data as AgentMemoryEntry[])
        : ((data as { entries?: AgentMemoryEntry[] })?.entries ?? [])
      for (const e of arr) {
        if (!e.scope) e.scope = 'document'
        this.entries.set(e.id, e)
      }
      return
    }

    for (const e of result.entries) this.entries.set(e.id, e)
    this.quarantine = this.synthesizeQuarantineKeys(result.quarantined)
    // §A: record an import manifest (source hash, counts, checksum) in the
    // same ledger transaction as the imported state.
    const manifest: MemoryMigrationManifest = {
      sourcePath: this.filePath,
      sourceHash: createHash('sha256').update(rawText).digest('hex'),
      importedAt: Date.now(),
      entries: result.entries.length,
      events: this.historicalEvents.length,
      quarantined: result.quarantined.length,
      skipped: result.skippedInvalid,
      entriesChecksum: entriesChecksum(result.entries)
    }
    this.save(manifest)
    console.log(
      `[AgentMemoryStore] Migrated legacy memory: ${result.entries.length} entries, ` +
      `${result.quarantined.length} quarantined for review, ${result.skippedInvalid} invalid skipped`
    )
  }

  /** Recorded legacy-import manifests (provenance), newest last (§A). */
  listImportManifests(): MemoryMigrationManifest[] {
    if (this.workerBacked) return this.manifestCache ?? []
    return this.ledger!.listMigrationManifests()
  }

  /** Stable review keys for quarantined records (original ids may be missing). */
  private synthesizeQuarantineKeys(records: QuarantinedRecord[]): Array<QuarantinedRecord & { key: string }> {
    return records.map((r, i) => ({
      ...r,
      key: typeof r.record.id === 'string' && r.record.id ? `id:${r.record.id}` : `q:${i}`
    }))
  }

  /**
   * Enable/disable the legacy JSON compatibility mirror (§A). Ledger-only mode
   * still loads legacy JSON for migration but stops rewriting it.
   */
  setJsonMirror(enabled: boolean): void {
    this.writeJsonMirror = enabled
  }

  private save(manifest?: MemoryMigrationManifest): void {
    const arr = Array.from(this.entries.values())
    // The JSON file remains a compatibility mirror during migration and is
    // written first as the legacy commit point: if it fails, the ledger is
    // left untouched and the caller can report a failed commit (R13). In
    // ledger-only mode (§A) the mirror is skipped entirely.
    if (this.writeJsonMirror) {
      const serialized = JSON.stringify({
        meta: {
          schemaVersion: SCHEMA_VERSION,
          savedAt: Date.now(),
          // §12 step 10: checksum over entries for verification on next load.
          checksum: entriesChecksum(arr)
        },
        entries: arr,
        quarantine: this.quarantine.map((q) => ({ reason: q.reason, originKey: q.originKey, record: q.record })),
        // §11 anti-re-learning: hashes only — forgotten content leaves no
        // plaintext behind.
        suppressions: this.suppressions,
        // §12 step 7: legacy sessions imported as historical events.
        historicalEvents: this.historicalEvents
      })
      try {
        fs.writeFileSync(this.filePath, serialized, 'utf-8')
      } catch (err) {
        throw new MemoryError('write-failed', `Failed to write memory store: ${(err as Error).message}`)
      }
    }
    // Authoritative transactional commit. A ledger failure propagates so the
    // operation is never reported as durably remembered.
    if (this.workerBacked) {
      // Write-behind: the worker owns the DB, so record the pending commit and
      // let the async caller `flush()` it (surfacing commit failures then).
      this.dirty = true
      this.pendingManifest = manifest
      return
    }
    try {
      this.ledger!.writeMemoryState(this.ledgerState(), manifest)
    } catch (err) {
      throw new MemoryError('ledger-failed', `Failed to commit memory ledger: ${(err as Error).message}`)
    }
  }

  add(
    documentId: string,
    agentName: string,
    type: AgentMemoryEntry['type'],
    content: string,
    source: 'explicit' | 'inferred' = 'inferred',
    scope: 'document' | 'global' = 'document',
    provenance?: {
      sourceType?: AgentMemorySourceType
      runId?: string
      originKey?: string
      approvalState?: AgentMemoryApprovalState
    }
  ): AgentMemoryEntry {
    const sourceType: AgentMemorySourceType = provenance?.sourceType ?? (source === 'explicit' ? 'user' : 'agent')
    const entry: AgentMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId: scope === 'global' ? '__global__' : documentId,
      agentName,
      type,
      content,
      createdAt: Date.now(),
      source,
      scope,
      // memory.md §6.3: inferred entries start as candidates and are excluded
      // from prompts until approved. Legacy callers without provenance keep
      // their previous behavior (explicit → approved, inferred → candidate).
      approvalState: provenance?.approvalState ?? defaultApprovalState(source, sourceType),
      sourceType,
      runId: provenance?.runId,
      originKey: provenance?.originKey
    }
    this.entries.set(entry.id, entry)
    this.save()
    return entry
  }

  /**
   * Migrate entries from a legacy memory key (file path, 'default', tab id)
   * to a stable documentId (memory.md §6.1). Idempotent: entries already on
   * the new key are untouched, and the origin key is recorded for traceability.
   */
  rekey(oldKey: string, newKey: string): number {
    if (oldKey === newKey) return 0
    let moved = 0
    for (const entry of Array.from(this.entries.values())) {
      if (entry.documentId === oldKey && entry.scope !== 'global') {
        entry.documentId = newKey
        entry.originKey = entry.originKey ?? oldKey
        moved++
      }
    }
    if (moved > 0) this.save()
    return moved
  }

  /** Update an entry's approval state (memory.md §6.3 lifecycle). */
  setApproval(id: string, state: AgentMemoryApprovalState): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.approvalState = state
    // §F: approving a consolidation summary is the point at which its
    // approved original sources are retired — the replacement is now active.
    if (state === 'approved' && entry.type === 'summary' && (entry.derivedFrom?.length ?? 0) > 0) {
      for (const src of entry.derivedFrom ?? []) {
        const source = this.entries.get(src)
        if (source && source.approvalState === 'approved') source.approvalState = 'superseded'
      }
    }
    // §F: rejecting or replacing a source invalidates the active summaries
    // derived from it (transitively), so a stale derived rule cannot keep
    // influencing prompts after its evidence was rejected.
    if (state === 'rejected') {
      const invalidated = new Set<string>([id])
      let changed = true
      while (changed) {
        changed = false
        for (const candidate of Array.from(this.entries.values())) {
          if (invalidated.has(candidate.id)) continue
          if ((candidate.derivedFrom ?? []).some((src: string) => invalidated.has(src))) {
            invalidated.add(candidate.id)
            if (candidate.approvalState === 'approved' || candidate.type === 'summary') {
              candidate.approvalState = 'superseded'
            }
            changed = true
          }
        }
      }
    }
    this.save()
  }

  /** Quarantined legacy records awaiting user review (memory.md §12 step 5). */
  getQuarantined(): Array<QuarantinedRecord & { key: string }> {
    return this.quarantine
  }

  /**
   * Resolve a quarantined record by explicit user action (§12 step 5).
   * 'keep' imports the record into the target document as a candidate —
   * review is still required before it influences prompts. 'discard'
   * removes it permanently. Returns true when the key resolved.
   */
  resolveQuarantine(
    key: string,
    action: { type: 'keep'; documentId: string } | { type: 'discard' }
  ): boolean {
    const idx = this.quarantine.findIndex((q) => q.key === key)
    if (idx === -1) return false
    const [q] = this.quarantine.splice(idx, 1)
    if (action.type === 'keep') {
      const r = q.record
      // The record was schema-validated upstream of quarantine only for key
      // ambiguity; re-validate the essentials defensively.
      if (typeof r.id === 'string' && r.id && typeof r.content === 'string' && r.content.trim() !== '' &&
          typeof r.type === 'string') {
        const entry: AgentMemoryEntry = {
          // Guard against id collisions with existing entries.
          id: this.entries.has(r.id) ? `${r.id}_mig${Date.now().toString(36)}` : r.id,
          documentId: action.documentId,
          agentName: typeof r.agentName === 'string' ? r.agentName : 'system',
          type: r.type as AgentMemoryEntry['type'],
          content: r.content, // verbatim — preserve original content (§12 step 3)
          createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
          source: r.source === 'explicit' ? 'explicit' : 'inferred',
          scope: 'document',
          // Imported from quarantine: always requires review before use.
          approvalState: 'candidate',
          sourceType: 'migration',
          originKey: q.originKey ?? undefined
        }
        this.entries.set(entry.id, entry)
      }
    }
    this.save()
    return true
  }

  /** Candidate entries awaiting user review (memory.md §10.2 Suggestions view). */
  getCandidates(documentId: string): AgentMemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.approvalState === 'candidate' && (e.documentId === documentId || e.scope === 'global'))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /** Single entry lookup (used by the forget flow before ledger removal). */
  getEntry(id: string): AgentMemoryEntry | undefined {
    return this.entries.get(id)
  }

  // ─── Historical events (§12 steps 7 and 9) ───

  /**
   * Import legacy-session events (step 7). Idempotent by deterministic
   * eventId — re-importing never duplicates. Returns how many were added.
   */
  importHistoricalEvents(events: HistoricalEvent[]): number {
    const known = new Set(this.historicalEvents.map((e) => e.eventId))
    let added = 0
    for (const event of events) {
      if (known.has(event.eventId)) continue
      // §E: assign a monotonic sequence so a rebuild can catch up on events
      // committed while it is replaying.
      this.eventSequence += 1
      event.sequence = this.eventSequence
      this.historicalEvents.push(event)
      known.add(event.eventId)
      added++
    }
    if (added > 0) this.save()
    return added
  }

  /** Highest committed event sequence, optionally scoped to a document. */
  latestEventSequence(documentId?: string): number {
    let max = 0
    for (const event of this.historicalEvents) {
      if (documentId && event.documentId !== documentId) continue
      max = Math.max(max, event.sequence ?? 0)
    }
    return max
  }

  /** Restore the sequence counter from loaded events. */
  private syncEventSequence(): void {
    let max = 0
    for (const event of this.historicalEvents) max = Math.max(max, event.sequence ?? 0)
    this.eventSequence = max
  }

  /** Events committed after a sequence, optionally scoped to a document. */
  eventsAfter(documentId: string | undefined, sequence: number): HistoricalEvent[] {
    return this.historicalEvents.filter(
      (event) => (event.sequence ?? 0) > sequence && (!documentId || event.documentId === documentId)
    )
  }

  /**
   * Commit a live retained turn (user + assistant) as canonical events
   * (updates-2.md §A). The events and their projection-outbox items are
   * written in one ledger transaction by `save()`. This is the authoritative
   * retained history that a rebuild replays — Mnesis stays disposable.
   */
  commitRetainedTurn(
    documentId: string,
    sessionKey: string,
    user: string,
    assistant: string,
    agentName = 'assistant',
    now: number = Date.now()
  ): { userEventId: string | null; assistantEventId: string | null } {
    const base = `live_${now}_${Math.random().toString(36).slice(2, 9)}`
    const events: HistoricalEvent[] = []
    let userEventId: string | null = null
    let assistantEventId: string | null = null
    if (user.trim()) {
      userEventId = `${base}_u`
      events.push({
        eventId: userEventId, documentId, sessionId: sessionKey, agentName, role: 'user',
        content: user, timestamp: now, provenance: 'live', revisionKnown: false, toolEvidence: false
      })
    }
    if (assistant.trim()) {
      assistantEventId = `${base}_a`
      events.push({
        eventId: assistantEventId, documentId, sessionId: sessionKey, agentName, role: 'assistant',
        content: assistant, timestamp: now, provenance: 'live', revisionKnown: false, toolEvidence: false
      })
    }
    if (events.length === 0) return { userEventId: null, assistantEventId: null }
    this.importHistoricalEvents(events)
    return { userEventId, assistantEventId }
  }

  /** Pending projection work committed with retained events (§A). */
  pendingProjectionOutbox(): Array<{ id: number; documentId: string; eventId: string; sequence: number }> {
    if (!this.workerBacked) return this.ledger!.listOutbox('pending')
    return this.outboxCache.filter((o) => !this.pendingOutboxDone.has(o.id))
  }

  /** Mark projection-outbox items complete after a confirmed projection. */
  markProjectionOutboxProcessed(ids: number[]): number {
    if (!this.workerBacked) return this.ledger!.markOutboxDone(ids)
    let marked = 0
    for (const id of ids) {
      if (!this.pendingOutboxDone.has(id)) {
        this.pendingOutboxDone.add(id)
        marked++
      }
    }
    return marked
  }

  historicalEventsFor(documentId: string): HistoricalEvent[] {
    return this.historicalEvents.filter((e) => e.documentId === documentId)
  }

  allHistoricalEvents(): HistoricalEvent[] {
    return [...this.historicalEvents]
  }

  /** Remove imported historical events whose content re-derives a forgotten
   * memory (R7). Suppression fingerprints, not positions, decide what falls,
   * so unrelated events survive. Returns how many were removed.
   */
  purgeSuppressedEvents(documentId?: string): number {
    const before = this.historicalEvents.length
    this.historicalEvents = this.historicalEvents.filter((event) => {
      if (documentId && event.documentId !== documentId) return true
      return !this.isSuppressed(event.content, event.documentId)
    })
    const removed = before - this.historicalEvents.length
    if (removed > 0) this.save()
    return removed
  }

  /** Remove all imported historical events for a document (clear/revoke, R9). */
  removeHistoricalEvents(documentId?: string): number {
    const before = this.historicalEvents.length
    this.historicalEvents = documentId
      ? this.historicalEvents.filter((event) => event.documentId !== documentId)
      : []
    const removed = before - this.historicalEvents.length
    if (removed > 0) this.save()
    return removed
  }

  /** Approved entries eligible to feed a consolidation request (R19). */
  getEligibleForDocument(documentId: string): AgentMemoryEntry[] {
    return this.getForDocument(documentId).filter(isEligibleForPrompt)
  }

  /** Mark events as replayed into a projection (step 9) — idempotent. */
  markEventsProjected(eventIds: string[]): void {
    const ids = new Set(eventIds)
    let changed = false
    for (const event of this.historicalEvents) {
      if (ids.has(event.eventId) && !event.projected) {
        event.projected = true
        changed = true
      }
    }
    if (changed) this.save()
  }

  // ─── Migration backups (§12 step 12: explicit user removal) ───

  /** Backup files created by the migration, newest last. Never auto-removed. */
  listMigrationBackups(): Array<{ name: string; createdAt: number }> {
    const prefix = `${path.basename(this.filePath)}.backup-`
    try {
      return fs
        .readdirSync(path.dirname(this.filePath))
        .filter((name) => name.startsWith(prefix) && /^\d+(-\d+)?$/.test(name.slice(prefix.length)))
        .map((name) => ({ name, createdAt: parseInt(name.slice(prefix.length), 10) || 0 }))
        .sort((a, b) => a.createdAt - b.createdAt)
    } catch {
      return []
    }
  }

  /**
   * Remove one migration backup by exact name (step 12 — an explicit user
   * action, only after validation). Only files matching the strict backup
   * naming pattern beside the store file can be removed; the canonical
   * store and any unrelated file are untouchable through this method.
   */
  removeMigrationBackup(name: string): boolean {
    const prefix = `${path.basename(this.filePath)}.backup-`
    if (!name.startsWith(prefix)) return false
    if (!/^\d+(-\d+)?$/.test(name.slice(prefix.length))) return false
    const target = path.join(path.dirname(this.filePath), name)
    try {
      fs.rmSync(target, { force: true })
      return true
    } catch {
      return false
    }
  }

  /**
   * Create a uniquely named migration backup with an exclusive write (`wx`),
   * so parallel/repeat runs and timestamp collisions cannot overwrite an
   * existing backup (updates-2.md §A).
   */
  writeUniqueBackup(content: string): string {
    const base = `${this.filePath}.backup-${Date.now()}`
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt}`
      try {
        fs.writeFileSync(candidate, content, { encoding: 'utf-8', flag: 'wx' })
        return candidate
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      }
    }
    throw new Error('Unable to create a unique migration backup')
  }

  getForDocument(documentId: string): AgentMemoryEntry[] {    return Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId && e.scope !== 'global')
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getGlobal(): AgentMemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.scope === 'global')
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  retrieve(documentId: string, query: string, limit: number = 10, includeGlobal: boolean = true): AgentMemoryResult {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)

    // Include global entries only while cross-document consent is active
    // (R3). Candidates/rejected/superseded entries are excluded from prompts
    // until approved (memory.md §10.1); legacy entries remain eligible.
    const docEntries = Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId || (includeGlobal && e.scope === 'global'))
      .filter(isEligibleForPrompt)
      .sort((a, b) => b.createdAt - a.createdAt)

    if (docEntries.length === 0 || queryWords.length === 0) {
      return { entries: docEntries.slice(0, limit).map(e => ({ ...e, relevanceScore: 0 })), total: docEntries.length }
    }

    const now = Date.now()
    const scored = docEntries.map((entry) => {
      const contentWords = entry.content.toLowerCase().split(/\s+/)
      let keywordScore = 0
      for (const qw of queryWords) {
        if (contentWords.some((cw) => cw.includes(qw))) {
          keywordScore += 1
        }
      }
      keywordScore = keywordScore / queryWords.length  // normalize 0-1

      // Recency decay: half-life of 30 days
      const daysSinceCreation = (now - entry.createdAt) / (1000 * 60 * 60 * 24)
      const recencyScore = Math.exp(-daysSinceCreation / 30)

      // Combined score: keyword match 70%, recency 30%
      const combinedScore = keywordScore * 0.7 + recencyScore * 0.3

      return { entry, score: combinedScore }
    })

    const relevant = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)

    const entries = relevant.slice(0, limit).map((s) => ({
      ...s.entry,
      relevanceScore: s.score
    }))

    return { entries, total: relevant.length }
  }

  update(id: string, content: string): void {
    const entry = this.entries.get(id)
    if (entry) {
      entry.content = content
      this.save()
    }
  }

  delete(id: string): void {
    this.entries.delete(id)
    this.save()
  }

  /**
   * Forget an entry (memory.md §11 deletion flow). Unlike delete(), this:
   * - cascades to entries derived from it (consolidation summaries),
   * - records shingle-hash suppressions so automatic extraction cannot
   *   re-derive the same content (explicit user saves still can — that is
   *   the opt-back-in),
   * - reports what was removed so the caller can purge/rebuild projections.
   * The caller owns Mnesis disposal and index drops; this method is the
   * ledger half of the chain.
   */
  forget(id: string, now: number = Date.now()): { removedIds: string[]; suppressedCount: number } | null {
    const all = Array.from(this.entries.values())
    const cascade = planForgetCascade(id, all)
    if (!cascade) return null
    const removedIds = [cascade.directId, ...cascade.derivedIds]
    const removedEntries: AgentMemoryEntry[] = []
    const addedSuppressions: SuppressionRecord[] = []
    for (const rid of removedIds) {
      const entry = this.entries.get(rid)
      if (!entry) continue
      const hashes = shingleHashes(entry.content)
      if (hashes.length > 0) {
        const record: SuppressionRecord = {
          entryId: rid,
          documentId: entry.documentId,
          scope: entry.scope,
          hashes,
          forgottenAt: now
        }
        this.suppressions.push(record)
        addedSuppressions.push(record)
      }
      removedEntries.push(entry)
      this.entries.delete(rid)
    }
    try {
      this.save()
    } catch (err) {
      // Commit failed: roll the in-memory deletions and suppressions back so
      // nothing reports success from state the disk never saw (R13).
      for (const entry of removedEntries) this.entries.set(entry.id, entry)
      const added = new Set(addedSuppressions)
      this.suppressions = this.suppressions.filter((s) => !added.has(s))
      throw err
    }
    return { removedIds, suppressedCount: removedIds.length }
  }

  /**
   * Anti-re-learning gate for automatic extraction: is this candidate
   * content a re-derivation of forgotten content? Global suppressions apply
   * everywhere; document suppressions only to their own document.
   */
  isSuppressed(content: string, documentId?: string): boolean {
    const relevant = this.suppressions.filter(
      (s) => s.scope === 'global' || s.documentId === '__global__' || (documentId !== undefined && s.documentId === documentId)
    )
    return isSuppressedContent(content, relevant)
  }

  /**
   * Suppressions affecting a document — used to filter the transcript when
   * rebuilding its Mnesis projection after a forget.
   */
  suppressionsFor(documentId: string): SuppressionRecord[] {
    return this.suppressions.filter(
      (s) => s.scope === 'global' || s.documentId === '__global__' || s.documentId === documentId
    )
  }

  /**
   * Opt back in (§11/§D): clear suppressions so automatic extraction may resume
   * learning. Scoped to a document (or all documents), and optionally to a
   * single forgotten entry — clearing one entry must not reactivate unrelated
   * document/global suppressions.
   */
  clearSuppressions(documentId?: string, entryId?: string): number {
    const before = this.suppressions.length
    if (documentId === undefined) {
      this.suppressions = []
    } else {
      this.suppressions = this.suppressions.filter((s) => {
        const appliesToScope = s.documentId === documentId || s.scope === 'global'
        const matchesEntry = entryId === undefined || s.entryId === entryId
        return !(appliesToScope && matchesEntry)
      })
    }
    const cleared = before - this.suppressions.length
    if (cleared > 0) this.save()
    return cleared
  }

  /** Suppression records (ids only, no plaintext) for a document. */
  listSuppressionEntryIds(documentId?: string): string[] {
    return this.suppressions
      .filter((s) => documentId === undefined || s.documentId === documentId || s.scope === 'global')
      .map((s) => s.entryId)
  }

  /**
   * Collaboration access revoked (§14 fixture row): the document's memory is
   * forgotten wholesale — ledger cleared, everything suppressed against
   * re-learning — and the removed ids are returned so the caller can dispose
   * of the document's projections and index. Nothing about the document is
   * recalled afterwards.
   */
  revokeDocumentAccess(documentId: string, now: number = Date.now()): { removedIds: string[]; suppressedCount: number } {
    const removedIds: string[] = []
    for (const entry of Array.from(this.entries.values())) {
      if (entry.documentId === documentId) removedIds.push(entry.id)
    }
    for (const rid of removedIds) {
      const entry = this.entries.get(rid)
      if (!entry) continue
      const hashes = shingleHashes(entry.content)
      if (hashes.length > 0) {
        this.suppressions.push({ entryId: rid, documentId, scope: entry.scope, hashes, forgottenAt: now })
      }
      this.entries.delete(rid)
    }
    this.save()
    return { removedIds, suppressedCount: removedIds.length }
  }

  clearForDocument(documentId: string): void {
    const toRemove: string[] = []
    this.entries.forEach((entry, id) => {
      if (entry.documentId === documentId) {
        toRemove.push(id)
      }
    })
    for (const id of toRemove) {
      this.entries.delete(id)
    }
    this.save()
  }

  countForDocument(documentId: string): number {
    // Superseded entries are retained as evidence but don't count toward the
    // consolidation gate — otherwise the gate never closes after a consolidation
    return Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId && e.scope !== 'global' && e.approvalState !== 'superseded')
      .length
  }

  /**
   * Apply the retention policy (memory.md §11): permanently delete
   * rejected/superseded entries and stale unreviewed candidates older than
   * their configured windows. `null` windows keep evidence forever —
   * permanent deletion then only happens through explicit user action.
   * Returns what was removed so the caller can report it.
   */
  applyRetention(
    now: number,
    policy: { rejectedDays: number | null; candidateDays: number | null }
  ): { removedRejected: number; removedCandidates: number } {
    const cutoff = (days: number) => now - days * 24 * 60 * 60 * 1000
    let removedRejected = 0
    let removedCandidates = 0
    const remove: string[] = []
    for (const entry of Array.from(this.entries.values())) {
      const isArchived = entry.approvalState === 'rejected' || entry.approvalState === 'superseded'
      if (isArchived && policy.rejectedDays !== null && entry.createdAt < cutoff(policy.rejectedDays)) {
        remove.push(entry.id)
        removedRejected++
      } else if (
        entry.approvalState === 'candidate' &&
        policy.candidateDays !== null &&
        entry.createdAt < cutoff(policy.candidateDays)
      ) {
        remove.push(entry.id)
        removedCandidates++
      }
    }
    if (remove.length > 0) {
      for (const id of remove) this.entries.delete(id)
      this.save()
    }
    return { removedRejected, removedCandidates }
  }

  formatForPrompt(documentId: string, maxEntries: number = 5, includeGlobal: boolean = true): string {
    // Only approved (or legacy) entries are injected into prompts (memory.md §10.1)
    // Global preferences are withheld entirely when cross-document consent is
    // off, including records that predate the opt-out (R3).
    const globalEntries = includeGlobal ? this.getGlobal().filter(isEligibleForPrompt).slice(0, maxEntries) : []
    const docEntries = this.getForDocument(documentId).filter(isEligibleForPrompt).slice(0, maxEntries)

    const allEntries = [...globalEntries, ...docEntries]
    if (allEntries.length === 0) return ''

    const parts: string[] = []
    // Explicit learning instruction — tell the agent to apply these
    parts.push('The following are corrections and preferences from past interactions. Apply them to your current work. Do not repeat patterns that were previously rejected.')
    if (globalEntries.length > 0) {
      parts.push('Global preferences:')
      globalEntries.forEach((e) => parts.push(`- [${e.type}] ${e.content}`))
    }
    if (docEntries.length > 0) {
      parts.push('Document memory:')
      docEntries.forEach((e) => parts.push(`- [${e.type}] ${e.content}`))
    }
    return parts.join('\n')
  }

  /**
   * Detect 3+ document-scoped corrections that share keywords and add a
   * document-scoped candidate preference suggesting a consolidated rule
   * (memory.md §10.1). The original corrections are retained as evidence —
   * nothing is promoted to global scope or deleted without user approval.
   * Returns the number of suggestions created (0 or 1 per call).
   */
  clusterCorrections(documentId: string): number {
    const corrections = Array.from(this.entries.values())
      .filter((e) => e.type === 'correction' && e.documentId === documentId && e.scope !== 'global')

    if (corrections.length < 3) return 0

    const clusters = findCorrectionClusters(corrections)
    let suggested = 0
    for (const cluster of clusters) {
      // Skip if an equivalent suggestion already exists (avoid duplicates)
      const sample = buildClusterSuggestion(cluster)
      if (!sample) continue
      // Skip if an equivalent suggestion already exists (avoid duplicates).
      // Matches approved suggestions too, so re-approving a cluster later
      // doesn't recreate the same candidate.
      const existing = this.getForDocument(documentId).some(
        (e) =>
          e.type === 'preference' &&
          e.approvalState !== 'rejected' &&
          e.content === sample.content
      )
      if (existing) continue

      this.add(documentId, 'system', 'preference', sample.content, 'inferred', 'document', {
        sourceType: 'system',
        approvalState: 'candidate'
      })
      suggested++
    }

    return suggested
  }

  /**
   * Consolidate old entries into a summary.
   * Replaces entries older than `keepRecentCount` with a single summary entry.
   * @returns The IDs of entries that were consolidated (now deleted), or null if nothing to consolidate
   */
  consolidate(
    documentId: string,
    summaryContent: string,
    keepRecentCount: number = 10,
    allowSummary: boolean = true
  ): string[] | null {
    // Only approved, in-scope, current entries are consolidated. Rejected,
    // superseded, stale and candidate records are excluded (R19: a rejected
    // fact must not be reactivated by a batch summary).
    const allEntries = this.getForDocument(documentId).filter(isEligibleForPrompt)
    if (allEntries.length <= keepRecentCount) return null

    // Keep the most recent `keepRecentCount` entries; batch the rest.
    const toConsolidate = allEntries.slice(keepRecentCount)
    const consolidatedIds = toConsolidate.map((e) => e.id)

    // §F: a model-generated summary is a *candidate* requiring approval, and the
    // approved original sources stay active until the user approves the
    // replacement. A candidate cannot become a backdoor to prompt eligibility.
    // Do not create a second summary for the same source set.
    const sameSourceSet = (existing: AgentMemoryEntry): boolean => {
      const derived = existing.derivedFrom ?? []
      return derived.length === consolidatedIds.length &&
        consolidatedIds.every((id) => derived.includes(id))
    }
    const alreadySummarised = Array.from(this.entries.values()).some(
      (e) => e.type === 'summary' && e.approvalState !== 'rejected' && sameSourceSet(e)
    )
    if (alreadySummarised) return null

    // Commit-time guard (R14/§F): a source forgotten or revoked while the model
    // request was in flight taints the summary. Never publish a summary that
    // re-derives suppressed content; the originals remain active regardless.
    // `allowSummary` is false when the policy epoch changed during the request.
    if (allowSummary && !isSuppressedContent(summaryContent, this.suppressionsFor(documentId))) {
      const summaryEntry: AgentMemoryEntry = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        documentId,
        agentName: 'system',
        type: 'summary',
        content: summaryContent,
        createdAt: Date.now(),
        source: 'inferred',
        scope: 'document',
        // Candidate until the user approves the replacement.
        approvalState: 'candidate',
        sourceType: 'system',
        derivedFrom: consolidatedIds
      }
      this.entries.set(summaryEntry.id, summaryEntry)
    }
    this.save()

    // Report the batch size this consolidation covered.
    return consolidatedIds
  }

  applyTemplate(documentId: string, templateType: string, agentName: string = 'system', includeGlobal: boolean = true): number {
    const template = AgentMemoryStore.TEMPLATES[templateType]
    if (!template) return 0

    let count = 0
    for (const item of template) {
      // Global template preferences require cross-document consent (R4);
      // document-scoped items are unaffected.
      if (item.scope === 'global' && !includeGlobal) continue
      this.add(documentId, agentName, item.type, item.content, 'explicit', item.scope)
      count++
    }
    return count
  }

  static getTemplateTypes(): string[] {
    return Object.keys(AgentMemoryStore.TEMPLATES)
  }
}