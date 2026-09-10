/**
 * §A: legacy-import manifest transaction and checksum verification.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import { entriesChecksum, SCHEMA_VERSION } from '../../src/main/memory/migration'

let dir: string
let memoryPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-import-manifest-'))
  memoryPath = join(dir, 'memory.json')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const canonical = (checksum: string) => JSON.stringify({
  meta: { schemaVersion: SCHEMA_VERSION, savedAt: 1, checksum },
  entries: [{ id: 'm1', documentId: 'doc-1', agentName: 'user', type: 'fact', content: 'Fact A', createdAt: 1, source: 'explicit', scope: 'document' }],
  quarantine: [],
  suppressions: [],
  historicalEvents: []
})

describe('import manifest (§A)', () => {
  it('records source hash, counts and checksum with the imported state', () => {
    const legacy = JSON.stringify({
      entries: [
        { id: 'm1', documentId: 'C:\\docs\\a.docx', type: 'fact', content: 'Fact A', createdAt: 1, source: 'explicit' },
        { id: 'm2', documentId: 'default', type: 'preference', content: 'Ambiguous', createdAt: 2, source: 'inferred' }
      ]
    })
    fs.writeFileSync(memoryPath, legacy, 'utf-8')

    const store = new AgentMemoryStore(memoryPath)
    const manifests = store.listImportManifests()
    expect(manifests).toHaveLength(1)
    expect(manifests[0].sourceHash).toBe(createHash('sha256').update(legacy).digest('hex'))
    expect(manifests[0].entries).toBe(1)
    expect(manifests[0].quarantined).toBe(1)
    expect(manifests[0].skipped).toBe(0)

    // A reload (ledger authoritative) does not import again.
    const reloaded = new AgentMemoryStore(memoryPath)
    expect(reloaded.listImportManifests()).toHaveLength(1)
  })

  it('refuses to activate a canonical store whose checksum does not match', () => {
    fs.writeFileSync(memoryPath, canonical('tampered'), 'utf-8')
    const store = new AgentMemoryStore(memoryPath)
    expect(store.getForDocument('doc-1')).toEqual([])
  })

  it('activates a canonical store with a correct checksum', () => {
    const entries = JSON.parse(canonical('')).entries
    fs.writeFileSync(memoryPath, canonical(entriesChecksum(entries)), 'utf-8')
    const store = new AgentMemoryStore(memoryPath)
    expect(store.getForDocument('doc-1')).toHaveLength(1)
  })
})
