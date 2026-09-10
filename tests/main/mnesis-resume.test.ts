/**
 * Mnesis worker resume + environment contract (updates-2.md §E).
 * Python-free: drives the client with an injectable fake process.
 */

import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import {
  MnesisWorkerClient,
  MnesisTimeoutError,
  isUncertainRecordFailure,
  isSupportedMnesisVersion,
  workerEnv,
  WORKER_ENV_ALLOWLIST,
  type MnesisProcess,
  type SpawnFn
} from '../../src/main/memory/mnesis-client'

class FakeProcess extends EventEmitter implements MnesisProcess {
  written: string[] = []
  respond: (request: string) => { id: number; ok: boolean; result?: unknown; error?: string } | null = () => null
  private stdoutCb: (c: Buffer) => void = () => {}
  private stderrCb: (c: Buffer) => void = () => {}

  stdin = {
    write: (data: string) => {
      this.written.push(data)
      const response = this.respond(data)
      if (response) queueMicrotask(() => this.stdoutCb(Buffer.from(JSON.stringify(response) + '\n')))
    }
  }
  stdout = { on: (_: 'data', cb: (c: Buffer) => void) => { this.stdoutCb = cb } }
  stderr = { on: (_: 'data', cb: (c: Buffer) => void) => { this.stderrCb = cb } }
  kill(): void { this.emit('exit', 0) }
}

function makeClient(fake: FakeProcess) {
  const spawnFn: SpawnFn = vi.fn(() => fake)
  return new MnesisWorkerClient({
    pythonPath: 'python',
    workerPath: '/fake/worker.py',
    dbPath: '/fake/db.sqlite',
    model: 'openai/gpt-4o',
    spawnFn,
    timeoutMs: 200
  })
}

describe('worker environment whitelist (§E)', () => {
  it('keeps runtime settings and drops ambient provider credentials', () => {
    const env = workerEnv({
      PATH: '/usr/bin',
      TEMP: '/tmp',
      HOME: '/home/u',
      OPENAI_API_KEY: 'sk-secret',
      ANTHROPIC_API_KEY: 'sk-another',
      AWS_SECRET_ACCESS_KEY: 'aws-secret'
    } as NodeJS.ProcessEnv)
    expect(env.PATH).toBe('/usr/bin')
    expect(env.TEMP).toBe('/tmp')
    expect(env.HOME).toBe('/home/u')
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(Object.keys(env).every((k) => WORKER_ENV_ALLOWLIST.includes(k))).toBe(true)
  })
})

describe('worker resume protocol (§E)', () => {
  it('rejects an unsupported worker protocol before using history', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0', protocol: 0 } }
    }
    const client = makeClient(fake)
    await expect(client.start()).resolves.toBe(false)
    expect(client.error).toContain('protocol')
  })

  it('rejects an unsupported Mnesis package version (fail closed)', async () => {
    expect(isSupportedMnesisVersion('0.3.0')).toBe(true)
    expect(isSupportedMnesisVersion('0.3.7')).toBe(true)
    expect(isSupportedMnesisVersion('0.4.0')).toBe(false)
    expect(isSupportedMnesisVersion('1.0.0')).toBe(false)
    expect(isSupportedMnesisVersion('unknown')).toBe(false)
    expect(isSupportedMnesisVersion(undefined)).toBe(false)

    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      return { id: frame.id, ok: true, result: { mnesis: true, version: '0.4.1', protocol: 1 } }
    }
    const client = makeClient(fake)
    await expect(client.start()).resolves.toBe(false)
    expect(client.error).toContain('version')
  })

  it('loads an existing session explicitly and recordWithReceipt returns the session id', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0', protocol: 1 } }
      if (frame.op === 'load') return { id: frame.id, ok: true, result: { sessionId: 'sess-1', found: true } }
      if (frame.op === 'record') {
        return { id: frame.id, ok: true, result: { sessionId: 'sess-1', compactionTriggered: false } }
      }
      return null
    }
    const client = makeClient(fake)
    await expect(client.start()).resolves.toBe(true)

    await expect(client.load('doc-a', 'sess-1')).resolves.toEqual({ sessionId: 'sess-1', found: true })
    const loadFrame = JSON.parse(fake.written.find((w) => JSON.parse(w).op === 'load')!)
    expect(loadFrame.params).toEqual({ documentId: 'doc-a', sessionId: 'sess-1' })

    await expect(client.recordWithReceipt('doc-a', 'hi', 'hello')).resolves.toEqual({
      sessionId: 'sess-1',
      compactionTriggered: false
    })
    // record() keeps its void contract for existing callers.
    await expect(client.record('doc-a', 'hi', 'hello')).resolves.toBeUndefined()
  })

  it('carries a per-generation database path on every operation', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0', protocol: 1 } }
      if (frame.op === 'record') return { id: frame.id, ok: true, result: { sessionId: 's1' } }
      if (frame.op === 'messages') return { id: frame.id, ok: true, result: [] }
      if (frame.op === 'load') return { id: frame.id, ok: true, result: { sessionId: 's1', found: true } }
      if (frame.op === 'forget') return { id: frame.id, ok: true, result: { sessionsDeleted: 1, messagesDeleted: 2 } }
      return null
    }
    const client = makeClient(fake)
    await client.start()
    const dbPath = '/gen/gen_123/sessions.db'

    await client.recordWithReceipt('doc-a', 'hi', 'hello', dbPath)
    await client.messages('doc-a', dbPath)
    await client.load('doc-a', undefined, dbPath)
    await client.forgetDocument('doc-a', dbPath)

    for (const op of ['record', 'messages', 'load', 'forget']) {
      const frame = JSON.parse(fake.written.find((w) => JSON.parse(w).op === op)!)
      expect(frame.params.dbPath).toBe(dbPath)
    }
  })

  it('reports compaction unavailable unless the worker advertises it (§E)', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      if (frame.op === 'ping') {
        return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0', protocol: 1, capabilities: ['record'], compaction: false } }
      }
      return null
    }
    const client = makeClient(fake)
    await expect(client.start()).resolves.toBe(true)
    expect(client.compactionAvailable).toBe(false)
    expect(client.capabilitiesList).toContain('record')
  })

  it('classifies a timed-out record as an uncertain outcome', async () => {
    const fake = new FakeProcess()
    fake.respond = (req) => {
      const frame = JSON.parse(req)
      // ping answers; record never does, forcing a timeout.
      if (frame.op === 'ping') return { id: frame.id, ok: true, result: { mnesis: true, version: '0.3.0', protocol: 1 } }
      return null
    }
    const spawnFn: SpawnFn = vi.fn(() => fake)
    const client = new MnesisWorkerClient({
      pythonPath: 'python',
      workerPath: '/fake/worker.py',
      dbPath: '/fake/db.sqlite',
      model: 'openai/gpt-4o',
      spawnFn,
      timeoutMs: 40
    })
    await client.start()

    let caught: unknown
    try {
      await client.recordWithReceipt('doc-a', 'hi', 'hello')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MnesisTimeoutError)
    expect(isUncertainRecordFailure(caught)).toBe(true)
    expect(isUncertainRecordFailure(new Error('worker exited'))).toBe(false)
  })
})
