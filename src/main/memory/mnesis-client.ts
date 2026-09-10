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
import * as path from 'path'

// ─── Packaged-path resolution (memory.md §13 packaging) ───

export interface MnesisPathInput {
  /** true in a packaged (electron-builder) app */
  isPackaged: boolean
  /** process.resourcesPath — extraResources land here when packaged */
  resourcesPath: string
  /** app.getAppPath() — dev repo root */
  appPath: string
  /** user-configured interpreter path (AgentConfig.mnesisPythonPath) */
  configPythonPath?: string
  /** process.platform ('win32' | 'darwin' | 'linux') */
  platform: string
  /** fs.existsSync, injectable for tests */
  exists: (p: string) => boolean
}

export interface MnesisPaths {
  /** interpreter to spawn */
  pythonPath: string
  /** worker script — extraResources path when packaged (never inside asar) */
  workerPath: string
  /** true when the bundled embeddable runtime is used */
  runtimeBundled: boolean
}

/**
 * Resolve interpreter + worker paths for dev and packaged builds. In a
 * packaged app the worker ships under extraResources (outside asar — Python
 * cannot read asar), and if an embeddable runtime was bundled
 * (native/mnesis-runtime → resources/mnesis-runtime) it wins over the
 * system 'python'. An explicit user config always wins. Pure + tested.
 */
export function resolveMnesisPaths(input: MnesisPathInput): MnesisPaths {
  const sep = input.platform === 'win32' ? '\\' : '/'
  const join = (...parts: string[]) => parts.join(sep)
  const workerPath = input.isPackaged
    ? join(input.resourcesPath, 'mnesis-worker', 'worker.py')
    : join(input.appPath, 'native', 'mnesis-worker', 'worker.py')

  if (input.configPythonPath) {
    return { pythonPath: input.configPythonPath, workerPath, runtimeBundled: false }
  }
  const exe = input.platform === 'win32' ? 'python.exe' : 'bin/python3'
  const bundled = input.isPackaged ? join(input.resourcesPath, 'mnesis-runtime', exe) : ''
  if (bundled && input.exists(bundled)) {
    return { pythonPath: bundled, workerPath, runtimeBundled: true }
  }
  return { pythonPath: 'python', workerPath, runtimeBundled: false }
}

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

export interface ConversationMessage {
  role: string
  content: string
}

/**
 * Choose the conversation messages for the next model request (memory.md §8.2,
 * §9): when Mnesis curated history is available, use it for prior turns and
 * append the current user request exactly once. Falls back to the caller's
 * messages when the worker is unavailable, behind, or already contains the
 * current request (retry of a recorded turn).
 *
 * Pure — unit-tested.
 */
export function selectConversationMessages(
  curated: ConversationMessage[] | null,
  incoming: ConversationMessage[]
): ConversationMessage[] {
  if (!curated || curated.length === 0) return incoming

  // The current request is the last incoming user message.
  let lastUserIdx = -1
  for (let i = incoming.length - 1; i >= 0; i--) {
    if (incoming[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx === -1) return incoming // no user request — nothing to append once
  const currentRequest = incoming[lastUserIdx]
  const priorCount = lastUserIdx // messages before the current request

  // Already recorded (retry of a turn the worker saw) — use curated as-is.
  const lastCurated = curated[curated.length - 1]
  if (lastCurated.role === 'user' && lastCurated.content === currentRequest.content) {
    return curated
  }

  // Worker behind the local transcript (missed turns / fresh DB): local is
  // richer, keep it — never silently shrink history.
  if (curated.length < priorCount) return incoming

  return [...curated, currentRequest]
}

// ─── TS summarization / compaction hook (updates-2.md §E) ───

export type Summarizer = (transcript: ConversationMessage[]) => Promise<string>

export interface CompactionPlan {
  /** Recent turns that fit the budget and are kept verbatim. */
  keep: ConversationMessage[]
  /** Older turns that will be replaced by a summary. */
  older: ConversationMessage[]
}

/** Estimate the token cost of a message list with the caller's estimator. */
export function estimateMessagesTokens(
  messages: ConversationMessage[],
  estimate: (text: string) => number
): number {
  return messages.reduce((sum, m) => sum + estimate(m.content) + 4, 0)
}

/**
 * Split a transcript into the newest turns that fit `maxTokens` and the older
 * prefix to summarize. Always keeps at least the final message.
 */
export function planCompaction(
  messages: ConversationMessage[],
  estimate: (text: string) => number,
  maxTokens: number
): CompactionPlan {
  const keep: ConversationMessage[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimate(messages[i].content) + 4
    if (keep.length > 0 && used + cost > maxTokens) break
    keep.unshift(messages[i])
    used += cost
  }
  return { keep, older: messages.slice(0, messages.length - keep.length) }
}

export interface CompactedConversation {
  messages: ConversationMessage[]
  summary: string | null
  droppedCount: number
}

/**
 * Condense a transcript that exceeds `maxTokens`: older turns are replaced by
 * one summary message produced by the injected TS summarizer. When nothing
 * needs dropping the input is returned untouched.
 */
export async function compactConversation(
  messages: ConversationMessage[],
  estimate: (text: string) => number,
  maxTokens: number,
  summarizer: Summarizer
): Promise<CompactedConversation> {
  const { keep, older } = planCompaction(messages, estimate, maxTokens)
  if (older.length === 0) return { messages, summary: null, droppedCount: 0 }
  const summary = await summarizer(older)
  const summaryMessage: ConversationMessage = {
    role: 'system',
    content: `[Summary of earlier conversation]\n${summary}`
  }
  return { messages: [summaryMessage, ...keep], summary, droppedCount: older.length }
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

/**
 * Subprocess environment whitelist (updates-2.md §E): the worker needs home /
 * temp / runtime settings to start, but must not inherit ambient provider
 * credentials. Unknown variables are dropped.
 */
export const WORKER_ENV_ALLOWLIST = [
  'PATH', 'Path', 'PathExt', 'PATHEXT', 'SystemRoot', 'windir', 'SystemDrive',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
  'PYTHONPATH', 'PYTHONHOME', 'PYTHONIOENCODING', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'ComSpec', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS'
]

export function workerEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of Object.keys(source)) {
    if (WORKER_ENV_ALLOWLIST.includes(key) && source[key] !== undefined) {
      env[key] = source[key] as string
    }
  }
  return env
}

const defaultSpawn: SpawnFn = (command, args) =>
  spawn(command, args, { env: workerEnv() }) as unknown as MnesisProcess

/** Minimum worker protocol accepted before reading or writing history. */
export const MIN_WORKER_PROTOCOL = 1

/** Package version the worker must report (updates-2.md §H). */
export const SUPPORTED_MNESIS_MAJOR_MINOR = '0.3'

/**
 * Fail-closed version validation: only the pinned Mnesis line is accepted
 * before any history is read or written. Unknown/missing versions are refused.
 */
export function isSupportedMnesisVersion(version: string | undefined): boolean {
  if (!version) return false
  const match = /^(\d+)\.(\d+)/.exec(version.trim())
  if (!match) return false
  return `${Number(match[1])}.${Number(match[2])}` === SUPPORTED_MNESIS_MAJOR_MINOR
}

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

/**
 * A worker call that did not answer before its deadline (updates-2.md §E).
 * Completion is *uncertain*: the request may or may not have been applied, so
 * callers must reconcile rather than blindly repeat it.
 */
export class MnesisTimeoutError extends Error {
  readonly code = 'mnesis-timeout'
  constructor(readonly op: string, readonly timeoutMs: number) {
    super(`mnesis call "${op}" timed out after ${timeoutMs}ms`)
    this.name = 'MnesisTimeoutError'
  }
}

/** True when a record failure means the outcome is unknown (a timeout). */
export function isUncertainRecordFailure(err: unknown): boolean {
  return err instanceof MnesisTimeoutError
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
  private capabilities: string[] = []
  private compaction = false
  private summarizer: Summarizer | null = null

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

  /** Worker-reported capabilities (from ping). */
  get capabilitiesList(): string[] {
    return [...this.capabilities]
  }

  /**
   * True only when the verified TS summarization hook is installed (§E).
   * Upstream/native compaction is deliberately not trusted for availability:
   * it can choose a provider independently, so it is reported separately via
   * `upstreamCompaction` for diagnostics only.
   */
  get compactionAvailable(): boolean {
    return this.summarizer !== null
  }

  /** True when upstream Mnesis reports native compaction support. */
  get upstreamCompaction(): boolean {
    return this.compaction
  }

  /**
   * Install the TS summarization hook used to compact over-budget history
   * (§E). Pass null to uninstall (e.g. on stop/rebuild).
   */
  setSummarizer(summarizer: Summarizer | null): void {
    this.summarizer = summarizer
  }

  get summarizerAvailable(): boolean {
    return this.summarizer !== null
  }

  /**
   * Compact a transcript to `maxTokens` using the installed TS summarizer.
   * Returns the input unchanged when no summarizer is installed.
   */
  async compact(
    messages: ConversationMessage[],
    estimate: (text: string) => number,
    maxTokens: number
  ): Promise<CompactedConversation> {
    if (!this.summarizer) return { messages, summary: null, droppedCount: 0 }
    return await compactConversation(messages, estimate, maxTokens, this.summarizer)
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
      const result = pong as { mnesis?: boolean; version?: string; protocol?: number; capabilities?: string[]; compaction?: boolean }
      if (!result?.mnesis) {
        // Worker is alive but the Python environment lacks mnesis — report
        // unavailable and shut the process down. Single attempt per process.
        this.lastError = 'mnesis package not installed in the Python environment'
        this.stop()
        return false
      }
      // Reject an unsupported worker protocol before reading/writing history.
      if (typeof result.protocol === 'number' && result.protocol < MIN_WORKER_PROTOCOL) {
        this.lastError = `unsupported mnesis worker protocol ${result.protocol} (need >= ${MIN_WORKER_PROTOCOL})`
        this.stop()
        return false
      }
      // Reject an unsupported package version before reading/writing history.
      if (!isSupportedMnesisVersion(result.version)) {
        this.lastError = `unsupported mnesis version ${result.version ?? 'unknown'} (need ${SUPPORTED_MNESIS_MAJOR_MINOR}.x)`
        this.stop()
        return false
      }
      this.capabilities = Array.isArray(result.capabilities) ? result.capabilities : []
      // Upstream compaction stays unavailable until a verified TS summarization
      // hook exists (§E).
      this.compaction = result.compaction === true
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
    for (const [, call] of Array.from(this.pending)) {
      clearTimeout(call.timer)
      call.reject(new Error('mnesis worker stopped'))
    }
    this.pending.clear()
  }

  /**
   * Record a completed conversation turn for a document.
   * BYO-LLM mode: no LLM call, purely persistence + compaction accounting.
   */
  async record(documentId: string, userMessage: string, assistantResponse: string, dbPath?: string): Promise<void> {
    await this.recordWithReceipt(documentId, userMessage, assistantResponse, dbPath)
  }

  /**
   * Record a turn and return the worker receipt, including the real Mnesis
   * session id so the caller can persist it for later resume (updates-2.md §E).
   */
  async recordWithReceipt(
    documentId: string,
    userMessage: string,
    assistantResponse: string,
    dbPath?: string
  ): Promise<{ sessionId?: string; compactionTriggered?: boolean }> {
    return (await this.call('record', { documentId, userMessage, assistantResponse, ...(dbPath ? { dbPath } : {}) })) as {
      sessionId?: string
      compactionTriggered?: boolean
    }
  }

  /** Curated conversation history for a document (compacted to fit the budget). */
  async messages(documentId: string, dbPath?: string): Promise<Array<{ role: string; content: string }>> {
    return (await this.call('messages', { documentId, ...(dbPath ? { dbPath } : {}) })) as Array<{ role: string; content: string }>
  }

  /**
   * List every session in one database (id + owning agent). Read-only; used to
   * plan legacy shared-store retirement (updates-2.md §D).
   */
  async sessions(dbPath?: string): Promise<Array<{ sessionId: string; agent: string | null }>> {
    return (await this.call('sessions', { ...(dbPath ? { dbPath } : {}) })) as Array<{ sessionId: string; agent: string | null }>
  }

  /**
   * Dispose explicitly named sessions in one database (§D). The caller names
   * the sessions — this never purges by omission.
   */
  async purge(sessionIds: string[], dbPath?: string): Promise<{ sessionsDeleted: number; messagesDeleted: number }> {
    return (await this.call('purge', { sessionIds, ...(dbPath ? { dbPath } : {}) })) as {
      sessionsDeleted: number
      messagesDeleted: number
    }
  }

  /**
   * Explicitly resume an existing document session by id (or the stored one).
   * Never creates a session — absent history stays absent (R20, §E).
   */
  async load(documentId: string, sessionId?: string, dbPath?: string): Promise<{ sessionId: string | null; found: boolean }> {
    return (await this.call('load', {
      documentId,
      ...(sessionId ? { sessionId } : {}),
      ...(dbPath ? { dbPath } : {})
    })) as {
      sessionId: string | null
      found: boolean
    }
  }

  /** Close the per-document session (e.g. when its tab closes). */
  async closeSession(documentId: string, dbPath?: string): Promise<void> {
    await this.call('close', { documentId, ...(dbPath ? { dbPath } : {}) })
  }

  /**
   * Whole-session disposal for a document (memory.md §11 deletion flow):
   * every session owned by the document is hard-deleted from the Mnesis DB
   * (messages, parts, context items, compaction summaries). The caller
   * rebuilds the projection from a filtered transcript afterwards.
   */
  async forgetDocument(documentId: string, dbPath?: string): Promise<{ sessionsDeleted: number; messagesDeleted: number }> {
    return (await this.call('forget', { documentId, ...(dbPath ? { dbPath } : {}) })) as {
      sessionsDeleted: number
      messagesDeleted: number
    }
  }

  private async call(op: string, params: Record<string, unknown>, timeoutMs = this.timeoutMs): Promise<unknown> {
    const proc = this.proc
    if (!proc) throw new Error('mnesis worker is not running')
    const id = this.nextId++
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new MnesisTimeoutError(op, timeoutMs))
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
    for (const [, call] of Array.from(this.pending)) {
      clearTimeout(call.timer)
      call.reject(new Error(reason))
    }
    this.pending.clear()
  }
}
