/**
 * §A: stored consent is applied before conversations are restored.
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
    encryptString: (v: string) => Buffer.from(v),
    decryptString: (v: Buffer) => v.toString()
  }
}))
vi.mock('../../src/main/rust-bridge', () => ({ isRustAvailable: () => false }))

beforeEach(() => {
  harness.userData = fs.mkdtempSync(join(tmpdir(), 'lexicon-consent-order-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(harness.userData, { recursive: true, force: true })
})

describe('consent-before-restore ordering (§A)', () => {
  it('applies persisted consent before restoring sessions', () => {
    fs.writeFileSync(
      join(harness.userData, 'agent-config.json'),
      JSON.stringify({ consent: { retainLocalChatHistory: false, crossDocumentPreferences: false } }),
      'utf-8'
    )
    // A pre-existing retained session on disk.
    fs.writeFileSync(
      join(harness.userData, 'agent-sessions.json'),
      JSON.stringify({ sessions: [{ id: 'doc-a:Writer', documentId: 'doc-a', agentName: 'Writer', systemPrompt: '', messages: [{ role: 'user', content: 'prior retained turn' }], createdAt: 1, updatedAt: 2 }] }),
      'utf-8'
    )

    const bridge = new AgentBridge({} as VcsEngine, {} as DocumentStore)
    // Consent is effective immediately, without init()/loadConfig().
    expect(bridge.getConsent().retainLocalChatHistory).toBe(false)
    expect(bridge.getConsent().crossDocumentPreferences).toBe(false)

    // New turns added under the opt-out are not persisted into the session file.
    const session = bridge.getOrCreateSession('doc-a', 'Writer')
    bridge.addSessionMessage(session.id, 'user', 'ephemeral secret')
    expect(fs.readFileSync(join(harness.userData, 'agent-sessions.json'), 'utf8')).not.toContain('ephemeral secret')
    bridge.stopMnesis()
  })
})
