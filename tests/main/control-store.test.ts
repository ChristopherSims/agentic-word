/**
 * §A/§B/§D/§E: control-state store — in-process write-through and worker
 * write-behind parity for deletion jobs, document policy and generations.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MessageChannel } from 'node:worker_threads'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentLedger, type ProjectionGeneration } from '../../src/main/memory/ledger'
import { ControlStore } from '../../src/main/memory/control-store'
import { InProcessLedgerDriver, WorkerLedgerDriver } from '../../src/main/memory/ledger-driver'
import { LedgerWorkerServer } from '../../src/main/memory/ledger-worker-server'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-control-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const generation = (id: string, documentId: string, state: ProjectionGeneration['state'] = 'staging'): ProjectionGeneration => ({
  generationId: id, documentId, branchId: null, sessionId: null, profileId: null,
  sourceEpoch: 0, ledgerSequence: 0, mnesisSessionId: null, state, createdAt: Date.now()
})

describe('control store (§A)', () => {
  it('writes through to an in-process ledger', () => {
    const ledger = new AgentLedger(join(dir, 'l.sqlite'))
    const control = new ControlStore(new InProcessLedgerDriver(ledger))
    expect(control.workerBacked).toBe(false)

    const opId = 'op-1'
    control.createDeletionJob(opId, 'clear-document', 'doc-1')
    control.updateDeletionJob(opId, 'pending', { entries: 2, events: 1, suppressions: 0, sessions: 0, projections: 0 }, ['projection'], null)
    expect(control.getDeletionJob(opId)?.state).toBe('pending')
    expect(ledger.getDeletionJob(opId)?.remaining).toEqual(['projection'])

    control.upsertDocumentPolicy('doc-1', { protected: true, policyEpoch: 3 })
    expect(ledger.getDocumentPolicy('doc-1')).toMatchObject({ protected: true, policyEpoch: 3 })
    // Renderer cannot downgrade protection while revoked.
    control.upsertDocumentPolicy('doc-1', { revoked: true })
    control.upsertDocumentPolicy('doc-1', { protected: false })
    expect(control.getDocumentPolicy('doc-1')?.protected).toBe(true)

    control.upsertProjectionGeneration(generation('g1', 'doc-1'))
    control.activateProjectionGeneration('g1')
    control.upsertProjectionGeneration(generation('g2', 'doc-1'))
    control.activateProjectionGeneration('g2')
    expect(control.listProjectionGenerations('doc-1').map((g) => `${g.generationId}:${g.state}`).sort())
      .toEqual(['g1:superseded', 'g2:active'])
    expect(ledger.listProjectionGenerations('doc-1').map((g) => `${g.generationId}:${g.state}`).sort())
      .toEqual(['g1:superseded', 'g2:active'])
  })

  it('loads, mutates and flushes through a worker driver', async () => {
    const ledger = new AgentLedger(join(dir, 'w.sqlite'))
    ledger.putDeletionJob({
      operationId: 'seed', kind: 'forget-entry', documentId: 'doc-1', state: 'failed',
      removed: { entries: 0, events: 0, suppressions: 0, sessions: 0, projections: 0 },
      remaining: ['projection'], code: 'x', requestedAt: 1, updatedAt: 1
    })
    ledger.upsertDocumentPolicy('doc-1', { protected: true, policyEpoch: 2 }, 5)

    const { port1, port2 } = new MessageChannel()
    new LedgerWorkerServer(ledger, port2)
    const control = new ControlStore(new WorkerLedgerDriver(port1))
    expect(control.workerBacked).toBe(true)
    await control.init()
    expect(control.listDeletionJobs().map((j) => j.operationId)).toEqual(['seed'])
    expect(control.getDocumentPolicy('doc-1')?.policyEpoch).toBe(2)

    control.createDeletionJob('op-2', 'revoke-document', 'doc-2')
    control.upsertDocumentPolicy('doc-2', { revoked: true, policyEpoch: 1 })
    control.upsertProjectionGeneration(generation('g1', 'doc-2'))
    control.activateProjectionGeneration('g1')
    control.upsertProjectionGeneration(generation('g2', 'doc-2'))
    control.activateProjectionGeneration('g2')

    // Not yet durable until flushed.
    expect(ledger.getDeletionJob('op-2')).toBeNull()
    await control.flush()
    expect(ledger.getDeletionJob('op-2')?.kind).toBe('revoke-document')
    expect(ledger.getDocumentPolicy('doc-2')?.revoked).toBe(true)
    expect(ledger.listProjectionGenerations('doc-2').map((g) => `${g.generationId}:${g.state}`).sort())
      .toEqual(['g1:superseded', 'g2:active'])

    await control.flush() // no-op
    port1.close(); port2.close()
  })
})
