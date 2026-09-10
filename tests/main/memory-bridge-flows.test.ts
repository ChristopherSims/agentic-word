/**
 * Bridge-level writing/review flows with a deterministic fake provider
 * (updates-2.md §G).
 *
 * These exercise the real AgentBridge/AgentMemoryStore through their public
 * APIs with an instrumented, offline provider so policy outcomes are asserted
 * directly. They are separate from optional live-model quality evaluation —
 * a fake provider proves control flow, not factual answer quality.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentBridge } from '../../src/main/agent-bridge'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import { MemoryError } from '../../src/main/memory/errors'
import type { VcsEngine } from '../../src/main/vcs-engine'
import type { DocumentStore } from '../../src/main/document-store'

const harness = vi.hoisted(() => ({
  userData: '',
  histories: new Map<string, Array<{ role: string; content: string }>>(),
  starts: 0
}))

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
      running = true
      error = null
      async start() { harness.starts++; return true }
      stop() { this.running = false }
      async messages(documentId: string) { return [...(harness.histories.get(documentId) ?? [])] }
      async record(documentId: string, user: string, assistant: string) {
        const history = harness.histories.get(documentId) ?? []
        history.push({ role: 'user', content: user }, { role: 'assistant', content: assistant })
        harness.histories.set(documentId, history)
        return { sessionId: 'sess-' + documentId, compactionTriggered: false }
      }
      async recordWithReceipt(documentId: string, user: string, assistant: string) {
        return this.record(documentId, user, assistant)
      }
      async forgetDocument(documentId: string) {
        harness.histories.delete(documentId)
        return { sessionsDeleted: 1, messagesDeleted: 2 }
      }
    }
  }
})

const SECRET = 'Synthetic confidential atlas meeting location is violet harbor'
let bridge: AgentBridge
let fetchMock: ReturnType<typeof vi.fn>

function completion(text: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
function streamResponse(text = 'Acknowledged.') {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' }
  })
}
const lastBody = () => String(fetchMock.mock.calls.at(-1)?.[1]?.body)

beforeEach(() => {
  harness.userData = fs.mkdtempSync(join(tmpdir(), 'lexicon-bridge-flows-'))
  harness.histories.clear()
  harness.starts = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fetchMock = vi.fn(async () => completion('Acknowledged.'))
  vi.stubGlobal('fetch', fetchMock)
  bridge = new AgentBridge({} as VcsEngine, {} as DocumentStore)
  bridge.configure({ endpoint: 'https://provider.example.invalid/v1/chat/completions', model: 'gpt-4' })
})

afterEach(() => {
  bridge.stopMnesis()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  fs.rmSync(harness.userData, { recursive: true, force: true })
})

async function chat(documentId: string, protectedDocument = false) {
  fetchMock.mockImplementation(async () => streamResponse())
  await bridge.handleChatStream([{ role: 'user', content: 'Continue.' }], { documentId, protectedDocument })
}

async function enableSidecar() {
  bridge.setConsent({ retainLocalChatHistory: true, backgroundSummarization: true })
  await bridge.setMnesisEnabled(true)
}

describe('bridge writing/review flows (§G)', () => {
  it('1. document fact reaches its own document request only', async () => {
    bridge.saveMemoryEntry('doc-a', 'fact', SECRET, 'document', { sourceType: 'user', approvalState: 'approved' })
    await chat('doc-b')
    expect(lastBody()).not.toContain(SECRET)
    await chat('doc-a')
    expect(lastBody()).toContain(SECRET)
  })

  it('2. global preference is withheld after cross-document consent is revoked', async () => {
    bridge.saveMemoryEntry('__global__', 'preference', SECRET, 'global', { sourceType: 'user', approvalState: 'approved' })
    bridge.setConsent({ crossDocumentPreferences: false })
    await chat('doc-b')
    expect(lastBody()).not.toContain(SECRET)
  })

  it('3. memory recall also withholds globals when consent is off', async () => {
    bridge.saveMemoryEntry('__global__', 'preference', SECRET, 'global', { sourceType: 'user', approvalState: 'approved' })
    bridge.setConsent({ crossDocumentPreferences: false })
    bridge.setPermissions({ memory: true })
    const result = await bridge.executeTool('memory_recall', { query: 'atlas violet harbor' })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('4. protected documents receive no retained memory in the request', async () => {
    bridge.saveMemoryEntry('doc-a', 'fact', SECRET, 'document', { sourceType: 'user', approvalState: 'approved' })
    await chat('doc-a', true)
    expect(lastBody()).not.toContain(SECRET)
  })

  it('5. review-time saves for a protected document are refused with a typed error', async () => {
    await chat('doc-a', true)
    let caught: unknown
    try { bridge.saveMemoryEntry('doc-a', 'correction', SECRET, 'document', { sourceType: 'agent' }) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(MemoryError)
  })

  it('6. remote-inference opt-out refuses a new chat without dispatching', async () => {
    bridge.setConsent({ remoteInference: false })
    await chat('doc-a')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('7. remote-inference opt-out gates the translate tool', async () => {
    bridge.setConsent({ remoteInference: false })
    const result = await bridge.executeTool('translate', { text: SECRET, targetLanguage: 'French' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).toContain('disabled')
  })

  it('8. remote-inference opt-out gates outline generation', async () => {
    bridge.setConsent({ remoteInference: false })
    const result = await bridge.executeTool('outline_generate', { topic: 'lighthouses' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).toContain('disabled')
  })

  it('9. multi-agent runs refuse to dispatch when remote consent is off', async () => {
    bridge.setConsent({ remoteInference: false })
    await expect(bridge.runMultiAgent('doc-a', SECRET, ['Writer'])).rejects.toThrow(/disabled/i)
  })

  it('10. retained-turn opt-out keeps turns out of the session file', async () => {
    bridge.setConsent({ retainLocalChatHistory: false })
    const session = bridge.getOrCreateSession('doc-a', 'Writer')
    bridge.addSessionMessage(session.id, 'user', SECRET)
    bridge.getOrCreateSession('doc-b', 'Reviewer')
    expect(fs.readFileSync(join(harness.userData, 'agent-sessions.json'), 'utf8')).not.toContain(SECRET)
  })

  it('11. sidecar never starts without background-summarization consent', async () => {
    await bridge.setMnesisEnabled(true)
    await chat('doc-a')
    expect(harness.starts).toBe(0)
  })

  it('12. forget reports a typed complete result and purges retained plaintext', async () => {
    await enableSidecar()
    const entry = bridge.saveMemoryEntry('doc-a', 'fact', SECRET, 'document', { sourceType: 'user', approvalState: 'approved' })
    const session = bridge.getOrCreateSession('doc-a', 'Writer')
    bridge.addSessionMessage(session.id, 'user', SECRET)
    const result = await bridge.forgetMemory(entry.id)
    expect(result.state).toBe('complete')
    expect(result.operationId).toMatch(/^del_/)
    const persisted = ['agent-memory.json', 'agent-sessions.json']
      .map((f) => fs.readFileSync(join(harness.userData, f), 'utf8')).join('\n')
    expect(persisted).not.toContain(SECRET)
  })

  it('13. deletion job status is durable and readable over the API', async () => {
    await enableSidecar()
    const entry = bridge.saveMemoryEntry('doc-a', 'fact', SECRET, 'document', { sourceType: 'user', approvalState: 'approved' })
    const result = await bridge.forgetMemory(entry.id)
    const job = bridge.getDeletionJob(result.operationId)
    expect(job?.state).toBe('complete')
    expect(bridge.pendingDeletionJobs()).toEqual([])
    expect(bridge.deletionResult(result.operationId)).toMatchObject({ state: 'complete' })
  })

  it('14. revoking access is dispose-only and blocks later recall', async () => {
    await bridge.setMnesisEnabled(true)
    bridge.setConsent({ retainLocalChatHistory: true, backgroundSummarization: true })
    bridge.saveMemoryEntry('doc-a', 'fact', SECRET, 'document', { sourceType: 'user', approvalState: 'approved' })
    harness.histories.set('doc-a', [{ role: 'user', content: SECRET }])
    const result = await bridge.revokeDocumentMemoryAccess('doc-a')
    expect(result.projectionDisposed).toBe(true)
    expect(bridge.getMemoryForDocument('doc-a')).toEqual([])
    expect(harness.histories.get('doc-a') ?? []).toEqual([])
  })

  it('15. clear document removes memory and disposes its projection', async () => {
    await bridge.setMnesisEnabled(true)
    bridge.setConsent({ retainLocalChatHistory: true, backgroundSummarization: true })
    bridge.saveMemoryEntry('doc-a', 'fact', SECRET, 'document', { sourceType: 'user', approvalState: 'approved' })
    harness.histories.set('doc-a', [{ role: 'user', content: SECRET }])
    bridge.clearMemoryForDocument('doc-a')
    await chat('doc-a')
    expect(lastBody()).not.toContain(SECRET)
  })

  it('16. templates are refused without explicit-facts consent', () => {
    bridge.setConsent({ rememberDocumentFacts: false })
    expect(() => bridge.applyMemoryTemplate('doc-a', 'novel')).toThrow(MemoryError)
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.getForDocument('doc-a')).toEqual([])
  })

  it('17. template global items are skipped without cross-document consent', () => {
    bridge.setConsent({ crossDocumentPreferences: false })
    bridge.applyMemoryTemplate('doc-a', 'novel')
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.getGlobal()).toEqual([])
    expect(reloaded.getForDocument('doc-a').length).toBeGreaterThan(0)
  })

  it('18. consolidation stores a candidate summary that is not injected before approval', async () => {
    for (let i = 0; i < 30; i++) {
      bridge.saveMemoryEntry('doc-a', 'fact', `Fact number ${i}`, 'document', { sourceType: 'user', approvalState: 'approved' })
    }
    fetchMock.mockImplementation(async () => completion('Consolidated summary.'))
    const result = await bridge.consolidateMemory('doc-a')
    expect(result.consolidated).toBeGreaterThan(0)
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    const summary = reloaded.getForDocument('doc-a').find((e) => e.type === 'summary')!
    expect(summary.approvalState).toBe('candidate')
    expect(reloaded.formatForPrompt('doc-a', 100)).not.toContain('Consolidated summary.')
  })

  it('19. consolidation excludes rejected facts from the batch and the summary', async () => {
    const rejected = bridge.saveMemoryEntry('doc-a', 'fact', SECRET, 'document', { sourceType: 'user', approvalState: 'approved' })
    for (let i = 0; i < 29; i++) {
      bridge.saveMemoryEntry('doc-a', 'fact', `Fact number ${i}`, 'document', { sourceType: 'user', approvalState: 'approved' })
    }
    bridge.setMemoryApproval(rejected.id, 'rejected')
    fetchMock.mockImplementation(async (_url, init) => completion(String((init as { body?: string })?.body).includes(SECRET) ? SECRET : 'Only approved facts.'))
    await bridge.consolidateMemory('doc-a')
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.formatForPrompt('doc-a', 100)).not.toContain(SECRET)
  })

  it('20. an oversized request is refused rather than over-sent', async () => {
    const longRequest = Array.from({ length: 20000 }, (_, i) => `word${i}`).join(' ')
    await bridge.handleChatStream([{ role: 'user', content: longRequest }], { documentId: 'doc-a' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('21. a normal request is dispatched within budget', async () => {
    await chat('doc-a')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('22. memory status distinguishes disabled-by-user from ready', () => {
    expect(bridge.memoryStatus().state).toBe('disabled-by-user')
    bridge.setConsent({ backgroundSummarization: true })
    void bridge.setMnesisEnabled(true)
    expect(['unavailable-runtime', 'ready']).toContain(bridge.memoryStatus().state)
  })

  it('23. tracks in-flight consolidation and drops it when a source is forgotten', async () => {
    const first = bridge.saveMemoryEntry('doc-a', 'fact', 'Fact zero', 'document', { sourceType: 'user', approvalState: 'approved' })
    for (let i = 1; i < 30; i++) {
      bridge.saveMemoryEntry('doc-a', 'fact', `Fact ${i}`, 'document', { sourceType: 'user', approvalState: 'approved' })
    }
    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve }))

    const consolidation = bridge.consolidateMemory('doc-a')
    await vi.waitFor(() => expect(bridge.consolidatingDocuments()).toContain('doc-a'))

    await bridge.forgetMemory(first.id)
    expect(bridge.consolidatingDocuments()).not.toContain('doc-a')

    release(completion('Consolidated summary.'))
    const result = await consolidation
    expect(result.consolidated).toBeGreaterThan(0)
    const reloaded = new AgentMemoryStore(join(harness.userData, 'agent-memory.json'))
    expect(reloaded.getForDocument('doc-a').filter((e) => e.type === 'summary')).toHaveLength(0)
  })

  it('24. withdrawing remote consent aborts an in-flight request', async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementationOnce((_url: string, init: { signal?: AbortSignal }) => {
      signal = init.signal
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    })
    const run = bridge.handleChatStream([{ role: 'user', content: 'hello' }], { documentId: 'doc-a' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    bridge.setConsent({ remoteInference: false })
    expect(signal?.aborted).toBe(true)
    await run
  })

  it('25. bounds summarize fan-out and discloses partial coverage', async () => {
    const big = Array.from({ length: 200 }, (_, i) => `<h2>Section ${i}</h2><p>${'filler '.repeat(800)}</p>`).join('\n')
    fetchMock.mockImplementation(async () => completion('Section summary.'))
    const summary = await bridge.handleSummarize(big, 'executive', 200)
    // 8 batch calls + 1 synthesis — never one provider call per section.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(9)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    expect(summary).toContain('Partial coverage')
  })
})
