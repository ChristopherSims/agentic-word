/**
 * §A: ledger-only mode — no JSON compatibility mirror is written.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'

let dir: string
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-ledger-only-'))
  file = join(dir, 'memory.json')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('ledger-only mode (§A)', () => {
  it('writes no JSON mirror yet persists and reloads from the ledger', () => {
    const store = new AgentMemoryStore(file)
    store.setJsonMirror(false)
    store.add('doc-1', 'user', 'fact', 'ledger only fact', 'explicit', 'document')

    expect(fs.existsSync(file)).toBe(false)
    expect(fs.existsSync(join(dir, 'memory.sqlite'))).toBe(true)

    const reloaded = new AgentMemoryStore(file)
    expect(reloaded.getForDocument('doc-1').map((e) => e.content)).toEqual(['ledger only fact'])
  })
})
