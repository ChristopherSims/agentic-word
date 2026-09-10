/**
 * §D: scoped opt-back-in — clearing one forgotten entry's suppressions does
 * not reactivate unrelated ones.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'

let dir: string
let store: AgentMemoryStore

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-scoped-optin-'))
  store = new AgentMemoryStore(join(dir, 'memory.json'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('scoped opt-back-in (§D)', () => {
  it('clears only the selected entry, leaving unrelated suppressions intact', () => {
    const a = store.add('doc-1', 'user', 'preference', 'alpha unique phrase one', 'explicit', 'document')
    const b = store.add('doc-1', 'user', 'preference', 'beta unique phrase two', 'explicit', 'document')
    store.forget(a.id)
    store.forget(b.id)

    expect(store.isSuppressed('alpha unique phrase one', 'doc-1')).toBe(true)
    expect(store.isSuppressed('beta unique phrase two', 'doc-1')).toBe(true)

    expect(store.clearSuppressions('doc-1', a.id)).toBe(1)
    expect(store.isSuppressed('alpha unique phrase one', 'doc-1')).toBe(false)
    expect(store.isSuppressed('beta unique phrase two', 'doc-1')).toBe(true)
    expect(store.listSuppressionEntryIds('doc-1')).toEqual([b.id])
  })
})
