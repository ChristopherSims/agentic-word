/**
 * §A: bridge session ledger on the worker driver — sessions load from the
 * single writer and commit write-behind via flushSessions().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageChannel } from 'node:worker_threads'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentBridge } from '../../src/main/agent-bridge'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import { AgentLedger } from '../../src/main/memory/ledger'
import { WorkerLedgerDriver } from '../../src/main/memory/ledger-driver'
import { LedgerWorkerServer } from '../../src/main/memory/ledger-worker-server'
import type { VcsEngine } from '../../src/main/vcs-engine'
import type { DocumentStore } from '../../src/main/document-store'
import type { AgentSession } from '../../src/shared/types'

const harness = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => harness.userData, getAppPath: () => harness.userData, isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}))
vi.mock('../../src/main/rust-bridge', () => ({ isRustAvailable: () => false }))
vi.mock('../../src/main/memory/mnesis-client', () => ({
  MnesisWorkerClient: class {
    running = false
    error = 'disabled in test'
    async start() { return false }
    stop() {}
  },
  resolveMnesisPaths: () => ({ pythonPath: 'python', workerPath: 'w.py', runtimeBundled: false }),
  isSupportedMnesisVersion: () => true
}))

let bridge: AgentBridge
let ledger: AgentLedger
let store: AgentMemoryStore
let close: () => void

const session = (): AgentSession => ({
  id: 'doc-1:Writer', documentId: 'doc-1', agentName: 'Writer', systemPrompt: '',
  messages: [{ role: 'user', content: 'seeded' }], createdAt: 1, updatedAt: 2
})

beforeEach(async () => {
  harness.userData = fs.mkdtempSync(join(tmpdir(), 'lexicon-bridge-worker-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  ledger = new AgentLedger(join(harness.userData, 'agent-memory.sqlite'))
  ledger.writeSessions([session()])

  const { port1, port2 } = new MessageChannel()
  new LedgerWorkerServer(ledger, port2)
  const driver = new WorkerLedgerDriver(port1)
  store = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'), { driver, skipLoad: true })
  await store.initFromDriver()
  close = () => { void driver.close(); port1.close(); port2.close() }

  bridge = new AgentBridge({} as VcsEngine, {} as DocumentStore)
  await bridge.useWorkerMemoryLedger({ dbPath: join(harness.userData, 'agent-memory.sqlite'), workerPath: 'unused', store })
})

afterEach(() => {
  bridge.stopMnesis()
  close()
  vi.restoreAllMocks()
  fs.rmSync(harness.userData, { recursive: true, force: true })
})

describe('bridge session ledger on the worker driver (§A)', () => {
  it('loads sessions from the single writer during startup', () => {
    expect(store.isWorkerBacked()).toBe(true)
    expect(bridge.getOrCreateSession('doc-1', 'Writer').messages).toEqual([{ role: 'user', content: 'seeded' }])
  })

  it('commits new sessions write-behind through flushSessions()', async () => {
    bridge.getOrCreateSession('doc-2', 'Reviewer')
    // Not yet durable in the worker until flushed.
    expect(ledger.loadSessions().map((s) => s.id)).toEqual(['doc-1:Writer'])

    await bridge.flushSessions()
    expect(ledger.loadSessions().map((s) => s.id).sort()).toEqual(['doc-1:Writer', 'doc-2:Reviewer'])
  })

  it('persists control state (deletion jobs) through the worker', async () => {
    bridge.clearMemoryForDocument('doc-x')
    await bridge.flushMemoryWrites()
    // The job is durable in the worker-owned ledger.
    expect(ledger.listDeletionJobs().length).toBeGreaterThan(0)
    expect(fs.existsSync(join(harness.userData, 'agent-memory.control.sqlite'))).toBe(false)
  })
})
