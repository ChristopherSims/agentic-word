/**
 * Legacy shared Mnesis store retirement (updates-2.md §D).
 *
 * Older builds kept every document/profile in one shared SQLite store
 * (`userData/mnesis/sessions.db`). Per-generation databases replaced it. This
 * module only *detects* the old store and can *plan* its retirement; physical
 * removal is a separate, explicit, user-confirmed action — never automatic.
 *
 * Removal is confined to a `mnesis` directory and always includes the SQLite
 * sidecar files, so it can never touch unrelated data.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { LEGACY_SESSION_PROVENANCE, type HistoricalEvent } from './migration-sessions'

/** Conventional path of the legacy shared store. */
export function legacyMnesisDbPath(userDataDir: string): string {
  return path.join(userDataDir, 'mnesis', 'sessions.db')
}

export interface LegacyMnesisSession {
  sessionId: string
  /** The Mnesis `agent` field; newer sessions store the document id here. */
  agent: string | null
}

export interface LegacyRetirementPlan {
  /** Sessions whose owner is a known retained document (migratable). */
  attributable: LegacyMnesisSession[]
  /** Sessions with no attributable owner (require review or whole-store purge). */
  anonymous: LegacyMnesisSession[]
}

/**
 * Classify legacy sessions by whether their `agent` maps to a known document.
 * Anonymous sessions are never guessed from the active document.
 */
export function classifyLegacySessions(
  sessions: LegacyMnesisSession[],
  knownDocumentIds: Iterable<string>
): LegacyRetirementPlan {
  const known = new Set(knownDocumentIds)
  const attributable: LegacyMnesisSession[] = []
  const anonymous: LegacyMnesisSession[] = []
  for (const session of sessions) {
    if (session.agent && known.has(session.agent)) attributable.push(session)
    else anonymous.push(session)
  }
  return { attributable, anonymous }
}

export interface RemoveLegacyOptions {
  exists?: (p: string) => boolean
  remove?: (p: string) => void
}

/**
 * Convert legacy-store messages into canonical historical events. Deterministic
 * ids (`legacy_<sessionId>_<index>`) make re-running the migration idempotent.
 */
export function legacyMessagesToEvents(
  documentId: string,
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
  now: number = Date.now()
): HistoricalEvent[] {
  const events: HistoricalEvent[] = []
  let turnId = ''
  let turnIndex = -1
  messages.forEach((message, index) => {
    const content = (message.content ?? '').trim()
    if (!content || message.role === 'system') return
    if (message.role === 'user') {
      turnIndex++
      turnId = `legacy_turn_${sessionId}_${turnIndex}`
    }
    events.push({
      eventId: `legacy_${sessionId}_${index}`,
      documentId,
      sessionId,
      // The legacy store did not record an agent profile; label it honestly.
      agentName: 'legacy',
      role: message.role,
      content,
      timestamp: now,
      provenance: LEGACY_SESSION_PROVENANCE,
      revisionKnown: false,
      toolEvidence: false,
      turnId: message.role === 'assistant' ? (turnId || undefined) : turnId
    })
  })
  return events
}

/**
 * Remove a legacy store and its SQLite sidecars. Refuses any path whose parent
 * directory is not named `mnesis` (no traversal / wrong-file deletions). This
 * is only ever called after explicit user confirmation.
 */
export function removeLegacyMnesisStore(dbPath: string, opts: RemoveLegacyOptions = {}): { removed: string[] } {
  const resolved = path.resolve(dbPath)
  if (path.basename(path.dirname(resolved)) !== 'mnesis') {
    throw new Error('Refusing to remove a store outside a mnesis directory')
  }
  const exists = opts.exists ?? ((p: string) => fs.existsSync(p))
  const remove = opts.remove ?? ((p: string) => fs.rmSync(p, { force: true }))
  const sidecars = ['', '-wal', '-shm', '-journal'].map((suffix) => `${resolved}${suffix}`)
  const removed: string[] = []
  for (const target of sidecars) {
    if (exists(target)) {
      remove(target)
      removed.push(target)
    }
  }
  return { removed }
}
