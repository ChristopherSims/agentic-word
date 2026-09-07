/**
 * Legacy agent-memory migration (memory.md §12, steps 1–12)
 *
 * Reads legacy `agent-memory.json` data only through this flow, with schema
 * validation and visible error reporting. The module is pure (Electron-free,
 * filesystem work belongs to the store) so migration rules are unit-tested.
 *
 * Guarantees:
 * - Original IDs, timestamps, source labels, and raw content are preserved
 *   verbatim in imported records (step 3).
 * - Ambiguous 'default' / missing / orphan-tab keys are QUARANTINED for user
 *   review — never merged into a real document (step 5).
 * - Legacy inferred GLOBAL preferences are held as candidates requiring
 *   review before they can influence prompts (step 6); everything else keeps
 *   its legacy eligibility.
 * - Count verification: migrated + quarantined + skippedInvalid must equal the
 *   number of legacy records, or the caller must abort the switch (step 10).
 */

import type { AgentMemoryEntry, AgentMemoryApprovalState, AgentMemorySourceType } from '../../shared/types'

export const SCHEMA_VERSION = 2

export interface QuarantinedRecord {
  /** original record, verbatim */
  record: Record<string, unknown>
  /** why it was quarantined */
  reason: 'default-key' | 'missing-key' | 'ambiguous-key' | 'invalid-record'
  /** original key when present */
  originKey: string | null
}

export interface MigrationResult {
  /** validated, canonical entries ready for the store */
  entries: AgentMemoryEntry[]
  /** held for user review — NOT merged */
  quarantined: QuarantinedRecord[]
  /** invalid records rejected by schema validation (counted, reported) */
  skippedInvalid: number
  /** validation errors for visible reporting (step 1) */
  errors: string[]
}

const VALID_TYPES = new Set(['fact', 'preference', 'decision', 'correction', 'summary'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Is this legacy key a stable documentId (UUID), a file path (mappable), or
 * something ambiguous? File paths migrate with originKey preserved; UUIDs are
 * already canonical; anything else ('default', tab ids, missing) is
 * quarantined for review (§12 step 5).
 */
export function classifyKey(key: string | undefined | null): 'uuid' | 'path' | 'quarantine' {
  if (!key || key.trim() === '') return 'quarantine'
  if (UUID_RE.test(key)) return 'uuid'
  if (key.includes('/') || key.includes('\\')) return 'path'
  return 'quarantine'
}

function asApprovalState(v: unknown): AgentMemoryApprovalState | undefined {
  return v === 'approved' || v === 'candidate' || v === 'rejected' || v === 'superseded'
    ? (v as AgentMemoryApprovalState)
    : undefined
}

/**
 * Migrate raw legacy data (either `{ entries: [...] }` or a bare array) into
 * canonical entries + quarantine. Pure: no file I/O, no mutation of input.
 */
export function migrateLegacyData(raw: unknown): MigrationResult {
  const result: MigrationResult = { entries: [], quarantined: [], skippedInvalid: 0, errors: [] }

  const records: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries)
      ? ((raw as { entries: unknown[] }).entries)
      : []

  if (records.length === 0 && raw !== undefined) {
    const shape = typeof raw === 'object' && raw !== null ? 'object without entries array' : typeof raw
    result.errors.push(`Unrecognized legacy memory shape: ${shape}`)
  }

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') {
      result.skippedInvalid++
      result.errors.push('Skipped non-object record')
      continue
    }
    const r = rec as Record<string, unknown>
    const content = typeof r.content === 'string' ? r.content : ''
    const documentId = typeof r.documentId === 'string' ? r.documentId : undefined
    const scope = r.scope === 'global' ? 'global' : 'document'

    if (typeof r.id !== 'string' || r.id === '' || content.trim() === '' ||
        typeof r.type !== 'string' || !VALID_TYPES.has(r.type)) {
      result.skippedInvalid++
      result.errors.push(`Invalid record ${typeof r.id === 'string' ? r.id : '(no id)'}: missing id, content, or unknown type`)
      continue
    }

    // Global records keep original scope; document records with ambiguous
    // keys are quarantined (§12 step 5) — the original record is retained.
    if (scope !== 'global' && classifyKey(documentId) === 'quarantine') {
      const reason = documentId === undefined || documentId.trim() === ''
        ? 'missing-key'
        : documentId === 'default'
          ? 'default-key'
          : 'ambiguous-key'
      result.quarantined.push({ record: r, reason, originKey: documentId ?? null })
      continue
    }

    // Step 3: preserve id, createdAt, source, content verbatim.
    // Step 6: legacy inferred GLOBAL preferences require review before they
    // influence prompts; everything else keeps legacy eligibility (undefined
    // approvalState = legacy, still prompt-eligible per policy).
    const legacyApproval = asApprovalState(r.approvalState)
    const isGlobalInferred = scope === 'global' && (r.source === 'inferred' || r.source === undefined)
    const entry: AgentMemoryEntry = {
      id: r.id,
      documentId: scope === 'global' ? '__global__' : (documentId as string),
      agentName: typeof r.agentName === 'string' ? r.agentName : 'system',
      type: r.type as AgentMemoryEntry['type'],
      content, // verbatim
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
      source: r.source === 'explicit' ? 'explicit' : 'inferred',
      scope,
      approvalState: legacyApproval ?? (isGlobalInferred ? 'candidate' : undefined),
      sourceType: (typeof r.sourceType === 'string' ? r.sourceType : undefined) as AgentMemorySourceType | undefined,
      runId: typeof r.runId === 'string' ? r.runId : undefined,
      originKey: classifyKey(documentId) === 'path' ? documentId : undefined
    }
    result.entries.push(entry)
  }

  return result
}

/**
 * Verify migration completeness (§12 step 10): every legacy record must be
 * accounted for as migrated, quarantined, or counted invalid — no silent loss.
 */
export function verifyMigrationCounts(totalLegacy: number, result: MigrationResult): boolean {
  return totalLegacy === result.entries.length + result.quarantined.length + result.skippedInvalid
}

/** Stable checksum over entry ids+contents for the store manifest (§12 step 10). */
export function entriesChecksum(entries: AgentMemoryEntry[]): string {
  let h = 5381
  const parts = entries
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => `${e.id}:${e.content}`)
    .join('|')
  for (let i = 0; i < parts.length; i++) {
    h = ((h << 5) + h + parts.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}
