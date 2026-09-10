/**
 * §C: locality is loopback-only (no `.local` suffix trust).
 */

import { describe, expect, it } from 'vitest'
import { isLocalEndpoint } from '../../src/main/memory/consent'

describe('endpoint locality (§C)', () => {
  it('treats only loopback destinations as local', () => {
    expect(isLocalEndpoint('http://localhost:11434/v1')).toBe(true)
    expect(isLocalEndpoint('http://127.0.0.1:1234/v1')).toBe(true)
    expect(isLocalEndpoint('http://[::1]:8080/v1')).toBe(true)
    expect(isLocalEndpoint('http://0.0.0.0:8000/v1')).toBe(true)
  })

  it('does not treat `.local` (or any suffix) as local', () => {
    expect(isLocalEndpoint('http://ollama.local:11434/v1')).toBe(false)
    expect(isLocalEndpoint('https://api.openai.com/v1')).toBe(false)
    expect(isLocalEndpoint('not a url')).toBe(false)
  })
})
