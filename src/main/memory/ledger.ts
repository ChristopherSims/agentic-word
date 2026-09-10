/**
 * AgentLedger — the Lexicon-owned transactional SQLite store (updates-2.md §A).
 *
 * Durability contract:
 * - A retained event / memory entry / suppression set is committed inside one
 *   SQLite transaction; readers never observe a partial write.
 * - The compatibility JSON files remain a facade during migration. The store
 *   writes the JSON mirror first (the legacy commit point) and only then
 *   commits the ledger, so an injected disk failure still rejects the
 *   operation and leaves the ledger at the previous committed state.
 * - Each operation opens and closes its own connection, so no file handle
 *   outlives a call (required for predictable deletion on Windows).
 */

import { DatabaseSync } from 'node:sqlite'
import * as fs from 'fs'
import * as path from 'path'
import type { AgentMemoryEntry, AgentSession, ArtifactCounts, DeletionJobStatus, DeletionKind, DeletionState } from '../../shared/types'
import type { SuppressionRecord } from './deletion'
import type { HistoricalEvent } from './migration-sessions'
import type { QuarantinedRecord } from './migration'
import { applyLedgerMigrations, LEDGER_SCHEMA_VERSION } from './ledger-migrations'

export { LEDGER_SCHEMA_VERSION }

export interface MemoryLedgerState {
  entries: AgentMemoryEntry[]
  suppressions: SuppressionRecord[]
  historicalEvents: HistoricalEvent[]
  quarantine: Array<QuarantinedRecord & { key: string }>
}

/** §A: provenance record for one legacy import, committed with its state. */
export interface MemoryMigrationManifest {
  sourcePath: string | null
  sourceHash: string
  importedAt: number
  entries: number
  events: number
  quarantined: number
  skipped: number
  entriesChecksum: string | null
}

type Row = Record<string, unknown>

const MEMORY_META_KEY = 'memory_initialized'
const SESSIONS_META_KEY = 'sessions_initialized'

/** Authoritative per-document protection/revocation policy (updates-2.md §B). */
export interface DocumentPolicy {
  documentId: string
  branchId: string | null
  protected: boolean
  revoked: boolean
  policyEpoch: number
  updatedAt: number
}

export type ProjectionGenerationState = 'staging' | 'active' | 'superseded' | 'disposed'

/**
 * Metadata for one disposable Mnesis projection generation (updates-2.md §E).
 * The ledger owns the generation identity and lifecycle; the Python worker
 * owns the generation's own database files.
 */
export interface ProjectionGeneration {
  generationId: string
  documentId: string
  branchId: string | null
  sessionId: string | null
  profileId: string | null
  sourceEpoch: number
  ledgerSequence: number
  mnesisSessionId: string | null
  state: ProjectionGenerationState
  createdAt: number
}

/** Non-entry control state persisted in the ledger (jobs, policy, generations). */
export interface ControlSnapshot {
  jobs: DeletionJobStatus[]
  policies: DocumentPolicy[]
  generations: ProjectionGeneration[]
}

function mapProjectionGeneration(row: Row): ProjectionGeneration {
  return {
    generationId: String(row.generation_id),
    documentId: String(row.document_id),
    branchId: row.branch_id == null ? null : String(row.branch_id),
    sessionId: row.session_id == null ? null : String(row.session_id),
    profileId: row.profile_id == null ? null : String(row.profile_id),
    sourceEpoch: Number(row.source_epoch ?? 0),
    ledgerSequence: Number(row.ledger_sequence ?? 0),
    mnesisSessionId: row.mnesis_session_id == null ? null : String(row.mnesis_session_id),
    state: String(row.state) as ProjectionGenerationState,
    createdAt: Number(row.created_at)
  }
}

function mapDocumentPolicy(row: Row): DocumentPolicy {
  return {
    documentId: String(row.document_id),
    branchId: row.branch_id == null ? null : String(row.branch_id),
    protected: Number(row.protected) === 1,
    revoked: Number(row.revoked) === 1,
    policyEpoch: Number(row.policy_epoch ?? 0),
    updatedAt: Number(row.updated_at)
  }
}

export function emptyArtifactCounts(): ArtifactCounts {
  return { entries: 0, events: 0, suppressions: 0, sessions: 0, projections: 0 }
}

function mapDeletionJob(row: Row): DeletionJobStatus {
  const detail = row.detail ? (JSON.parse(String(row.detail)) as {
    kind?: DeletionKind
    removed?: ArtifactCounts
    remaining?: string[]
    code?: string | null
  }) : {}
  return {
    operationId: String(row.operation_id),
    kind: (detail.kind ?? 'clear-document') as DeletionKind,
    documentId: row.document_id == null ? null : String(row.document_id),
    state: String(row.state) as DeletionState,
    removed: detail.removed ?? emptyArtifactCounts(),
    remaining: detail.remaining ?? [],
    code: detail.code ?? null,
    requestedAt: Number(row.requested_at),
    updatedAt: Number(row.updated_at)
  }
}

export class AgentLedger {
  constructor(private readonly dbPath: string) {}

  // ─── connection / transactions ───

  private open(): DatabaseSync {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    const db = new DatabaseSync(this.dbPath)
    // Forgotten rows are overwritten on delete, not merely unlinked.
    db.exec('PRAGMA secure_delete = ON')
    db.exec('PRAGMA foreign_keys = ON')
    // Avoid an fsync per commit in the test/hot path; WAL is not required for
    // correctness here and the JSON mirror remains the legacy commit point.
    db.exec('PRAGMA synchronous = NORMAL')
    this.ensureSchema(db)
    return db
  }

  /** Apply migrations only when the recorded schema is behind (cheap no-op otherwise). */
  private ensureSchema(db: DatabaseSync): void {
    const manifest = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_manifest'")
      .get() as { name?: string } | undefined
    if (manifest?.name) {
      const row = db.prepare('SELECT MAX(version) AS version FROM migration_manifest').get() as
        | { version: number | null }
        | undefined
      if ((row?.version ?? 0) >= LEDGER_SCHEMA_VERSION) return
    }
    applyLedgerMigrations(db)
  }

  private write<T>(fn: (db: DatabaseSync) => T): T {
    const db = this.open()
    try {
      db.exec('BEGIN IMMEDIATE')
      const result = fn(db)
      db.exec('COMMIT')
      return result
    } catch (err) {
      try { db.exec('ROLLBACK') } catch { /* transaction already aborted */ }
      throw err
    } finally {
      db.close()
    }
  }

  private read<T>(fn: (db: DatabaseSync) => T): T {
    const db = this.open()
    try {
      return fn(db)
    } finally {
      db.close()
    }
  }

  private getMeta(db: DatabaseSync, key: string): string | null {
    const row = db.prepare('SELECT value FROM ledger_meta WHERE key = ?').get(key) as { value?: string } | undefined
    return row?.value ?? null
  }

  private setMeta(db: DatabaseSync, key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO ledger_meta (key, value) VALUES (?, ?)').run(key, value)
  }

  /** True once a namespaced dataset has been materialized in the ledger. */
  isInitialized(metaKey: string = MEMORY_META_KEY): boolean {
    if (!fs.existsSync(this.dbPath)) return false
    return this.read((db) => this.getMeta(db, metaKey) !== null)
  }

  /** Current schema version recorded in the ledger (0 when absent). */
  schemaVersion(): number {
    if (!fs.existsSync(this.dbPath)) return 0
    return this.read((db) => {
      const row = db.prepare('SELECT MAX(version) AS version FROM migration_manifest').get() as
        | { version: number | null }
        | undefined
      return row?.version ?? 0
    })
  }

  // ─── memory state ───

  loadMemoryState(): MemoryLedgerState {
    return this.read((db) => {
      const entryRows = db.prepare('SELECT * FROM memory_entries').all() as Row[]
      const suppressionRows = db.prepare('SELECT * FROM suppressions').all() as Row[]
      const eventRows = db.prepare('SELECT * FROM events').all() as Row[]
      const quarantineRows = db.prepare('SELECT * FROM quarantine').all() as Row[]

      const entries: AgentMemoryEntry[] = entryRows.map((r) => {
        const derived = r.derived_from
        return {
          id: String(r.id),
          documentId: String(r.document_id),
          agentName: String(r.agent_name ?? 'system'),
          type: String(r.type) as AgentMemoryEntry['type'],
          content: String(r.content),
          createdAt: Number(r.created_at),
          source: r.source === 'explicit' ? 'explicit' : r.source === 'inferred' ? 'inferred' : undefined,
          scope: r.scope === 'global' ? 'global' : 'document',
          approvalState: (r.approval_state ?? undefined) as AgentMemoryEntry['approvalState'],
          sourceType: (r.source_type ?? undefined) as AgentMemoryEntry['sourceType'],
          runId: r.run_id == null ? undefined : String(r.run_id),
          originKey: r.origin_key == null ? undefined : String(r.origin_key),
          derivedFrom: typeof derived === 'string' && derived.length > 0 ? JSON.parse(derived) : undefined
        }
      })

      const suppressions: SuppressionRecord[] = suppressionRows.map((r) => ({
        entryId: String(r.entry_id),
        documentId: String(r.document_id),
        scope: r.scope === 'global' ? 'global' : 'document',
        hashes: JSON.parse(String(r.hashes)),
        forgottenAt: Number(r.forgotten_at)
      }))

      const historicalEvents: HistoricalEvent[] = eventRows.map((r) => ({
        eventId: String(r.event_id),
        documentId: String(r.document_id),
        sessionId: String(r.session_id),
        agentName: String(r.agent_name ?? 'system'),
        role: String(r.role),
        content: String(r.content),
        timestamp: Number(r.timestamp),
        provenance: String(r.provenance) as HistoricalEvent['provenance'],
        revisionKnown: false,
        toolEvidence: false,
        projected: Number(r.projected) === 1,
        sequence: Number(r.sequence ?? 0)
      }))

      const quarantine: Array<QuarantinedRecord & { key: string }> = quarantineRows.map((r) => ({
        key: String(r.key),
        reason: String(r.reason) as QuarantinedRecord['reason'],
        originKey: r.origin_key == null ? null : String(r.origin_key),
        record: JSON.parse(String(r.record))
      }))

      return { entries, suppressions, historicalEvents, quarantine }
    })
  }

  writeMemoryState(state: MemoryLedgerState, manifest?: MemoryMigrationManifest): void {
    this.write((db) => {
      db.exec('DELETE FROM memory_entries')
      db.exec('DELETE FROM suppressions')
      db.exec('DELETE FROM events')
      db.exec('DELETE FROM quarantine')
      db.exec('DELETE FROM source_edges')

      const insertEntry = db.prepare(
        `INSERT INTO memory_entries
          (id, document_id, agent_name, type, content, created_at, source, scope, approval_state, source_type, run_id, origin_key, derived_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const e of state.entries) {
        insertEntry.run(
          e.id,
          e.documentId,
          e.agentName ?? null,
          e.type,
          e.content,
          e.createdAt,
          e.source ?? null,
          e.scope,
          e.approvalState ?? null,
          e.sourceType ?? null,
          e.runId ?? null,
          e.originKey ?? null,
          e.derivedFrom && e.derivedFrom.length > 0 ? JSON.stringify(e.derivedFrom) : null
        )
        for (const source of e.derivedFrom ?? []) {
          db.prepare('INSERT OR IGNORE INTO source_edges (from_id, to_id, relation) VALUES (?, ?, ?)').run(
            e.id,
            source,
            'derived-from'
          )
        }
      }

      const insertSuppression = db.prepare(
        'INSERT INTO suppressions (entry_id, document_id, scope, hashes, forgotten_at) VALUES (?, ?, ?, ?, ?)'
      )
      for (const s of state.suppressions) {
        insertSuppression.run(s.entryId, s.documentId, s.scope, JSON.stringify(s.hashes), s.forgottenAt)
      }

      const insertEvent = db.prepare(
        `INSERT INTO events
          (event_id, document_id, session_id, agent_name, role, content, timestamp, provenance, revision_known, tool_evidence, projected, sequence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const ev of state.historicalEvents) {
        insertEvent.run(
          ev.eventId,
          ev.documentId,
          ev.sessionId,
          ev.agentName ?? null,
          ev.role,
          ev.content,
          ev.timestamp,
          ev.provenance,
          ev.revisionKnown ? 1 : 0,
          ev.toolEvidence ? 1 : 0,
          ev.projected ? 1 : 0,
          ev.sequence ?? 0
        )
      }

      const insertQuarantine = db.prepare(
        'INSERT INTO quarantine (key, reason, origin_key, record) VALUES (?, ?, ?, ?)'
      )
      for (const q of state.quarantine) {
        insertQuarantine.run(q.key, q.reason, q.originKey ?? null, JSON.stringify(q.record))
      }

      // §A: retained events and their projection-outbox items commit together
      // in this one transaction. The outbox is derived on write: one pending
      // item per not-yet-projected event.
      db.exec('DELETE FROM outbox')
      const insertOutbox = db.prepare(
        "INSERT INTO outbox (document_id, kind, payload, state, created_at) VALUES (?, 'project-event', ?, 'pending', ?)"
      )
      for (const ev of state.historicalEvents) {
        if (ev.projected) continue
        insertOutbox.run(
          ev.documentId,
          JSON.stringify({ eventId: ev.eventId, sequence: ev.sequence ?? 0 }),
          Date.now()
        )
      }

      // §A: the migration manifest is recorded in the same transaction as the
      // imported state it describes.
      if (manifest) {
        db.prepare(
          `INSERT INTO memory_migration_manifest
            (source_path, source_hash, imported_at, entries, events, quarantined, skipped, entries_checksum)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          manifest.sourcePath,
          manifest.sourceHash,
          manifest.importedAt,
          manifest.entries,
          manifest.events,
          manifest.quarantined,
          manifest.skipped,
          manifest.entriesChecksum
        )
      }

      this.setMeta(db, MEMORY_META_KEY, String(Date.now()))
    })
  }

  // ─── projection outbox (updates-2.md §A) ───

  listOutbox(state: 'pending' | 'done' = 'pending'): Array<{ id: number; documentId: string; eventId: string; sequence: number }> {
    return this.read((db) => {
      const rows = db
        .prepare('SELECT id, document_id, payload FROM outbox WHERE state = ? ORDER BY id')
        .all(state) as Row[]
      return rows.map((r) => {
        const payload = r.payload ? (JSON.parse(String(r.payload)) as { eventId?: string; sequence?: number }) : {}
        return {
          id: Number(r.id),
          documentId: String(r.document_id),
          eventId: payload.eventId ?? '',
          sequence: payload.sequence ?? 0
        }
      })
    })
  }

  /** Mark outbox items done (projection confirmed). Returns how many changed. */
  markOutboxDone(ids: number[]): number {
    if (ids.length === 0) return 0
    return this.write((db) => {
      const stmt = db.prepare("UPDATE outbox SET state = 'done' WHERE id = ? AND state = 'pending'")
      let changed = 0
      for (const id of ids) changed += Number(stmt.run(id).changes)
      return changed
    })
  }

  /** Recorded legacy-import manifests, newest last (§A). */
  listMigrationManifests(): MemoryMigrationManifest[] {
    return this.read((db) => {
      const rows = db
        .prepare('SELECT * FROM memory_migration_manifest ORDER BY id')
        .all() as Row[]
      return rows.map((r) => ({
        sourcePath: r.source_path == null ? null : String(r.source_path),
        sourceHash: String(r.source_hash),
        importedAt: Number(r.imported_at),
        entries: Number(r.entries),
        events: Number(r.events),
        quarantined: Number(r.quarantined),
        skipped: Number(r.skipped),
        entriesChecksum: r.entries_checksum == null ? null : String(r.entries_checksum)
      }))
    })
  }

  // ─── sessions ───

  loadSessions(): AgentSession[] {
    return this.read((db) => {
      const rows = db.prepare('SELECT * FROM sessions').all() as Row[]
      return rows.map((r) => ({
        id: String(r.id),
        documentId: String(r.document_id),
        agentName: String(r.agent_name),
        systemPrompt: String(r.system_prompt ?? ''),
        messages: JSON.parse(String(r.messages)),
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at)
      }))
    })
  }

  writeSessions(sessions: AgentSession[]): void {
    this.write((db) => {
      db.exec('DELETE FROM sessions')
      const insert = db.prepare(
        `INSERT INTO sessions (id, document_id, agent_name, system_prompt, messages, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      for (const s of sessions) {
        insert.run(
          s.id,
          s.documentId,
          s.agentName,
          s.systemPrompt ?? null,
          JSON.stringify(s.messages),
          s.createdAt,
          s.updatedAt
        )
      }
      this.setMeta(db, SESSIONS_META_KEY, String(Date.now()))
    })
  }

  static sessionsMetaKey(): string {
    return SESSIONS_META_KEY
  }

  /**
   * Compact the active database file (updates-2.md §D): checkpoint any WAL and
   * VACUUM so deleted plaintext does not linger in free pages. `VACUUM` cannot
   * run inside a transaction, so this opens a plain connection.
   */
  compact(): void {
    const db = this.open()
    try {
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch { /* not in WAL mode */ }
      db.exec('VACUUM')
    } finally {
      db.close()
    }
  }

  // ─── deletion jobs (updates-2.md §D) ───
  createDeletionJob(operationId: string, kind: DeletionKind, documentId: string | null, now: number = Date.now()): void {
    this.write((db) => {
      db.prepare(
        `INSERT OR REPLACE INTO deletion_jobs (operation_id, document_id, state, requested_at, updated_at, detail)
         VALUES (?, ?, 'pending', ?, ?, ?)`
      ).run(operationId, documentId, now, now, JSON.stringify({ kind, removed: emptyArtifactCounts(), remaining: [], code: null }))
    })
  }

  updateDeletionJob(
    operationId: string,
    state: DeletionState,
    removed: ArtifactCounts,
    remaining: string[],
    code: string | null,
    now: number = Date.now()
  ): void {
    this.write((db) => {
      const existing = db
        .prepare('SELECT detail FROM deletion_jobs WHERE operation_id = ?')
        .get(operationId) as { detail?: string } | undefined
      const parsed = existing?.detail ? (JSON.parse(existing.detail) as { kind?: DeletionKind }) : {}
      db.prepare('UPDATE deletion_jobs SET state = ?, updated_at = ?, detail = ? WHERE operation_id = ?').run(
        state,
        now,
        JSON.stringify({ kind: parsed.kind ?? 'clear-document', removed, remaining, code }),
        operationId
      )
    })
  }

  getDeletionJob(operationId: string): DeletionJobStatus | null {
    return this.read((db) => {
      const row = db.prepare('SELECT * FROM deletion_jobs WHERE operation_id = ?').get(operationId) as Row | undefined
      return row ? mapDeletionJob(row) : null
    })
  }

  listDeletionJobs(state?: DeletionState): DeletionJobStatus[] {
    return this.read((db) => {
      const rows = state
        ? (db.prepare('SELECT * FROM deletion_jobs WHERE state = ? ORDER BY requested_at').all(state) as Row[])
        : (db.prepare('SELECT * FROM deletion_jobs ORDER BY requested_at').all() as Row[])
      return rows.map(mapDeletionJob)
    })
  }

  /** Upsert a complete deletion-job row (used to replay a cached control patch). */
  putDeletionJob(job: DeletionJobStatus): void {
    this.write((db) => {
      db.prepare(
        `INSERT OR REPLACE INTO deletion_jobs (operation_id, document_id, state, requested_at, updated_at, detail)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        job.operationId,
        job.documentId,
        job.state,
        job.requestedAt,
        job.updatedAt,
        JSON.stringify({ kind: job.kind, removed: job.removed, remaining: job.remaining, code: job.code })
      )
    })
  }

  // ─── document policy (updates-2.md §B) ───

  getDocumentPolicy(documentId: string): DocumentPolicy | null {
    return this.read((db) => {
      const row = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(documentId) as Row | undefined
      return row ? mapDocumentPolicy(row) : null
    })
  }

  listDocumentPolicies(): DocumentPolicy[] {
    return this.read((db) => {
      const rows = db.prepare('SELECT * FROM documents ORDER BY document_id').all() as Row[]
      return rows.map(mapDocumentPolicy)
    })
  }

  upsertDocumentPolicy(
    documentId: string,
    updates: Partial<Pick<DocumentPolicy, 'branchId' | 'protected' | 'revoked' | 'policyEpoch'>>,
    now: number = Date.now()
  ): void {
    this.write((db) => {
      const row = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(documentId) as Row | undefined
      const current = row ? mapDocumentPolicy(row) : null
      const next: DocumentPolicy = {
        documentId,
        branchId: updates.branchId !== undefined ? updates.branchId : (current?.branchId ?? null),
        // Renderer flags may tighten protection but never downgrade it (§B).
        protected: updates.protected === false && current?.revoked
          ? true
          : (updates.protected ?? current?.protected ?? false),
        revoked: updates.revoked ?? current?.revoked ?? false,
        policyEpoch: updates.policyEpoch ?? current?.policyEpoch ?? 0,
        updatedAt: now
      }
      db.prepare(
        `INSERT OR REPLACE INTO documents (document_id, branch_id, protected, revoked, policy_epoch, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        next.documentId,
        next.branchId,
        next.protected ? 1 : 0,
        next.revoked ? 1 : 0,
        next.policyEpoch,
        next.updatedAt
      )
    })
  }

  // ─── projection generations (updates-2.md §E) ───

  upsertProjectionGeneration(generation: ProjectionGeneration): void {
    this.write((db) => {
      db.prepare(
        `INSERT OR REPLACE INTO projection_generations
          (generation_id, document_id, branch_id, session_id, profile_id, source_epoch, ledger_sequence, mnesis_session_id, state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        generation.generationId,
        generation.documentId,
        generation.branchId,
        generation.sessionId,
        generation.profileId,
        generation.sourceEpoch,
        generation.ledgerSequence,
        generation.mnesisSessionId,
        generation.state,
        generation.createdAt
      )
    })
  }

  getProjectionGeneration(generationId: string): ProjectionGeneration | null {
    return this.read((db) => {
      const row = db
        .prepare('SELECT * FROM projection_generations WHERE generation_id = ?')
        .get(generationId) as Row | undefined
      return row ? mapProjectionGeneration(row) : null
    })
  }

  listProjectionGenerations(documentId?: string): ProjectionGeneration[] {
    return this.read((db) => {
      const rows = documentId
        ? (db.prepare('SELECT * FROM projection_generations WHERE document_id = ? ORDER BY created_at').all(documentId) as Row[])
        : (db.prepare('SELECT * FROM projection_generations ORDER BY created_at').all() as Row[])
      return rows.map(mapProjectionGeneration)
    })
  }

  setProjectionGenerationState(generationId: string, state: ProjectionGenerationState, now: number = Date.now()): void {
    this.write((db) => {
      db.prepare('UPDATE projection_generations SET state = ? WHERE generation_id = ?').run(state, generationId)
      void now
    })
  }

  /**
   * Atomically activate one generation for a document, superseding all other
   * non-disposed generations. Readers switch at one commit boundary (R11/§E).
   */
  activateProjectionGeneration(generationId: string): void {
    this.write((db) => {
      const row = db
        .prepare('SELECT * FROM projection_generations WHERE generation_id = ?')
        .get(generationId) as Row | undefined
      if (!row) throw new Error(`Unknown projection generation: ${generationId}`)
      db.prepare(
        "UPDATE projection_generations SET state = 'superseded' WHERE document_id = ? AND state = 'active' AND generation_id <> ?"
      ).run(String(row.document_id), generationId)
      db.prepare("UPDATE projection_generations SET state = 'active' WHERE generation_id = ?").run(generationId)
    })
  }
}
