/**
 * Preproduction release gates. These assert the intended privacy/recovery
 * contracts, not today's bugs. Failing tests are deliberately not marked
 * `.fails` or skipped: they must block release until the integration is fixed.
 *
 * Real AgentBridge + AgentMemoryStore, isolated temporary userData.
 * Electron/native runtime, model responses, and the sidecar transport are
 * mocked. This is NOT evidence of upstream compaction or physical erasure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentBridge } from '../../src/main/agent-bridge'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import type { VcsEngine } from '../../src/main/vcs-engine'
import type { DocumentStore } from '../../src/main/document-store'

const harness = vi.hoisted(() => ({
  userData: '',
  histories: new Map<string, Array<{ role: string; content: string }>>(),
  starts: 0,
  disposals: [] as string[],
  failMemoryWrites: false,
}))

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>()
  return {
    ...original,
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      if (harness.failMemoryWrites && String(args[0]).endsWith('agent-memory.json')) {
        throw new Error('Synthetic disk failure')
      }
      return original.writeFileSync(...args)
    },
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => harness.userData,
    getAppPath: () => harness.userData,
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))
vi.mock('../../src/main/rust-bridge', () => ({
  isRustAvailable: () => false,
}))
// The memory engine ships on Windows first; these integration tests mock the
// sidecar transport, so force the availability gate open on every platform.
vi.mock('../../src/main/memory/engine-availability', () => ({
  memoryEngineAvailability: () => ({ available: true, reason: null, detail: '' }),
}))
vi.mock('../../src/main/memory/mnesis-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/main/memory/mnesis-client')>()
  return {
    ...original,
    MnesisWorkerClient: class {
      running = true
      error = null
      async start() { harness.starts++; return true }
      stop() { this.running = false }
      async messages(documentId: string) {
        return [...(harness.histories.get(documentId) ?? [])]
      }
      async record(documentId: string, user: string, assistant: string) {
        const history = harness.histories.get(documentId) ?? []
        history.push({ role: 'user', content: user }, { role: 'assistant', content: assistant })
        harness.histories.set(documentId, history)
        return { compactionTriggered: false }
      }
      async forgetDocument(documentId: string) {
        harness.disposals.push(documentId)
        harness.histories.delete(documentId)
        return { sessionsDeleted: 1, messagesDeleted: 2 }
      }
    },
  }
})

let bridge: AgentBridge
let fetchMock: ReturnType<typeof vi.fn>
const SECRET = 'Synthetic confidential atlas meeting location is violet harbor'

function streamResponse(text = 'Acknowledged.') {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function saveFact(content = SECRET, documentId = 'doc-a', scope: 'document' | 'global' = 'document') {
  return bridge.saveMemoryEntry(documentId, 'fact', content, scope, {
    sourceType: 'user', approvalState: 'approved',
  })
}

function pair(documentId: string, user: string, assistant = 'Acknowledged.') {
  const session = bridge.getOrCreateSession(documentId, 'Writer')
  bridge.addSessionMessage(session.id, 'user', user)
  bridge.addSessionMessage(session.id, 'assistant', assistant)
  return session
}

async function enableSidecar() {
  bridge.setConsent({ retainLocalChatHistory: true, backgroundSummarization: true })
  await bridge.setMnesisEnabled(true)
}

async function chat(documentId = 'doc-a', protectedDocument = false) {
  await bridge.handleChatStream([{ role: 'user', content: 'Continue.' }], { documentId, protectedDocument })
}

function lastPayload() {
  return JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))
}

beforeEach(() => {
  harness.userData = fs.mkdtempSync(join(tmpdir(), 'lexicon-memory-review-'))
  harness.histories.clear()
  harness.disposals = []
  harness.starts = 0
  harness.failMemoryWrites = false
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fetchMock = vi.fn(async () => streamResponse())
  vi.stubGlobal('fetch', fetchMock)
  bridge = new AgentBridge({} as VcsEngine, {} as DocumentStore)
  bridge.configure({ endpoint: 'https://provider.example.invalid/v1/chat/completions', model: 'gpt-4' })
})

afterEach(async () => {
  // Drain recordTurn's fire-and-forget microtasks before fixture cleanup.
  await Promise.resolve()
  bridge.stopMnesis()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  fs.rmSync(harness.userData, { recursive: true, force: true })
})

describe('Memory integration release gates', () => {
  it('control: isolates approved document facts in actual requests', async () => {
    saveFact()
    await chat('doc-b')
    expect(JSON.stringify(lastPayload())).not.toContain(SECRET)
    await chat('doc-a')
    expect(JSON.stringify(lastPayload())).toContain(SECRET)
  })

  it('control: refuses a new remote request after consent is disabled', async () => {
    bridge.setConsent({ remoteInference: false })
    await chat()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('control: does not start a sidecar without background-summary consent', async () => {
    await bridge.setMnesisEnabled(true)
    await chat()
    expect(harness.starts).toBe(0)
  })

  it('blocks remote model calls made by tools after remote consent is disabled', async () => {
    bridge.setConsent({ remoteInference: false })
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Synthetic translation.' } }],
    }), { headers: { 'Content-Type': 'application/json' } }))
    await bridge.executeTool('translate', { text: SECRET, targetLanguage: 'French' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not flush non-retained chat when another session is created', () => {
    bridge.setConsent({ retainLocalChatHistory: false })
    pair('doc-a', SECRET)
    bridge.getOrCreateSession('doc-b', 'Reviewer')
    expect(fs.readFileSync(join(harness.userData, 'agent-sessions.json'), 'utf8')).not.toContain(SECRET)
  })

  it('honors retention opt-out in multi-agent chat', async () => {
    bridge.setConsent({ retainLocalChatHistory: false })
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Acknowledged.' } }],
    }), { headers: { 'Content-Type': 'application/json' } }))
    await bridge.runMultiAgent('doc-a', SECRET, ['Writer'])
    expect(fs.readFileSync(join(harness.userData, 'agent-sessions.json'), 'utf8')).not.toContain(SECRET)
  })

  it('excludes existing global preferences after cross-document consent is revoked', async () => {
    saveFact(SECRET, '__global__', 'global')
    bridge.setConsent({ crossDocumentPreferences: false })
    await chat('doc-b')
    expect(JSON.stringify(lastPayload())).not.toContain(SECRET)
  })

  it('honors fact and cross-document consent when applying templates', () => {
    bridge.setConsent({ rememberDocumentFacts: false, crossDocumentPreferences: false })
    try { bridge.applyMemoryTemplate('doc-a', 'novel') } catch { /* refusal is acceptable */ }
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect([...reloaded.getForDocument('doc-a'), ...reloaded.getGlobal()]).toEqual([])
  })

  it('removes forgotten plaintext from retained sessions and imported history', async () => {
    const fact = saveFact()
    pair('doc-a', SECRET)
    bridge.migrateLegacySessions()
    await bridge.forgetMemory(fact.id)
    const retained = ['agent-sessions.json', 'agent-memory.json']
      .map((file) => fs.readFileSync(join(harness.userData, file), 'utf8')).join('\n')
    expect(retained).not.toContain(SECRET)
  })

  it('does not send forgotten evidence through the raw-history fallback', async () => {
    const fact = saveFact()
    const session = pair('doc-a', SECRET)
    await bridge.forgetMemory(fact.id)
    await bridge.handleChatStream([
      ...bridge.getSessionMessages(session.id), { role: 'user', content: 'Continue.' },
    ], { documentId: 'doc-a' })
    expect(JSON.stringify(lastPayload())).not.toContain(SECRET)
  })

  it('does not resurrect a projection forgotten while the sidecar was disabled', async () => {
    harness.histories.set('doc-a', [
      { role: 'user', content: SECRET }, { role: 'assistant', content: 'Acknowledged.' },
    ])
    const fact = saveFact()
    await bridge.forgetMemory(fact.id)
    await enableSidecar()
    await chat()
    expect(JSON.stringify(lastPayload())).not.toContain(SECRET)
  })

  it('preserves unrelated complete turns after filtering a forgotten user message', async () => {
    await enableSidecar()
    const fact = saveFact()
    const unrelated = [
      { role: 'user', content: 'What is the next chapter?' },
      { role: 'assistant', content: 'The next chapter is about navigation.' },
    ]
    harness.histories.set('doc-a', [
      { role: 'user', content: SECRET },
      { role: 'assistant', content: 'Acknowledged.' },
      ...unrelated,
    ])
    await bridge.forgetMemory(fact.id)
    expect(harness.histories.get('doc-a')).toEqual(unrelated)
  })

  it('removes all revoked document history rather than rebuilding unlisted evidence', async () => {
    await enableSidecar()
    saveFact('Use concise paragraphs for every response.')
    harness.histories.set('doc-a', [
      { role: 'user', content: SECRET }, { role: 'assistant', content: 'Acknowledged.' },
    ])
    const result = await bridge.revokeDocumentMemoryAccess('doc-a')
    expect(result.projectionDisposed).toBe(true)
    expect(harness.histories.get('doc-a') ?? []).toEqual([])
  })

  it('clears sidecar history when clearing all document memory', async () => {
    await enableSidecar()
    saveFact()
    harness.histories.set('doc-a', [
      { role: 'user', content: SECRET }, { role: 'assistant', content: 'Acknowledged.' },
    ])
    bridge.clearMemoryForDocument('doc-a')
    await chat()
    expect(JSON.stringify(lastPayload())).not.toContain(SECRET)
  })

  it('preserves previously projected turns during an incremental migration rebuild', async () => {
    await enableSidecar()
    const session = pair('doc-a', 'First imported turn.', 'First answer.')
    bridge.migrateLegacySessions()
    expect((await bridge.rebuildProjectionsFromMigration()).turnsReplayed).toBe(1)
    const original = [...harness.histories.get('doc-a')!]
    // Re-running without newly imported events must be a no-op.
    expect((await bridge.rebuildProjectionsFromMigration()).turnsReplayed).toBe(0)
    expect(harness.histories.get('doc-a')).toEqual(original)
    bridge.addSessionMessage(session.id, 'user', 'Second imported turn.')
    bridge.addSessionMessage(session.id, 'assistant', 'Second answer.')
    bridge.migrateLegacySessions()
    await bridge.rebuildProjectionsFromMigration()
    expect(harness.histories.get('doc-a')).toEqual([
      ...original,
      { role: 'user', content: 'Second imported turn.' },
      { role: 'assistant', content: 'Second answer.' },
    ])
  })

  it('does not mix independent agent sessions through a document-wide projection', async () => {
    await enableSidecar()
    pair('doc-a', SECRET)
    bridge.migrateLegacySessions()
    await bridge.rebuildProjectionsFromMigration()
    const reviewer = bridge.getOrCreateSession('doc-a', 'Reviewer')
    await bridge.handleChatStream([
      ...bridge.getSessionMessages(reviewer.id), { role: 'user', content: 'Review.' },
    ], { documentId: 'doc-a' })
    expect(JSON.stringify(lastPayload())).not.toContain(SECRET)
  })

  it('keeps protected runs ephemeral when another chat starts before completion', async () => {
    await enableSidecar()
    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve }))
    const protectedRun = bridge.handleChatStream([{ role: 'user', content: SECRET }], {
      documentId: 'protected-doc', protectedDocument: true,
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await chat('ordinary-doc')
    release(streamResponse('Protected answer.'))
    await protectedRun
    await Promise.resolve()
    await Promise.resolve()
    expect(harness.histories.get('protected-doc') ?? []).toEqual([])
  })

  it('blocks memory recall tools as well as prompt injection for protected documents', async () => {
    saveFact()
    await chat('doc-a', true)
    bridge.setPermissions({ memory: true })
    const result = await bridge.executeTool('memory_recall', { query: 'atlas violet harbor' })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('rejects durable review-memory writes for a protected document', async () => {
    await chat('doc-a', true)
    try {
      // The renderer's rejectEdit path calls this public memory-save API,
      // not the separately guarded memory_save tool.
      bridge.saveMemoryEntry('doc-a', 'correction', SECRET, 'document', { sourceType: 'agent' })
    } catch { /* refusal is acceptable */ }
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.getForDocument('doc-a')).toEqual([])
  })

  it('does not report successful forget when the canonical disk write fails', async () => {
    const fact = saveFact()
    harness.failMemoryWrites = true
    let rejected = false
    try { await bridge.forgetMemory(fact.id) } catch { rejected = true }
    // The original remains on disk. The operation must expose a failure,
    // not acknowledge completion from the in-memory Map alone.
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.getForDocument('doc-a')).toHaveLength(1)
    expect(rejected).toBe(true)
  })

  it('does not recreate forgotten facts when an in-flight consolidation finishes', async () => {
    let clock = Date.now()
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => ++clock)
    const fact = saveFact()
    for (let i = 0; i < 29; i++) saveFact(`Independent fixture fact number ${i}.`)
    dateSpy.mockRestore()
    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve }))
    const consolidation = bridge.consolidateMemory('doc-a')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.stringify(lastPayload())).toContain(SECRET)
    await bridge.forgetMemory(fact.id)
    release(new Response(JSON.stringify({
      choices: [{ message: { content: SECRET } }],
    }), { headers: { 'Content-Type': 'application/json' } }))
    const result = await consolidation
    expect(result.consolidated).toBeGreaterThan(0)
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.formatForPrompt('doc-a', 100)).not.toContain(SECRET)
  })

  it('suppresses exact forgotten text in non-Latin languages', async () => {
    const text = 'Всегда используйте короткие предложения без сложных терминов'
    const fact = saveFact(text)
    await bridge.forgetMemory(fact.id)
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.isSuppressed(text, 'doc-a')).toBe(true)
  })

  it('does not reactivate rejected facts through consolidation', async () => {
    let clock = Date.now()
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => ++clock)
    const rejected = saveFact()
    bridge.setMemoryApproval(rejected.id, 'rejected')
    for (let i = 0; i < 29; i++) saveFact(`Independent fixture fact number ${i}.`)
    dateSpy.mockRestore()
    fetchMock.mockImplementation(async (_url, options) => new Response(JSON.stringify({
      choices: [{ message: {
        content: String(options.body).includes(SECRET) ? SECRET : 'Only approved fixture facts.',
      } }],
    }), { headers: { 'Content-Type': 'application/json' } }))
    await bridge.consolidateMemory('doc-a')
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.formatForPrompt('doc-a', 100)).not.toContain(SECRET)
  })

  it('bounds the serialized request rather than only six context fields', async () => {
    const longRequest = Array.from({ length: 20000 }, (_, i) => `word${i}`).join(' ')
    await bridge.handleChatStream([{ role: 'user', content: longRequest }], { documentId: 'doc-a' })
    // Refusing or budgeting an oversized request are both acceptable.
    if (!fetchMock.mock.calls.length) return
    const report = bridge.contextRunReports()[0]
    expect(report.totalChars).toBeLessThanOrEqual(report.budgetChars)
    expect(JSON.stringify(lastPayload()).length).toBeLessThanOrEqual(report.budgetChars)
  })
})
