/**
 * §B: runtime validation of memory IPC inputs.
 */

import { describe, expect, it } from 'vitest'
import {
  assertIdentifier,
  assertBoolean,
  assertScope,
  assertMemoryType,
  assertApprovalState,
  assertContent,
  assertConsentPartial,
  MAX_MEMORY_CONTENT,
  MAX_DOCUMENT_ID
} from '../../src/main/memory/ipc-validation'
import { MemoryError, isMemoryError } from '../../src/main/memory/errors'

describe('memory IPC validation (§B)', () => {
  it('accepts valid identifiers and rejects unsafe ones', () => {
    expect(assertIdentifier('doc-123')).toBe('doc-123')
    for (const bad of ['', '   ', 42, null, undefined, 'a'.repeat(MAX_DOCUMENT_ID + 1), 'bad\u0000id']) {
      try {
        assertIdentifier(bad as unknown)
        throw new Error('should have thrown')
      } catch (err) {
        expect(isMemoryError(err, 'invalid-input')).toBe(true)
      }
    }
  })

  it('validates booleans, scopes, types and approval states', () => {
    expect(assertBoolean(true)).toBe(true)
    expect(() => assertBoolean('true')).toThrow(MemoryError)
    expect(assertScope(undefined)).toBe('document')
    expect(assertScope('global')).toBe('global')
    expect(() => assertScope('admin')).toThrow(MemoryError)
    expect(assertMemoryType('fact')).toBe('fact')
    expect(() => assertMemoryType('emoji')).toThrow(MemoryError)
    expect(assertApprovalState('approved')).toBe('approved')
    expect(() => assertApprovalState('maybe')).toThrow(MemoryError)
  })

  it('caps memory content size', () => {
    expect(assertContent('hello')).toBe('hello')
    expect(() => assertContent('')).toThrow(MemoryError)
    expect(() => assertContent('x'.repeat(MAX_MEMORY_CONTENT + 1))).toThrow(MemoryError)
  })

  it('rejects unknown consent boundaries and non-boolean values', () => {
    expect(assertConsentPartial({ remoteInference: false })).toEqual({ remoteInference: false })
    expect(() => assertConsentPartial({ admin: true })).toThrow(MemoryError)
    expect(() => assertConsentPartial({ remoteInference: 'yes' })).toThrow(MemoryError)
    expect(() => assertConsentPartial(null)).toThrow(MemoryError)
  })
})
