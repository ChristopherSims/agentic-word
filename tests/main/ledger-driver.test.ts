/**
 * §A: ledger driver parity — in-process and worker-thread writers behave the
 * same over a real MessageChannel transport.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MessageChannel } from 'node:worker_threads'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InProcessLedgerDriver, WorkerLedgerDriver, resolveLedgerWorkerPath } from '../../src/main/memory/ledger-driver'
import { LedgerWorkerServer } from '../../src/main/memory/ledger-worker-server'
import { AgentLedger, type MemoryLedgerState } from '../../src/main/memory/ledger'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import type { AgentSession } from '../../src/shared/types'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-ledger-driver-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const emptyState = (): MemoryLedgerState => ({
  entries: [{
    id: 'm1', documentId: 'doc-1', agentName: 'user', type: 'fact',
    content: 'Fact A', createdAt: 1, source: 'explicit', scope: 'document'
  }],
  suppressions: [],
  historicalEvents: [],
  quarantine: []
})

const session = (): AgentSession => ({
  id: 'doc-1:Writer', documentId: 'doc-1', agentName: 'Writer', systemPrompt: '', messages: [], createdAt: 1, updatedAt: 2
})

describe('ledger driver (§A)', () => {
  it('in-process driver round-trips memory state and sessions', async () => {
    const driver = new InProcessLedgerDriver(new AgentLedger(join(dir, 'a.sqlite')))
    await driver.writeMemoryState(emptyState())
    expect((await driver.loadMemoryState()).entries.map((e) => e.id)).toEqual(['m1'])
    await driver.writeSessions([session()])
    expect((await driver.loadSessions()).map((s) => s.id)).toEqual(['doc-1:Writer'])
    expect(await driver.schemaVersion()).toBeGreaterThanOrEqual(1)
    await driver.close()
  })

  it('worker driver / server round-trips over a MessageChannel', async () => {
    const { port1, port2 } = new MessageChannel()
    new LedgerWorkerServer(new AgentLedger(join(dir, 'b.sqlite')), port2)
    const driver = new WorkerLedgerDriver(port1)

    await driver.writeMemoryState(emptyState())
    const state = await driver.loadMemoryState()
    expect(state.entries.map((e) => e.id)).toEqual(['m1'])

    await driver.writeSessions([session()])
    expect((await driver.loadSessions()).map((s) => s.id)).toEqual(['doc-1:Writer'])

    await driver.compact()
    await driver.close()
    port1.close()
    port2.close()
  })

  it('worker driver rejects unknown operations and surfaces errors', async () => {
    const { port1, port2 } = new MessageChannel()
    new LedgerWorkerServer(new AgentLedger(join(dir, 'c.sqlite')), port2)
    const driver = new WorkerLedgerDriver(port1) as unknown as { call: (op: string) => Promise<unknown> }
    await expect(driver.call('nope')).rejects.toThrow(/unknown ledger op/)
    ;(driver as unknown as WorkerLedgerDriver).close()
    port1.close()
    port2.close()
  })

  it('AgentMemoryStore owns a driver and persists through it', async () => {
    const file = join(dir, 'store.json')
    const store = new AgentMemoryStore(file)
    expect(store.getDriver().kind).toBe('in-process')
    store.add('doc-1', 'user', 'fact', 'driven fact', 'explicit', 'document')
    await store.persistStateViaDriver()
    const reloaded = new AgentMemoryStore(file)
    expect(reloaded.getForDocument('doc-1').map((e) => e.content)).toEqual(['driven fact'])
    await store.getDriver().close()
  })
})

describe('resolveLedgerWorkerPath (§A packaging)', () => {
  it('uses out/main in dev', () => {
    const p = resolveLedgerWorkerPath({
      isPackaged: false, resourcesPath: 'C:/r', appPath: 'G:/app', exists: () => false
    })
    expect(p.replace(/\\/g, '/')).toBe('G:/app/out/main/ledger-worker.js')
  })

  it('prefers the ASAR-unpacked worker when packaged', () => {
    const unpacked = 'C:/r/app.asar.unpacked/out/main/ledger-worker.js'
    const p = resolveLedgerWorkerPath({
      isPackaged: true, resourcesPath: 'C:/r', appPath: 'C:/app.asar', exists: (x) => x.replace(/\\/g, '/') === unpacked
    })
    expect(p.replace(/\\/g, '/')).toBe(unpacked)
  })

  it('falls back to appPath when the unpacked worker is missing', () => {
    const p = resolveLedgerWorkerPath({
      isPackaged: true, resourcesPath: 'C:/r', appPath: 'C:/app.asar', exists: () => false
    })
    expect(p.replace(/\\/g, '/')).toBe('C:/app.asar/out/main/ledger-worker.js')
  })
})
