/**
 * Renderer-side IPC result guard. Main-process handlers wrapped with
 * `wrapIpcHandler` resolve with `{ success: false, error }` instead of
 * rejecting; save flows must convert that back into a failure.
 */

import { describe, expect, it } from 'vitest'
import { throwIfIpcError } from '../../src/renderer/utils'

describe('throwIfIpcError', () => {
  it('returns successful results unchanged', () => {
    const result = { success: true }
    expect(throwIfIpcError(result)).toBe(result)
    expect(throwIfIpcError(null)).toBe(null)
    expect(throwIfIpcError(undefined)).toBe(undefined)
    expect(throwIfIpcError('plain')).toBe('plain')
  })

  it('throws the error message for an error response', () => {
    expect(() => throwIfIpcError({ success: false, error: 'ENOENT: no such file' })).toThrow(
      'ENOENT: no such file'
    )
  })

  it('falls back to a generic message for malformed error responses', () => {
    expect(() => throwIfIpcError({ success: false, error: '' })).toThrow('Operation failed')
  })
})
