/**
 * AgentBridge context-window wiring: auto-population from the provider
 * catalog / known table, explicit manual overrides, and stale-window reset
 * when the selected model changes.
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
  app: {
    getPath: () => harness.userData,
    getAppPath: () => harness.userData,
    isPackaged: false
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}))
vi.mock('../../src/main/rust-bridge', () => ({ isRustAvailable: () => false }))
vi.mock('../../src/main/memory/mnesis-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/main/memory/mnesis-client')>()
  return {
    ...original,
    MnesisWorkerClient: class {
      running = false
      error = null
      async start() { return false }
      stop() {}
      async messages() { return [] }
    }
  }
})

let bridge: AgentBridge

beforeEach(() => {
  harness.userData = fs.mkdtempSync(join(tmpdir(), 'lexicon-context-window-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  bridge = new AgentBridge({} as VcsEngine, {} as DocumentStore)
})

afterEach(() => {
  bridge.stopMnesis()
  vi.restoreAllMocks()
  fs.rmSync(harness.userData, { recursive: true, force: true })
})

describe('AgentBridge.configure context window', () => {
  it('auto-populates from the known table for a known model', () => {
    const cfg = bridge.configure({ endpoint: 'https://provider.example/v1/chat/completions', model: 'gpt-4' })
    expect(cfg.modelContextWindow).toBe(8192)
    expect(cfg.modelOutputReserve).toBe(2048)
    expect(cfg.modelTokenizer).toBe('cl100k_base')
  })

  it('prefers bundled provider catalog metadata over the known table', () => {
    const cfg = bridge.configure({
      endpoint: 'https://api.anthropic.com/v1/messages',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-20250514'
    })
    expect(cfg.modelContextWindow).toBe(200_000)
  })

  it('respects an explicit manual override and does not replace it', () => {
    const cfg = bridge.configure({
      endpoint: 'https://provider.example/v1/chat/completions',
      model: 'gpt-4',
      modelContextWindow: 256_000,
      modelOutputReserve: 8192,
      modelTokenizer: 'custom'
    })
    expect(cfg.modelContextWindow).toBe(256_000)
    expect(cfg.modelOutputReserve).toBe(8192)
    expect(cfg.modelTokenizer).toBe('custom')
  })

  it('clears a stale window when the model changes to an unknown one', () => {
    bridge.configure({ endpoint: 'https://provider.example/v1/chat/completions', model: 'gpt-4' })
    expect(bridge.getConfig().modelContextWindow).toBe(8192)

    const cfg = bridge.configure({ model: 'totally-unknown-model-xyz' })
    expect(cfg.modelContextWindow).toBeUndefined()
    expect(cfg.modelOutputReserve).toBeUndefined()
  })
})
