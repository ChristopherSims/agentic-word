/**
 * Document snapshot identity (updates-2.md §B).
 *
 * A run captures the document revision it started from. Content returned later
 * (for tools, review or projection) can be checked against that snapshot so a
 * stale proposal is surfaced instead of being applied to a different revision
 * or a different tab's document.
 */

import { createHash } from 'node:crypto'

/** Stable content hash for a document revision snapshot. Empty content → ''. */
export function documentSnapshotHash(content: string | null | undefined): string {
  if (content == null) return ''
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * True when a captured snapshot hash is set and no longer matches `content`.
 * An unbound snapshot (empty hash) is never stale.
 */
export function isSnapshotStale(
  capturedHash: string | null | undefined,
  currentContent: string | null | undefined
): boolean {
  if (!capturedHash) return false
  return capturedHash !== documentSnapshotHash(currentContent)
}

/** True when the captured snapshot still matches (unbound counts as current). */
export function snapshotMatches(
  capturedHash: string | null | undefined,
  currentContent: string | null | undefined
): boolean {
  return !isSnapshotStale(capturedHash, currentContent)
}
