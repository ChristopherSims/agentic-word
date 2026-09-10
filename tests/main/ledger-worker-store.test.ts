/**
 * §A: worker-backed memory store — sync reads from the in-memory snapshot,
 * write-behind commits through the async driver.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MessageChannel } from 'node:worker_threads'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import { AgentLedger } from '../../src/main/memory/ledger'
import { WorkerLedgerDriver, type LedgerDriver } from '../../src/main/memory/ledger-driver'
import { LedgerWorkerServer } from '../../src/main/memory/ledger-worker-server'
import { MemoryError } from '../../src/main/memory/errors'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-worker-store-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function workerStore(ledger: AgentLedger): { store: AgentMemoryStore; close: () => void } {
  const { port1, port2 } = new MessageChannel()
  new LedgerWorkerServer(ledger, port2)
  const driver = new WorkerLedgerDriver(port1)
  const store = new AgentMemoryStore(join(dir, 'agent-memory.json'), { driver, skipLoad: true })
  return { store, close: () => { void driver.close(); port1.close(); port2.close() } }
}

describe('worker-backed memory store (§A)', () => {
  it('loads state on init and serves reads synchronously', async () => {
    const ledger = new AgentLedger(join(dir, 'ledger.sqlite'))
    ledger.writeMemoryState({
      entries: [{
        id: 'm1', documentId: 'doc-1', agentName: 'user', type: 'fact',
        content: 'Loaded fact', createdAt: 1, source: 'explicit', scope: 'document'
      }],
      suppressions: [], historicalEvents: [], quarantine: []
    })

    const { store, close } = workerStore(ledger)
    expect(store.isWorkerBacked()).toBe(true)
    await store.initFromDriver()
    expect(store.getForDocument('doc-1').map((e) => e.content)).toEqual(['Loaded fact'])
    close()
  })

  it('updates memory synchronously and commits on flush (write-behind)', async () => {
    const ledger = new AgentLedger(join(dir, 'ledger.sqlite'))
    const { store, close } = workerStore(ledger)
    await store.initFromDriver()

    const entry = store.add('doc-1', 'user', 'fact', 'Write-behind fact', 'explicit', 'document')
    // Visible to sync reads immediately...
    expect(store.getEntry(entry.id)?.content).toBe('Write-behind fact')
    // ...but not yet committed to the worker-owned ledger.
    expect(ledger.isInitialized()).toBe(false)

    await store.flush()
    expect(ledger.loadMemoryState().entries.map((e) => e.content)).toEqual(['Write-behind fact'])

    // Nothing to flush is a no-op.
    await store.flush()
    close()
  })

  it('round-trips projection outbox marks through the worker', async () => {
    const ledger = new AgentLedger(join(dir, 'ledger.sqlite'))
    const { store, close } = workerStore(ledger)
    await store.initFromDriver()

    const event = store.commitRetainedTurn('doc-1', 'doc-1:Writer', 'hello', 'world')
    expect(event.assistantEventId).toBeTruthy()
    await store.flush()
    const pending = store.pendingProjectionOutbox()
    expect(pending.length).toBeGreaterThan(0)

    const marked = store.markProjectionOutboxProcessed(pending.map((o) => o.id))
    expect(marked).toBe(pending.length)
    expect(store.pendingProjectionOutbox()).toEqual([])
    await store.flush()
    expect(ledger.listOutbox('pending')).toEqual([])

    await store.compactAsync()
    close()
  })

  it('surfaces a failed commit as a typed error and keeps retrying', async () => {
    const failing: LedgerDriver = {
      kind: 'worker',
      schemaVersion: async () => 4,
      isInitialized: async () => false,
      loadMemoryState: async () => ({ entries: [], suppressions: [], historicalEvents: [], quarantine: [] }),
      writeMemoryState: async () => { throw new Error('disk full') },
      loadSessions: async () => [],
      writeSessions: async () => {},
      listOutbox: async () => [],
      markOutboxDone: async () => 0,
      listMigrationManifests: async () => [],
      loadControl: async () => ({ jobs: [], policies: [], generations: [] }),
      writeControl: async () => {},
      compact: async () => {},
      close: async () => {}
    }
    const store = new AgentMemoryStore(join(dir, 'agent-memory.json'), { driver: failing, skipLoad: true })
    await store.initFromDriver()
    store.add('doc-1', 'user', 'fact', 'x', 'explicit', 'document')

    await expect(store.flush()).rejects.toBeInstanceOf(MemoryError)
    // State still pending — a later flush retries and fails again.
    await expect(store.flush()).rejects.toBeInstanceOf(MemoryError)
  })
})
