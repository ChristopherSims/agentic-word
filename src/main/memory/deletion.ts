/**
 * Deletion-flow primitives (memory.md §11: "append-only must not mean
 * impossible to forget").
 *
 * Three properties, all pure and unit-tested:
 *
 * 1. Lineage cascade — a memory derived from a forgotten source (e.g. a
 *    consolidation summary) is suppressed too, transitively.
 * 2. Anti-re-learning — forgotten content leaves behind *shingle hashes*
 *    (no plaintext), so automatic extraction cannot silently re-derive the
 *    same preference from the still-present document or conversation.
 *    Explicit user saves are the opt-back-in path and are not gated here.
 * 3. Filtered rebuild — a Mnesis projection is rebuilt from a transcript
 *    with suppressed turns (and any compaction summary that absorbed them)
 *    removed, so forget survives "compaction in flight".
 */

import type { AgentMemoryEntry } from '../../shared/types'
import { contentHash } from './doc-index'

// ─── Normalization + shingle fingerprints ───

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeForMatch(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Hashes of overlapping word windows of the normalized content, at two
 * scales: 8-word windows (near-verbatim re-derivations of longer text) and
 * 4-word windows (so a short forgotten preference still matches when it
 * reappears inside a longer candidate, and vice versa). Stored instead of
 * the content itself: a forgotten memory leaves no plaintext behind, only
 * irreversible hashes. Contents under 4 words use a single whole-content
 * hash. Matching is therefore near-verbatim, not semantic — deliberately
 * conservative in both directions, with explicit save as the opt-back-in.
 */
export function shingleHashes(content: string): string[] {
  const normalized = normalizeForMatch(content)
  if (!normalized) return []
  const words = normalized.split(' ')
  const hashes = new Set<string>()
  const windows = (n: number): boolean => {
    if (words.length < n) return false
    for (let i = 0; i + n <= words.length; i++) {
      hashes.add(contentHash(words.slice(i, i + n).join(' ')))
    }
    return true
  }
  if (windows(8)) windows(4)
  else if (!windows(4)) hashes.add(contentHash(normalized))
  return Array.from(hashes)
}

export interface SuppressionRecord {
  /** id of the forgotten entry (for opt-back-in by origin) */
  entryId: string
  documentId: string
  scope: 'document' | 'global'
  /** shingle hashes of the forgotten content — never the content itself */
  hashes: string[]
  forgottenAt: number
}

/** True when the candidate content re-derives any suppressed content. */
export function isSuppressedContent(
  candidate: string,
  suppressions: SuppressionRecord[]
): boolean {
  const candidateHashes = new Set(shingleHashes(candidate))
  if (candidateHashes.size === 0) return false
  return suppressions.some((s) => s.hashes.some((h) => candidateHashes.has(h)))
}

// ─── Lineage cascade ───

export interface ForgetCascade {
  /** the entry the user asked to forget */
  directId: string
  /** entries derived from it (directly or transitively) — suppressed too */
  derivedIds: string[]
}

/**
 * Trace everything derived from the target entry via `derivedFrom` links
 * (consolidation summaries list their source entries). Transitive: a
 * summary of a summary falls with its sources.
 */
export function planForgetCascade(
  targetId: string,
  entries: Pick<AgentMemoryEntry, 'id' | 'derivedFrom'>[]
): ForgetCascade | null {
  if (!entries.some((e) => e.id === targetId)) return null
  const derived: string[] = []
  const frontier = new Set<string>([targetId])
  let changed = true
  while (changed) {
    changed = false
    for (const e of entries) {
      if (derived.includes(e.id) || frontier.has(e.id)) continue
      if ((e.derivedFrom ?? []).some((src) => frontier.has(src))) {
        frontier.add(e.id)
        derived.push(e.id)
        changed = true
      }
    }
  }
  return { directId: targetId, derivedIds: derived }
}

// ─── Filtered rebuild (forget with compaction in flight) ───

export interface TranscriptTurn {
  role: string
  content: string
}

/**
 * Filter a transcript for projection rebuild: any turn (including a
 * compaction summary) whose content re-derives a suppressed memory is
 * dropped, so replaying the rebuild cannot resurrect it through summaries.
 */
export function filterTranscriptForRebuild(
  turns: TranscriptTurn[],
  suppressions: SuppressionRecord[]
): { kept: TranscriptTurn[]; dropped: number } {
  if (suppressions.length === 0) return { kept: turns, dropped: 0 }
  const kept: TranscriptTurn[] = []
  let dropped = 0
  for (const turn of turns) {
    if (isSuppressedContent(turn.content, suppressions)) {
      dropped++
    } else {
      kept.push(turn)
    }
  }
  return { kept, dropped }
}

// ─── Honest limits (§11: explain what forget does NOT do) ───

export const FORGET_LIMITS_NOTICE =
  'Forgetting removes this memory from Lexicon: the memory ledger, derived ' +
  'summaries, automatic re-learning, and the conversation-context projection ' +
  'for this document are purged and rebuilt without it. It does NOT: edit the ' +
  'document text itself, rewrite version-control history, delete backups or ' +
  'exported bundles you created, or erase anything a remote AI provider may ' +
  'have retained from earlier requests. Automatic re-learning of this ' +
  'preference is blocked; saving it again explicitly is the opt-back-in.'

/**
 * Whole-session disposal verdict for the Mnesis sidecar: mnesis exposes
 * soft_delete_session (rows retained), so true disposal is a hard row
 * delete of the session set for a document — implemented in the worker.
 * Kept as a constant so the UI and logs state the same fact.
 */
export const PROJECTION_DISPOSAL_NOTE =
  'Mnesis projections are disposed per document (whole-session row removal) ' +
  'and rebuilt from the filtered transcript; no per-message deletion API ' +
  'exists in mnesis 0.3.0, so disposal is all-or-nothing per document.'
