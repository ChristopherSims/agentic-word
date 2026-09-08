// ─── Agent Long-Term Memory Store ───
// Per-document persistent memory for the Lexicon AI agent.
// Stores facts, preferences, decisions, corrections, and summaries.
// Supports document-scoped and global memory, recency-weighted retrieval,
// consolidation, editing, and document-type templates.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AgentMemoryEntry, AgentMemoryResult, AgentMemoryApprovalState, AgentMemorySourceType } from '../shared/types'
import { isEligibleForPrompt, findCorrectionClusters, buildClusterSuggestion, defaultApprovalState } from './memory/policy'
import { isSuppressedContent, planForgetCascade, shingleHashes, type SuppressionRecord } from './memory/deletion'
import {
  migrateLegacyData,
  verifyMigrationCounts,
  entriesChecksum,
  SCHEMA_VERSION,
  type QuarantinedRecord
} from './memory/migration'

export class AgentMemoryStore {
  private entries: Map<string, AgentMemoryEntry> = new Map()
  /** Ambiguous legacy records held for user review (§12 step 5) — not merged. */
  private quarantine: Array<QuarantinedRecord & { key: string }> = []
  /** Anti-re-learning fingerprints of forgotten content (§11) — hashes only. */
  private suppressions: SuppressionRecord[] = []
  private filePath: string

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

  constructor(filePath?: string) {
    // Path is injectable for tests; production uses the Electron userData dir.
    this.filePath = filePath ?? path.join(app.getPath('userData'), 'agent-memory.json')
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const rawText = fs.readFileSync(this.filePath, 'utf-8')
        const data = JSON.parse(rawText)
        if (data && typeof data === 'object' && !Array.isArray(data) && data.meta?.schemaVersion === SCHEMA_VERSION) {
          // Canonical store (memory.md §12 step 10: switched after migration).
          const arr: AgentMemoryEntry[] = data.entries || []
          for (const e of arr) {
            // Backward compat: old entries without scope get 'document'
            if (!e.scope) e.scope = 'document'
            this.entries.set(e.id, e)
          }
          this.suppressions = Array.isArray(data.suppressions) ? (data.suppressions as SuppressionRecord[]) : []
          this.quarantine = this.synthesizeQuarantineKeys(data.quarantine || [])
          return
        }
        this.migrateLegacyFile(rawText, data)
      }
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
    try {
      fs.writeFileSync(`${this.filePath}.backup-${Date.now()}`, rawText, 'utf-8')
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
    this.save()
    console.log(
      `[AgentMemoryStore] Migrated legacy memory: ${result.entries.length} entries, ` +
      `${result.quarantined.length} quarantined for review, ${result.skippedInvalid} invalid skipped`
    )
  }

  /** Stable review keys for quarantined records (original ids may be missing). */
  private synthesizeQuarantineKeys(records: QuarantinedRecord[]): Array<QuarantinedRecord & { key: string }> {
    return records.map((r, i) => ({
      ...r,
      key: typeof r.record.id === 'string' && r.record.id ? `id:${r.record.id}` : `q:${i}`
    }))
  }

  private save(): void {
    try {
      const arr = Array.from(this.entries.values())
      fs.writeFileSync(this.filePath, JSON.stringify({
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
        suppressions: this.suppressions
      }), 'utf-8')
    } catch {
      console.warn('Failed to persist agent memory to disk')
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
    if (entry) {
      entry.approvalState = state
      this.save()
    }
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

  getForDocument(documentId: string): AgentMemoryEntry[] {    return Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId && e.scope !== 'global')
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getGlobal(): AgentMemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.scope === 'global')
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  retrieve(documentId: string, query: string, limit: number = 10): AgentMemoryResult {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)

    // Include both document-scoped and global entries for retrieval.
    // Candidates/rejected/superseded entries are excluded from prompts
    // until approved (memory.md §10.1); legacy entries remain eligible.
    const docEntries = Array.from(this.entries.values())
      .filter((e) => (e.documentId === documentId || e.scope === 'global'))
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
    for (const rid of removedIds) {
      const entry = this.entries.get(rid)
      if (!entry) continue
      const hashes = shingleHashes(entry.content)
      if (hashes.length > 0) {
        this.suppressions.push({
          entryId: rid,
          documentId: entry.documentId,
          scope: entry.scope,
          hashes,
          forgottenAt: now
        })
      }
      this.entries.delete(rid)
    }
    this.save()
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
   * Opt back in (§11): clear suppressions so automatic extraction may
   * resume learning. Scoped to a document, or all of them.
   */
  clearSuppressions(documentId?: string): number {
    const before = this.suppressions.length
    this.suppressions = documentId
      ? this.suppressions.filter((s) => s.documentId !== documentId && s.scope !== 'global')
      : []
    const cleared = before - this.suppressions.length
    if (cleared > 0) this.save()
    return cleared
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

  formatForPrompt(documentId: string, maxEntries: number = 5): string {
    // Only approved (or legacy) entries are injected into prompts (memory.md §10.1)
    const globalEntries = this.getGlobal().filter(isEligibleForPrompt).slice(0, maxEntries)
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
    keepRecentCount: number = 10
  ): string[] | null {
    // Only active entries are consolidated — already-superseded entries are
    // retained as evidence and never re-processed (prevents duplicate summaries)
    const allEntries = this.getForDocument(documentId).filter((e) => e.approvalState !== 'superseded')
    if (allEntries.length <= keepRecentCount) return null

    // Keep the most recent `keepRecentCount` entries, consolidate the rest.
    // memory.md §4: consolidated entries are superseded rather than deleted so
    // the original evidence remains available for review and deletion policy.
    const toConsolidate = allEntries.slice(keepRecentCount)
    const consolidatedIds = toConsolidate.map((e) => e.id)

    // Mark old entries superseded — excluded from prompts/retrieval but retained
    for (const id of consolidatedIds) {
      const entry = this.entries.get(id)
      if (entry) entry.approvalState = 'superseded'
    }

    // Add summary entry — carries lineage so forgetting a source cascades
    // to the summary that absorbed it (§11 deletion flow).
    const summaryEntry: AgentMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId,
      agentName: 'system',
      type: 'summary',
      content: summaryContent,
      createdAt: Date.now(),
      source: 'inferred',
      scope: 'document',
      approvalState: 'approved',
      sourceType: 'system',
      derivedFrom: consolidatedIds
    }
    this.entries.set(summaryEntry.id, summaryEntry)
    this.save()

    return consolidatedIds
  }

  applyTemplate(documentId: string, templateType: string, agentName: string = 'system'): number {
    const template = AgentMemoryStore.TEMPLATES[templateType]
    if (!template) return 0

    let count = 0
    for (const item of template) {
      this.add(documentId, agentName, item.type, item.content, 'explicit', item.scope)
      count++
    }
    return count
  }

  static getTemplateTypes(): string[] {
    return Object.keys(AgentMemoryStore.TEMPLATES)
  }
}