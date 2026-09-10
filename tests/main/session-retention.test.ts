/**
 * §B/R1: protected (or retention-off) documents keep chat history in an
 * ephemeral buffer that is never serialized; ordinary documents persist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentBridge } from '../../src/main/agent-bridge'
import type { VcsEngine } from '../../src/main/vcs-engine'
import type { DocumentStore } from '../../src/main/document-store'

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
  MnesisWorkerClient: class { running = false; error = 'disabled in test'; async start() { return false } stop() {} },
  resolveMnesisPaths: () => ({ pythonPath: 'python', workerPath: 'w.py', runtimeBundled: false }),
  isSupportedMnesisVersion: () => true
}))

let bridge: AgentBridge

const readPersisted = (): string => {
  const file = join(harness.userData, 'agent-sessions.json')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''
}

beforeEach(() => {
  harness.userData = fs.mkdtempSync(join(tmpdir(), 'lexicon-session-retention-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  bridge = new AgentBridge({} as VcsEngine, {} as DocumentStore)
  bridge.configure({ endpoint: '', model: '' })
})

afterEach(() => {
  bridge.stopMnesis()
  vi.restoreAllMocks()
  fs.rmSync(harness.userData, { recursive: true, force: true })
})

describe('session retention (§B/R1)', () => {
  it('never serializes messages for a protected document', async () => {
    // No endpoint is configured, so this only records protection and returns.
    await bridge.handleChatStream([{ role: 'user', content: 'hi' }], { documentId: 'doc-p', protectedDocument: true })

    bridge.getOrCreateSession('doc-p', 'Writer')
    bridge.addSessionMessage('doc-p:Writer', 'user', 'PROTECTED_SECRET')
    bridge.addSessionMessage('doc-p:Writer', 'assistant', 'PROTECTED_REPLY')

    // Visible in-memory (ephemeral)…
    expect(bridge.getSessionMessages('doc-p:Writer').map((m) => m.content)).toEqual(['PROTECTED_SECRET', 'PROTECTED_REPLY'])
    // …but never written to the persisted sessions file.
    expect(readPersisted()).not.toContain('PROTECTED_SECRET')
    expect(readPersisted()).not.toContain('PROTECTED_REPLY')
  })

  it('persists messages for an ordinary document (control)', () => {
    bridge.getOrCreateSession('doc-ok', 'Writer')
    bridge.addSessionMessage('doc-ok:Writer', 'user', 'RETAINED_FACT')
    expect(readPersisted()).toContain('RETAINED_FACT')
  })

  it('keeps an ephemeral document out of the store when other sessions save', async () => {
    await bridge.handleChatStream([{ role: 'user', content: 'hi' }], { documentId: 'doc-p2', protectedDocument: true })
    bridge.getOrCreateSession('doc-p2', 'Writer')
    bridge.addSessionMessage('doc-p2:Writer', 'user', 'EPHEMERAL_X')

    // An ordinary session write must not sweep the ephemeral buffer in.
    bridge.getOrCreateSession('doc-ok2', 'Writer')
    bridge.addSessionMessage('doc-ok2:Writer', 'user', 'DURABLE_Y')

    expect(readPersisted()).toContain('DURABLE_Y')
    expect(readPersisted()).not.toContain('EPHEMERAL_X')
  })
})
