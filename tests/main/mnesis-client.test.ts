/**
 * Unit tests for the Mnesis worker client (memory.md Phase 1).
 * The client is Electron-free with an injectable spawn function, so these
 * run in the plain Node vitest environment without Python.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  encodeRequest,
  LineFramer,
  parseResponse,
  selectConversationMessages,
  resolveMnesisPaths,
  MnesisWorkerClient,
  planCompaction,
  compactConversation,
  estimateMessagesTokens,
  type MnesisProcess,
  type SpawnFn
} from '../../src/main/memory/mnesis-client'
import { EventEmitter } from 'events'

describe('framing helpers', () => {
  it('encodes a request as a single ndjson line', () => {
    const line = encodeRequest(3, 'record', { documentId: 'doc-1' })
    expect(line.endsWith('\n')).toBe(true)
    expect(JSON.parse(line)).toEqual({ id: 3, op: 'record', params: { documentId: 'doc-1' } })
  })

  it('reassembles frames split across chunk boundaries', () => {
    const framer = new LineFramer()
    const full = JSON.stringify({ id: 1, ok: true, result: null }) + '\n'
    const mid = Math.floor(full.length / 2)
    expect(framer.push(full.slice(0, mid))).toEqual([])
    expect(framer.push(full.slice(mid))).toEqual([full.trim()])
  })

  it('yields multiple lines from one chunk and ignores blank lines', () => {
    const framer = new LineFramer()
    const lines = framer.push('{"id":1,"ok":true}\n\n{"id":2,"ok":false}\n')
    expect(lines).toEqual(['{"id":1,"ok":true}', '{"id":2,"ok":false}'])
  })

  it('parseResponse accepts valid frames and rejects malformed ones', () => {
    expect(parseResponse('{"id":1,"ok":true,"result":{"a":1}}')).toEqual({
      id: 1,
      ok: true,
      result: { a: 1 }
    })
    expect(parseResponse('not json')).toBeNull()
    expect(parseResponse('{"id":"1","ok":true}')).toBeNull() // non-numeric id
    expect(parseResponse('{"id":1}')).toBeNull() // missing ok
  })
})

/** A fake MnesisProcess driven by an EventEmitter, with programmable behavior. */
class FakeProcess extends EventEmitter implements MnesisProcess {
  written: string[] = []
  respond: (request: string) => { id: number; ok: boolean; result?: unknown; error?: string } | null = () => null
  crashAfterWrite = false

  stdin = {
    write: (data: string) => {
      this.written.push(data)
      const response = this.respond(data)
      if (response) queueMicrotask(() => this.emitResponse(response))
      if (this.crashAfterWrite) queueMicrotask(() => this.emit('exit', 1))
    }
  }
  stdout = { on: (_: 'data', cb: (c: Buffer) => void) => { this.stdoutCb = cb } }
  stderr = { on: (_: 'data', cb: (c: Buffer) => void) => { this.stderrCb = cb } }
  private stdoutCb: (c: Buffer) => void = () => {}
  private stderrCb: (c: Buffer) => void = () => {}
  private onExit: (code: number | null) => void = () => {}

  constructor() {
    super()
    this.on('exit', (code) => this.onExit(code))
  }

  private emitResponse(r: { id: number; ok: boolean; result?: unknown; error?: string }): void {
    this.stdoutCb(Buffer.from(JSON.stringify(r) + '\n'))
  }

  kill(): void {
    this.emit('exit', 0)
  }
}

function makeClient(fake: FakeProcess, opts: Partial<ConstructorParameters<typeof MnesisWorkerClient>[0]> = {}) {
  const spawnFn: SpawnFn = vi.fn(() => fake)
  const client = new MnesisWorkerClient({
    pythonPath: 'python',
    workerPath: '/fake/worker.py',
    dbPath: '/fake/db.sqlite',
    model: 'openai/gpt-4o',
    spawnFn,
    timeoutMs: 200,
    ...opts
  })
  return { client, spawnFn }
}

describe('selectConversationMessages', () => {
  it('falls back to incoming messages when curated history is unavailable', () => {
    const incoming = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'write a poem' }
    ]
    expect(selectConversationMessages(null, incoming)).toBe(incoming)
    expect(selectConversationMessages([], incoming)).toBe(incoming)
  })

  it('uses curated history for prior turns and appends the current request once', () => {
    const incoming = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'write a poem' }
    ]
    const curated = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ]
    expect(selectConversationMessages(curated, incoming)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'write a poem' }
    ])
  })

  it('keeps local history when the worker is behind the local transcript', () => {
    const incoming = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' }
    ]
    const curated = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' }
    ]
    expect(selectConversationMessages(curated, incoming)).toBe(incoming)
  })

  it('does not duplicate a current request the worker already recorded (retry)', () => {
    const incoming = [{ role: 'user', content: 'q2' }]
    const curated = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' }
    ]
    expect(selectConversationMessages(curated, incoming)).toEqual(curated)
  })

  it('returns incoming when there is no user message to append', () => {
    const incoming = [{ role: 'assistant', content: 'a1' }]
    expect(selectConversationMessages([{ role: 'user', content: 'q1' }], incoming)).toBe(incoming)
  })
})

describe('resolveMnesisPaths (packaging, memory.md §13)', () => {
  const base = {
    isPackaged: false,
    resourcesPath: 'C:\\app\\resources',
    appPath: 'G:\\repo',
    platform: 'win32',
    exists: (p: string) => p.includes('mnesis-runtime')
  }

  it('dev builds run the worker from the repo and use system python', () => {
    const r = resolveMnesisPaths(base)
    expect(r.pythonPath).toBe('python')
    expect(r.workerPath).toBe('G:\\repo\\native\\mnesis-worker\\worker.py')
    expect(r.runtimeBundled).toBe(false)
  })

  it('packaged builds prefer the bundled runtime under extraResources', () => {
    const r = resolveMnesisPaths({ ...base, isPackaged: true })
    expect(r.pythonPath).toBe('C:\\app\\resources\\mnesis-runtime\\python.exe')
    expect(r.workerPath).toBe('C:\\app\\resources\\mnesis-worker\\worker.py')
    expect(r.runtimeBundled).toBe(true)
  })

  it('packaged builds without a bundled runtime fall back to system python', () => {
    const r = resolveMnesisPaths({ ...base, isPackaged: true, exists: () => false })
    expect(r.pythonPath).toBe('python')
    expect(r.runtimeBundled).toBe(false)
  })

  it('an explicit user-configured interpreter always wins', () => {
    const r = resolveMnesisPaths({ ...base, isPackaged: true, configPythonPath: 'C:\\py\\python.exe' })
    expect(r.pythonPath).toBe('C:\\py\\python.exe')
    expect(r.runtimeBundled).toBe(false)
  })

  it('non-Windows runtimes resolve to bin/python3 with forward slashes', () => {
    const r = resolveMnesisPaths({
      ...base,
      isPackaged: true,
      platform: 'linux',
      resourcesPath: '/opt/lexicon/resources'
    })
    expect(r.pythonPath).toBe('/opt/lexicon/resources/mnesis-runtime/bin/python3')
    expect(r.workerPath).toBe('/opt/lexicon/resources/mnesis-worker/worker.py')
    expect(r.runtimeBundled).toBe(true)
  })
})

describe('MnesisWorkerClient', () => {
  it('starts, pings, and reports running', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0' } }
      return null
    }
    const { client } = makeClient(fake)
    expect(await client.start()).toBe(true)
    expect(client.running).toBe(true)
    // The first frame written to the worker's stdin is the ping request
    expect(fake.written[0]).toContain('"op":"ping"')
  })

  it('does not trust upstream compaction for availability (§E)', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0', compaction: true } }
      return null
    }
    const { client } = makeClient(fake)
    await client.start()
    // Upstream reports native compaction, but only the verified TS hook counts.
    expect(client.upstreamCompaction).toBe(true)
    expect(client.compactionAvailable).toBe(false)
    client.setSummarizer(async () => 'summary')
    expect(client.compactionAvailable).toBe(true)
  })

  it('reports unavailable when the mnesis package is missing and stops the process', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      return { id: frame.id, ok: true, result: { mnesis: false, version: '0.3.0' } }
    }
    const { client } = makeClient(fake)
    expect(await client.start()).toBe(false)
    expect(client.running).toBe(false)
    expect(client.error).toContain('mnesis package not installed')
  })

  it('resolves record calls with the matching response id', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0' } }
      if (frame.op === 'record') {
        return {
          id: frame.id,
          ok: true,
          result: { userMessageId: 'u1', assistantMessageId: 'a1', compactionTriggered: false }
        }
      }
      return null
    }
    const { client } = makeClient(fake)
    await client.start()
    await expect(client.record('doc-1', 'hello', 'world')).resolves.toBeUndefined()
  })

  it('lists sessions (id + agent) for legacy-store planning (§D)', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0' } }
      if (frame.op === 'sessions') {
        return { id: frame.id, ok: true, result: [{ sessionId: 's1', agent: 'doc-a' }, { sessionId: 's2', agent: null }] }
      }
      return null
    }
    const { client } = makeClient(fake)
    await client.start()
    const listed = await client.sessions('/tmp/sessions.db')
    expect(listed).toEqual([{ sessionId: 's1', agent: 'doc-a' }, { sessionId: 's2', agent: null }])
    expect(String(fake.written.at(-1))).toContain('"dbPath":"/tmp/sessions.db"')
  })

  it('purges explicitly named sessions (§D)', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0' } }
      if (frame.op === 'purge') return { id: frame.id, ok: true, result: { sessionsDeleted: 2, messagesDeleted: 4 } }
      return null
    }
    const { client } = makeClient(fake)
    await client.start()
    await expect(client.purge(['s1', 's2'], '/tmp/sessions.db')).resolves.toEqual({ sessionsDeleted: 2, messagesDeleted: 4 })
  })

  it('rejects calls whose response reports an error', async () => {    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0' } }
      return { id: frame.id, ok: false, error: 'boom' }
    }
    const { client } = makeClient(fake)
    await client.start()
    await expect(client.record('doc-1', 'hello', 'world')).rejects.toThrow('boom')
  })

  it('times out when the worker never responds', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0' } }
      return null // record never answered
    }
    const { client } = makeClient(fake, { timeoutMs: 30 })
    await client.start()
    await expect(client.record('doc-1', 'hello', 'world')).rejects.toThrow('timed out')
  })

  it('rejects pending calls and marks itself down when the worker crashes', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0' } }
      return null
    }
    fake.crashAfterWrite = false
    const { client } = makeClient(fake, { timeoutMs: 5000 })
    await client.start()
    const pending = client.record('doc-1', 'hello', 'world')
    fake.emit('exit', 1)
    await expect(pending).rejects.toThrow('worker exited')
    expect(client.running).toBe(false)
  })

  it('calls are a no-op failure when the worker is not running', async () => {
    const fake = new FakeProcess()
    const { client } = makeClient(fake)
    await expect(client.record('doc-1', 'hello', 'world')).rejects.toThrow('not running')
  })
})

describe('TS summarization / compaction hook (§E)', () => {
  const estimate = (text: string) => text.length

  it('keeps the newest turns within budget and summarizes the older prefix', () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'user', content: 'b'.repeat(100) },
      { role: 'user', content: 'c'.repeat(100) }
    ]
    const plan = planCompaction(messages, estimate, 110)
    expect(plan.keep).toEqual([messages[2]])
    expect(plan.older).toEqual([messages[0], messages[1]])
    expect(estimateMessagesTokens(messages, estimate)).toBeGreaterThan(0)
  })

  it('compacts only when over budget and delegates to the summarizer', async () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'user', content: 'b'.repeat(100) },
      { role: 'user', content: 'c'.repeat(100) }
    ]
    const seen: string[] = []
    const summarizer = async (older: Array<{ role: string; content: string }>) => {
      seen.push(older.map((m) => m.content).join('|'))
      return 'condensed'
    }

    const compacted = await compactConversation(messages, estimate, 110, summarizer)
    expect(compacted.droppedCount).toBe(2)
    expect(compacted.summary).toBe('condensed')
    expect(compacted.messages[0].content).toContain('condensed')
    await expect(compactConversation(messages, estimate, 10_000, summarizer)).resolves.toMatchObject({ droppedCount: 0, summary: null })

    const client = new MnesisWorkerClient({ pythonPath: 'python', workerPath: 'w.py', dbPath: 's.db', model: 'm', spawnFn: (() => { throw new Error('unused') }) as unknown as SpawnFn })
    expect(client.compactionAvailable).toBe(false)
    client.setSummarizer(summarizer)
    expect(client.summarizerAvailable).toBe(true)
    expect(client.compactionAvailable).toBe(true)
    const viaClient = await client.compact(messages, estimate, 110)
    expect(viaClient.droppedCount).toBe(2)
    expect(seen.length).toBeGreaterThan(0)
  })
})
