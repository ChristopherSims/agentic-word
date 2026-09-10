/**
 * Deletion coordinator + durable job store (updates-2.md §D).
 * Verifies typed results and that a pending deletion survives a restart.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentLedger, emptyArtifactCounts } from '../../src/main/memory/ledger'
import { DeletionCoordinator } from '../../src/main/memory/deletion-coordinator'

let dir: string
let dbPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-deletion-jobs-'))
  dbPath = join(dir, 'ledger.sqlite')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('deletion coordinator (§D)', () => {
  it('reports complete/pending/failed as durable job state', () => {
    const coordinator = new DeletionCoordinator(new AgentLedger(dbPath))

    const completeId = coordinator.begin('clear-document', 'doc-a')
    expect(coordinator.status(completeId)?.state).toBe('pending')
    const complete = coordinator.complete(completeId, {
      ...emptyArtifactCounts(), entries: 3, sessions: 2, projections: 1
    })
    expect(complete.state).toBe('complete')
    expect(coordinator.status(completeId)?.state).toBe('complete')
    expect(coordinator.status(completeId)?.removed.entries).toBe(3)

    const pendingId = coordinator.begin('forget-entry', 'doc-b')
    const pending = coordinator.pending(pendingId, ['projection'], { ...emptyArtifactCounts(), entries: 1 })
    expect(pending).toEqual({ state: 'pending', operationId: pendingId, remaining: ['projection'] })

    const failedId = coordinator.begin('revoke-document', 'doc-c')
    const failed = coordinator.failed(failedId, 'disk-full')
    expect(failed).toEqual({ state: 'failed', operationId: failedId, code: 'disk-full' })
    expect(coordinator.status(failedId)?.code).toBe('disk-full')
  })

  it('keeps pending jobs across a ledger restart and resumes them', () => {
    const first = new DeletionCoordinator(new AgentLedger(dbPath))
    const id = first.begin('clear-document', 'doc-a')
    first.pending(id, ['projection'])

    // A fresh process/connection sees the same pending job.
    const reloaded = new DeletionCoordinator(new AgentLedger(dbPath))
    const pending = reloaded.pendingJobs()
    expect(pending.map((j) => j.operationId)).toEqual([id])
    expect(pending[0].documentId).toBe('doc-a')

    // Completing it clears the pending set.
    reloaded.complete(id, { ...emptyArtifactCounts(), projections: 1 })
    expect(new DeletionCoordinator(new AgentLedger(dbPath)).pendingJobs()).toEqual([])
  })
})
