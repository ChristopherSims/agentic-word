/**
 * Active-file plaintext scan (updates-2.md §D / R21).
 *
 * After a forget, the deleted content must not remain readable in the
 * Lexicon-owned ledger file, while unrelated data survives. This is a
 * byte-level check of the managed active file, not a row-count check.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'

const SECRET = 'Synthetic confidential atlas meeting location is violet harbor'
const KEEPER = 'Unrelated retention note about tide tables and moon phases'

let dir: string
let store: AgentMemoryStore
let dbPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-active-file-'))
  dbPath = join(dir, 'memory.sqlite')
  store = new AgentMemoryStore(join(dir, 'memory.json'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function managedBytes(file: string): Buffer {
  return fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0)
}

describe('active-file plaintext cleanup (§D)', () => {
  it('removes forgotten plaintext from the ledger file while keeping unrelated data', () => {
    const doomed = store.add('doc-a', 'user', 'fact', SECRET, 'explicit', 'document')
    store.add('doc-b', 'user', 'fact', KEEPER, 'explicit', 'document')

    store.forget(doomed.id)

    // Row-level deletion.
    expect(store.getForDocument('doc-a')).toHaveLength(0)
    expect(store.getForDocument('doc-b').map((e) => e.content)).toContain(KEEPER)

    // Byte-level scan of every managed active file for this store.
    const managed = [dbPath, `${dbPath}-wal`, `${dbPath}-journal`, `${dbPath}-shm`]
    const combined = Buffer.concat(managed.map(managedBytes)).toString('utf-8')
    expect(combined).not.toContain(SECRET)
    expect(combined).toContain(KEEPER)
  })

  it('stays clean after WAL checkpoint + compaction of the active file', () => {
    const doomed = store.add('doc-a', 'user', 'fact', SECRET, 'explicit', 'document')
    store.add('doc-b', 'user', 'fact', KEEPER, 'explicit', 'document')
    store.forget(doomed.id)
    store.compact()

    const managed = [dbPath, `${dbPath}-wal`, `${dbPath}-journal`, `${dbPath}-shm`]
    const combined = Buffer.concat(managed.map(managedBytes)).toString('utf-8')
    expect(combined).not.toContain(SECRET)
    expect(combined).toContain(KEEPER)
  })
})
