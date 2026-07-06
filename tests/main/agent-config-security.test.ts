import { describe, it, expect } from 'vitest'
import {
  SAFE_STORAGE_PREFIX,
  decodeSafeStorageValue,
  encodeSafeStorageValue,
  removeUndefinedValues,
} from '../../src/main/agent-config-security'

describe('agent config safeStorage encoding', () => {
  it('round-trips encrypted bytes without dropping ciphertext characters', () => {
    const encrypted = Buffer.from('0123456789abcdef', 'hex')
    const encoded = encodeSafeStorageValue(encrypted)

    expect(SAFE_STORAGE_PREFIX).toHaveLength(16)
    expect(encoded).toBe(`${SAFE_STORAGE_PREFIX}0123456789abcdef`)
    expect(decodeSafeStorageValue(encoded)).toEqual(encrypted)
  })

  it('rejects values without the safeStorage marker', () => {
    expect(() => decodeSafeStorageValue('0123456789abcdef')).toThrow('safeStorage')
  })
})

describe('agent config merge sanitization', () => {
  it('removes undefined API key updates so saved keys are preserved', () => {
    const sanitized = removeUndefinedValues({
      endpoint: 'https://api.example.com/v1/chat/completions',
      apiKey: undefined,
      model: 'gpt-4',
    })

    expect(sanitized).toEqual({
      endpoint: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4',
    })
  })

  it('keeps an empty API key so users can intentionally clear it', () => {
    expect(removeUndefinedValues({ apiKey: '' })).toEqual({ apiKey: '' })
  })
})
