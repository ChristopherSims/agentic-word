/**
 * §B: document snapshot identity — a run captures the revision it started from
 * and later content can be checked against it.
 */

import { describe, expect, it } from 'vitest'
import { documentSnapshotHash, isSnapshotStale, snapshotMatches } from '../../src/main/memory/snapshot'

describe('document snapshot identity (§B)', () => {
  it('hashes content deterministically and treats absent content as empty', () => {
    expect(documentSnapshotHash(null)).toBe('')
    expect(documentSnapshotHash(undefined)).toBe('')
    expect(documentSnapshotHash('abc')).toBe(documentSnapshotHash('abc'))
    expect(documentSnapshotHash('abc')).toHaveLength(64)
    expect(documentSnapshotHash('abc')).not.toBe(documentSnapshotHash('abd'))
  })

  it('detects stale snapshots and never marks an unbound snapshot stale', () => {
    const captured = documentSnapshotHash('v1')
    expect(isSnapshotStale('', 'v2')).toBe(false) // unbound
    expect(isSnapshotStale(captured, 'v1')).toBe(false)
    expect(isSnapshotStale(captured, 'v2')).toBe(true)
    expect(isSnapshotStale(captured, null)).toBe(true)
    expect(snapshotMatches(captured, 'v1')).toBe(true)
    expect(snapshotMatches(undefined, 'anything')).toBe(true)
  })
})
