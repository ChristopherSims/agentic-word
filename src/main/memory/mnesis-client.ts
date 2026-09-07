/**
 * Mnesis worker client (memory.md Phase 1 skeleton, mnesis-phase0-spike.md)
 *
 * Spawns the Python sidecar (`native/mnesis-worker/worker.py`) and speaks
 * ndjson JSON-RPC over its stdin/stdout. Electron-free and unit-testable:
 * the spawn function is injectable, and framing lives in pure helpers.
 *
 * Kill switch: every failure mode (Python missing, worker missing, mnesis
 * package missing, worker crash, call timeout) degrades to "unavailable" and
 * the caller no-ops. The feature is off by default.
 */

import { spawn, type ChildProcess } from 'child_process'

// ─── Pure framing helpers (unit-tested) ───

/** Encode a request frame as a single ndjson line. */
export function encodeRequest(id: number, op: string, params: Record<string, unknown> = {}): string {
  return JSON.stringify({ id, op, params }) + '\n'
}

/** Response frame shape produced by the worker. */
export interface MnesisResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

/**
 * Accumulates stdout chunks and yields complete ndjson lines.
 * Pure (no I/O) — handles chunk boundaries splitting a JSON frame.
 */
export class LineFramer {
  private buffer = ''

  /** Feed a stdout chunk; returns every complete line (without newline). */
  push(chunk: string): string[] {
    this.buffer += chunk
    const lines: string[] = []
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (line) lines.push(line)
    }
    return lines
  }
}

/** Parse a response line; null when the frame is malformed. */
export function parseResponse(line: string): MnesisResponse | null {
  try {
    const parsed = JSON.parse(line)
    if (typeof parsed?.id !== 'number' || typeof parsed?.ok !== 'boolean') return null
    return parsed as MnesisResponse
  } catch {
    return null
  }
}

// ─── Client ───

/** Minimal process shape the client needs — injectable for tests. */
export interface MnesisProcess {
  stdin: { write(data: string): void }
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): void }
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): void }
  on(event: 'exit', cb: (code: number | null) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  kill(): void
}

export type SpawnFn = (command: string, args: string[]) => MnesisProcess

const defaultSpawn: SpawnFn = (command, args) => spawn(command, args) as unknown as MnesisProcess

export interface MnesisCallTimeouts {
  /** Per-request timeout. `messages` compaction can take a while. */
  default?: number
}

export interface MnesisWorkerOptions {
  pythonPath: string
  workerPath: string
  dbPath: string
  model: string
  spawnFn?: SpawnFn
  timeoutMs?: number
  onStderr?: (line: string) => void
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class MnesisWorkerClient {
  private proc: MnesisProcess | null = null
  private readonly pending = new Map<number, PendingCall>()
  private nextId = 1
  private readonly framer = new LineFramer()
  private readonly spawnFn: SpawnFn
  private readonly timeoutMs: number
  private readonly onStderr?: (line: string) => void
  private stderrBuffer = ''
  private lastError: string | null = null
  private startAttempted = false

  constructor(private readonly opts: MnesisWorkerOptions) {
    this.spawnFn = opts.spawnFn ?? defaultSpawn
    this.timeoutMs = opts.timeoutMs ?? 15_000
    this.onStderr = opts.onStderr
  }

  /** True once a process was spawned without an immediate error event. */
  get running(): boolean {
    return this.proc !== null
  }

  /** Last spawn/runtime failure, for diagnostics in the UI. */
  get error(): string | null {
    return this.lastError
  }

  /**
   * Spawn the worker and verify it answers `ping`. Resolves false (never
   * throws) when Python or the worker is unavailable — callers no-op.
   */
  async start(): Promise<boolean> {
    if (this.proc) return true
    this.startAttempted = true
    let proc: MnesisProcess
    try {
      proc = this.spawnFn(this.opts.pythonPath, [
        this.opts.workerPath,
        '--db', this.opts.dbPath,
        '--model', this.opts.model
      ])
    } catch (err) {
      this.lastError = `failed to spawn ${this.opts.pythonPath}: ${(err as Error).message}`
      return false
    }

    this.proc = proc
    proc.stdout.on('data', (chunk) => this.handleChunk(chunk))
    proc.stderr.on('data', (chunk) => this.handleStderr(chunk))
    proc.on('error', (err) => this.handleExit(`worker error: ${err.message}`))
    proc.on('exit', (code) => this.handleExit(`worker exited with code ${code}`))

    try {
      const pong = await this.call('ping', {}, 10_000)
      const result = pong as { mnesis?: boolean; version?: string }
      if (!result?.mnesis) {
        // Worker is alive but the Python environment lacks mnesis — report
        // unavailable and shut the process down. Single attempt per process.
        this.lastError = 'mnesis package not installed in the Python environment'
        this.stop()
        return false
      }
      return true
    } catch (err) {
      this.lastError = (err as Error).message
      this.stop()
      return false
    }
  }

  /** Terminate the worker (kill switch / app shutdown). Safe if not running. */
  stop(): void {
    const proc = this.proc
    this.proc = null
    if (proc) {
      try { proc.kill() } catch { /* already gone */ }
    }
    for (const [, call] of this.pending) {
      clearTimeout(call.timer)
      call.reject(new Error('mnesis worker stopped'))
    }
    this.pending.clear()
  }

  /**
   * Record a completed conversation turn for a document.
   * BYO-LLM mode: no LLM call, purely persistence + compaction accounting.
   */
  async record(documentId: string, userMessage: string, assistantResponse: string): Promise<void> {
    await this.call('record', { documentId, userMessage, assistantResponse })
  }

  /** Curated conversation history for a document (compacted to fit the budget). */
  async messages(documentId: string): Promise<Array<{ role: string; content: string }>> {
    return (await this.call('messages', { documentId })) as Array<{ role: string; content: string }>
  }

  /** Close the per-document session (e.g. when its tab closes). */
  async closeSession(documentId: string): Promise<void> {
    await this.call('close', { documentId })
  }

  private async call(op: string, params: Record<string, unknown>, timeoutMs = this.timeoutMs): Promise<unknown> {
    const proc = this.proc
    if (!proc) throw new Error('mnesis worker is not running')
    const id = this.nextId++
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`mnesis call "${op}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      proc.stdin.write(encodeRequest(id, op, params))
    })
  }

  private handleChunk(chunk: Buffer | string): void {
    for (const line of this.framer.push(chunk.toString('utf-8'))) {
      const response = parseResponse(line)
      if (!response) continue // non-protocol output — ignore
      const call = this.pending.get(response.id)
      if (!call) continue
      this.pending.delete(response.id)
      clearTimeout(call.timer)
      if (response.ok) call.resolve(response.result)
      else call.reject(new Error(response.error || 'mnesis worker error'))
    }
  }

  private handleStderr(chunk: Buffer | string): void {
    this.stderrBuffer += chunk.toString('utf-8')
    let idx: number
    while ((idx = this.stderrBuffer.indexOf('\n')) >= 0) {
      const line = this.stderrBuffer.slice(0, idx).trim()
      this.stderrBuffer = this.stderrBuffer.slice(idx + 1)
      if (line) this.onStderr?.(line)
    }
  }

  private handleExit(reason: string): void {
    this.lastError = this.startAttempted && this.proc ? reason : this.lastError
    this.proc = null
    for (const [, call] of this.pending) {
      clearTimeout(call.timer)
      call.reject(new Error(reason))
    }
    this.pending.clear()
  }
}
