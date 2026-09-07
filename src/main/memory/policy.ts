/**
 * Memory policy (memory.md §10.1, §6.3)
 *
 * Pure functions over AgentMemoryEntry objects — no Electron or filesystem
 * imports, so these rules are unit-testable in the Node vitest environment.
 *
 * Core rules:
 * - Inferred entries are created as `candidate` and never enter a prompt
 *   until explicitly approved.
 * - Document-scoped corrections are never silently promoted to global
 *   preferences; clustering produces a candidate suggestion and keeps the
 *   original evidence.
 */

import type { AgentMemoryEntry, AgentMemoryApprovalState, AgentMemorySourceType } from '../../shared/types'

/**
 * An entry is eligible for prompt injection when it is approved, or when it
 * is a legacy entry created before the approval lifecycle existed (no
 * approvalState). Rejected, superseded, and candidate entries are excluded.
 */
export function isEligibleForPrompt(entry: AgentMemoryEntry): boolean {
  if (entry.approvalState === undefined) return true // legacy entry — treated as approved
  return entry.approvalState === 'approved'
}

/** Filter a list of entries down to those eligible for prompt injection. */
export function filterEligible(entries: AgentMemoryEntry[]): AgentMemoryEntry[] {
  return entries.filter(isEligibleForPrompt)
}

/**
 * Group document-scoped corrections by shared keywords (memory.md §10.1).
 * Pure: returns clusters with 3+ members; the caller decides what to do with
 * them. Originals are never modified or deleted by this function.
 */
export function findCorrectionClusters(
  corrections: AgentMemoryEntry[],
  minClusterSize = 3
): AgentMemoryEntry[][] {
  const groups: Map<string, AgentMemoryEntry[]> = new Map()

  for (const correction of corrections) {
    const words = correction.content
      .toLowerCase()
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 4 &&
          !['rejected', 'insertion', 'replacement', 'user', 'with', 'replace'].includes(w)
      )

    let matchedKey: string | null = null
    for (const [key, group] of Array.from(groups)) {
      const keyWords = key.split('|')
      const overlap = words.filter((w) => keyWords.includes(w))
      if (overlap.length >= 2) {
        matchedKey = key
        break
      }
    }

    if (matchedKey) {
      groups.get(matchedKey)!.push(correction)
    } else {
      const key = words.slice(0, 3).join('|')
      groups.set(key, [correction])
    }
  }

  return Array.from(groups.values()).filter((group) => group.length >= minClusterSize)
}

/**
 * Build the content for a candidate preference suggested by a correction
 * cluster. Document-scoped by design: the caller must not promote it to
 * global scope without explicit user approval.
 */
export function buildClusterSuggestion(
  cluster: AgentMemoryEntry[],
  now = Date.now()
): {
  content: string
  approvalState: AgentMemoryApprovalState
  sourceType: AgentMemorySourceType
  scope: 'document'
  evidenceIds: string[]
} | null {
  if (cluster.length === 0) return null
  // Reuse the legacy keyword summary wording, but scoped to the document
  const firstWords = cluster[0].content
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4 && !['rejected', 'insertion', 'replacement', 'user', 'with', 'replace'].includes(w))
    .slice(0, 3)
  const summary = `Suggested rule from repeated corrections: user consistently rejects ${firstWords.join(' ')} — review and approve to apply`
  return {
    content: summary,
    approvalState: 'candidate',
    sourceType: 'system',
    scope: 'document',
    evidenceIds: cluster.map((c) => c.id)
  }
}

/** Default approval state for a new entry given its source (memory.md §10.1). */
export function defaultApprovalState(
  source: 'explicit' | 'inferred',
  sourceType: AgentMemorySourceType
): AgentMemoryApprovalState {
  // Explicit user actions and templates are approved immediately.
  // Everything inferred (auto-extraction, clustering, rejection evidence
  // the model might generalize from) starts as a candidate.
  if (source === 'explicit' || sourceType === 'template' || sourceType === 'user') {
    return 'approved'
  }
  return 'candidate'
}
