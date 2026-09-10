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
  assertOptionalIdentifier,
  assertLegacyKey,
  assertTemplateType,
  assertQuarantineAction,
  assertRetentionPolicy,
  assertChatMessages,
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

  it('validates optional identifiers, legacy keys, templates and quarantine actions', () => {
    expect(assertOptionalIdentifier(undefined)).toBeUndefined()
    expect(assertOptionalIdentifier(null)).toBeUndefined()
    expect(assertOptionalIdentifier('doc-1')).toBe('doc-1')
    expect(() => assertOptionalIdentifier('')).toThrow(MemoryError)

    expect(assertLegacyKey('C:/docs/file.docx')).toBe('C:/docs/file.docx')
    expect(() => assertLegacyKey('')).toThrow(MemoryError)
    expect(() => assertLegacyKey('bad\u0000key')).toThrow(MemoryError)

    expect(assertTemplateType('novel')).toBe('novel')
    expect(() => assertTemplateType('unknown')).toThrow(MemoryError)
    expect(assertQuarantineAction('keep')).toBe('keep')
    expect(assertQuarantineAction('discard')).toBe('discard')
    expect(() => assertQuarantineAction('delete')).toThrow(MemoryError)
  })

  it('validates retention policy and chat messages', () => {
    expect(assertRetentionPolicy({ rejectedDays: 30, candidateDays: null })).toEqual({ rejectedDays: 30, candidateDays: null })
    expect(assertRetentionPolicy({})).toEqual({ rejectedDays: null, candidateDays: null })
    expect(() => assertRetentionPolicy({ rejectedDays: -1 })).toThrow(MemoryError)
    expect(() => assertRetentionPolicy({ rejectedDays: 'x' })).toThrow(MemoryError)
    expect(() => assertRetentionPolicy(null)).toThrow(MemoryError)

    expect(assertChatMessages([{ role: 'user', content: 'hi' }])).toEqual([{ role: 'user', content: 'hi' }])
    expect(() => assertChatMessages([])).toThrow(MemoryError)
    expect(() => assertChatMessages([{ role: 'user' }])).toThrow(MemoryError)
    expect(() => assertChatMessages([{ role: '', content: 'x' }])).toThrow(MemoryError)
    expect(() => assertChatMessages('not-an-array')).toThrow(MemoryError)
  })
})
