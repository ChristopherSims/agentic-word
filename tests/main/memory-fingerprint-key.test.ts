/**
 * §D/R17: keyed HMAC-SHA-256 fingerprints with a persisted installation key.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import { shingleHashes } from '../../src/main/memory/deletion'

let dir: string
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-fingerprint-key-'))
  file = join(dir, 'memory.json')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('keyed fingerprints (§D)', () => {
  it('uses HMAC-SHA-256 (64 hex) once an installation key is configured', () => {
    // eslint-disable-next-line no-new
    new AgentMemoryStore(file)
    const hashes = shingleHashes('a distinctive phrase for fingerprinting')
    expect(hashes.length).toBeGreaterThan(0)
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(fs.existsSync(`${file}.fingerprint.key`)).toBe(true)
  })

  it('keeps suppression matching stable across a reload (same key)', () => {
    const store = new AgentMemoryStore(file)
    const entry = store.add('doc-1', 'user', 'fact', 'the atlas rendezvous is violet harbor', 'explicit', 'document')
    store.forget(entry.id)

    const reloaded = new AgentMemoryStore(file)
    expect(reloaded.isSuppressed('the atlas rendezvous is violet harbor', 'doc-1')).toBe(true)
    expect(reloaded.isSuppressed('an unrelated sentence entirely', 'doc-1')).toBe(false)
  })
})
