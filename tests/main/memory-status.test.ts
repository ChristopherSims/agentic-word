/**
 * Honest memory status derivation (updates-2.md §F).
 */

import { describe, expect, it } from 'vitest'
import { deriveMemoryStatus, type MemoryStatusInput } from '../../src/main/memory/status'

const base: MemoryStatusInput = {
  mnesisEnabled: true,
  retainLocalChatHistory: true,
  backgroundSummarization: true,
  running: false,
  startFailed: false,
  error: null,
  pendingDeletions: 0,
  rebuilding: false
}

describe('deriveMemoryStatus (§F)', () => {
  it('reports disabled-by-user, not a running worker, when the toggle is off', () => {
    const status = deriveMemoryStatus({ ...base, mnesisEnabled: false })
    expect(status.state).toBe('disabled-by-user')
    expect(status.enabled).toBe(false)
  })

  it('reports blocked-by-consent when retention or summarization consent is off', () => {
    expect(deriveMemoryStatus({ ...base, backgroundSummarization: false }).state).toBe('blocked-by-consent')
    expect(deriveMemoryStatus({ ...base, retainLocalChatHistory: false }).state).toBe('blocked-by-consent')
  })

  it('surfaces pending maintenance above other states', () => {
    const status = deriveMemoryStatus({ ...base, mnesisEnabled: false, pendingDeletions: 2 })
    expect(status.state).toBe('pending-maintenance')
    expect(status.pendingDeletions).toBe(2)
  })

  it('distinguishes rebuilding, failed, ready and unavailable-runtime', () => {
    expect(deriveMemoryStatus({ ...base, rebuilding: true }).state).toBe('rebuilding')
    expect(deriveMemoryStatus({ ...base, error: 'boom' }).state).toBe('failed')
    expect(deriveMemoryStatus({ ...base, running: true }).state).toBe('ready')
    expect(deriveMemoryStatus(base).state).toBe('unavailable-runtime')
  })

  it('reports an explicit platform/runtime gate as unavailable-runtime', () => {
    const blocked = deriveMemoryStatus({ ...base, unavailableReason: 'The memory engine is not yet enabled on darwin.' })
    expect(blocked.state).toBe('unavailable-runtime')
    expect(blocked.detail).toContain('darwin')
    // A user-disabled engine still reports disabled-by-user.
    expect(deriveMemoryStatus({ ...base, mnesisEnabled: false, unavailableReason: 'x' }).state).toBe('disabled-by-user')
  })
})
