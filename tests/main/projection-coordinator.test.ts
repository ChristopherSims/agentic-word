/**
 * Projection coordinator (updates-2.md §E): generation identity in the ledger,
 * owned per-generation files, atomic activation, and dispose-only cleanup.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentLedger } from '../../src/main/memory/ledger'
import { ProjectionCoordinator } from '../../src/main/memory/projection-coordinator'

let dir: string
let coordinator: ProjectionCoordinator

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-projections-'))
  coordinator = new ProjectionCoordinator(new AgentLedger(join(dir, 'ledger.sqlite')), join(dir, 'generations'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('projection coordinator (§E)', () => {
  it('creates an owned generation directory and records it', () => {
    const gen = coordinator.beginGeneration({ documentId: 'doc-a', sessionId: 'doc-a:Writer', sourceEpoch: 2 })
    expect(gen.state).toBe('staging')
    expect(fs.existsSync(coordinator.generationDir(gen.generationId))).toBe(true)
    expect(coordinator.generationDbPath(gen.generationId)).toContain(gen.generationId)
    expect(coordinator.generations('doc-a').map((g) => g.generationId)).toEqual([gen.generationId])
  })

  it('atomically activates one generation and supersedes the prior active one', () => {
    const first = coordinator.beginGeneration({ documentId: 'doc-a' })
    coordinator.activate(first.generationId)
    expect(coordinator.activeGeneration('doc-a')?.generationId).toBe(first.generationId)

    const second = coordinator.beginGeneration({ documentId: 'doc-a' })
    coordinator.activate(second.generationId)
    expect(coordinator.activeGeneration('doc-a')?.generationId).toBe(second.generationId)
    expect(coordinator.generations('doc-a').find((g) => g.generationId === first.generationId)?.state).toBe('superseded')
  })

  it('disposes a generation by removing its owned files', () => {
    const gen = coordinator.beginGeneration({ documentId: 'doc-a' })
    const genDir = coordinator.generationDir(gen.generationId)
    fs.writeFileSync(join(genDir, 'sessions.db'), 'owned')
    fs.writeFileSync(join(genDir, 'sessions.db-wal'), 'owned')

    const result = coordinator.dispose(gen.generationId)
    expect(result.removedFiles).toBe(2)
    expect(fs.existsSync(genDir)).toBe(false)
    expect(coordinator.generations('doc-a').find((g) => g.generationId === gen.generationId)?.state).toBe('disposed')
  })

  it('refuses generation ids that escape the base directory', () => {
    expect(() => coordinator.generationDir('../escape')).toThrow()
    expect(() => coordinator.generationDir('a/b')).toThrow()
  })

  it('retires superseded generations only after activation and removes their files', () => {
    const first = coordinator.beginGeneration({ documentId: 'doc-a' })
    const firstDir = coordinator.generationDir(first.generationId)
    fs.writeFileSync(join(firstDir, 'sessions.db'), 'owned')
    coordinator.activate(first.generationId)

    // A fresh generation supersedes the first but does not yet remove it.
    const second = coordinator.refreshGeneration('doc-a')
    expect(fs.existsSync(firstDir)).toBe(true)
    expect(coordinator.generations('doc-a').find((g) => g.generationId === first.generationId)?.state).toBe('superseded')

    // Retiring after the replacement is active removes the superseded files.
    expect(coordinator.retireSuperseded('doc-a')).toBe(1)
    expect(fs.existsSync(firstDir)).toBe(false)
    expect(coordinator.generations('doc-a').find((g) => g.generationId === first.generationId)?.state).toBe('disposed')
    expect(fs.existsSync(coordinator.generationDir(second.generationId))).toBe(true)
  })
})
