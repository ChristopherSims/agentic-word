/**
 * Rust Core native addon bridge.
 * Lazy-loads the napi-rs compiled .node addon. Falls back to stub if
 * the native addon is not built or is incompatible with the current platform.
 * The app functions normally without the Rust backend.
 */
import { join } from 'path'
import { app } from 'electron'

// ─── Typed Errors ───

export class RustUnavailableError extends Error {
  constructor(operation: string) {
    super(`RustCore not available for operation: ${operation}`)
    this.name = 'RustUnavailableError'
  }
}

export class RustOperationError extends Error {
  public operation: string
  public cause: string
  constructor(operation: string, cause: string) {
    super(`Rust ${operation} failed: ${cause}`)
    this.name = 'RustOperationError'
    this.operation = operation
    this.cause = cause
  }
}

// ─── Performance Metrics ───

const metrics: Record<string, { calls: number; totalMs: number; errors: number; lastMs: number }> = {}
let metricsEnabled = false

export function enableMetrics(): void { metricsEnabled = true }

export function getMetrics(): Record<string, { calls: number; totalMs: number; errors: number; lastMs: number }> {
  return { ...metrics }
}

function trackMetric(operation: string, ms: number, error: boolean): void {
  if (!metricsEnabled) return
  const entry = metrics[operation] || { calls: 0, totalMs: 0, errors: 0, lastMs: 0 }
  entry.calls++
  entry.totalMs += ms
  entry.lastMs = ms
  if (error) entry.errors++
  metrics[operation] = entry
}
type RustCoreAddon = {
  ping(): string
  RustCore: new (userDataPath: string) => {
    status(): string
    openDocument(filePath: string): any
    saveDocument(filePath: string, pmJson: string): void
    htmlToPm(html: string): string
    pmToHtml(pmJson: string): string
    mdToPm(md: string): string
    pmToMd(pmJson: string): string
    exportPdf(pmJson: string, outputPath: string, title?: string): void
    encryptText(plaintext: string, password: string): string
    decryptText(ciphertext: string, nonce: string, salt: string, password: string): string
    analyzeDocument(pmJson: string): any
    vcsCommit(docId: string, message: string, pmJson: string, branch: string, author?: string): any
    vcsLog(docId: string, limit?: number): any[]
    vcsDiff(fromId: string, toId: string): any[]
    vcsGraph(docId: string): any[]
    vcsListBranches(docId: string, current: string): any[]
    vcsCreateBranch(docId: string, name: string, fromCommit?: string): void
    vcsMerge(docId: string, source: string, target: string, author?: string): string
    agentGetPresets(): any[]
    agentGetTools(): string
    aiStartConversation(endpoint: string, apiKey: string, model: string, messagesJson: string, toolsJson: string, maxTurns: number, temperature: number): string
    aiPollConversation(convId: string): string
    aiProvideToolResults(convId: string, resultsJson: string): void
    aiAbortConversation(convId: string): void
    searchDocuments(query: string, limit: number): any[]
  }
}

let _rustCore: RustCoreAddon | null = null

function loadAddon(): RustCoreAddon | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const addon = require(join(__dirname, '../../native/rust-core.node')) as RustCoreAddon
    if (!app.isPackaged) {
      console.log('[RustCore] Native Rust backend loaded (dev mode)')
    }
    return addon
  } catch (e) {
    if (!app.isPackaged) {
      console.log('[RustCore] Native Rust backend NOT available (dev mode) — using TS fallback')
      console.log('[RustCore] Build native: napi build --release --js index.js --dts index.d.ts (in native/ dir)')
    } else {
      console.warn('[RustCore] Native addon not available — using TypeScript fallback:', (e as Error).message)
    }
    return null
  }
}

function getAddon(): RustCoreAddon | null {
  if (_rustCore === null) {
    _rustCore = loadAddon()
  }
  return _rustCore
}

export function isRustAvailable(): boolean {
  return getAddon() !== null
}

export function ping(): string {
  const addon = getAddon()
  if (addon) return addon.ping()
  return 'pong from TypeScript (Rust addon not loaded)'
}

export function initializeRustCore(): { core: any } | null {
  const addon = getAddon()
  if (!addon) return null

  try {
    const userDataPath = app.getPath('userData')
    const core = new addon.RustCore(userDataPath)
    console.log('[RustCore] initialized —', core.status())
    return { core }
  } catch (e) {
    console.error('[RustCore] Failed to initialize:', (e as Error).message)
    return null
  }
}

// ─── Global RustCore instance (lazy-initialized) ───

let _rustCoreInstance: any = undefined

export function getRustCore(): any | null {
  if (_rustCoreInstance === undefined) {
    const result = initializeRustCore()
    _rustCoreInstance = result?.core ?? null
  }
  return _rustCoreInstance
}

// ─── VCS Proxies (Rust-first, TypeScript fallback) ───

export function vcsComputeDiff(fromContent: string, toContent: string): string {
  const core = getRustCore()
  if (core) {
    try {
      // Use diff via temp doc IDs — Rust VCS uses SQLite so we need real docs
      // For ad-hoc diff, we'll compute inline via the `similar` crate which is already a dep
      return core.vcs_diff_temp(fromContent, toContent) ?? ''
    } catch { /* fall through */ }
  }
  return '' // caller should fall back to TS diff
}

export function vcsMergeContent(base: string, theirs: string, ours: string): string | null {
  const core = getRustCore()
  if (core) {
    try {
      return core.vcs_merge_3way(base, theirs, ours) ?? null
    } catch { /* fall through */ }
  }
  return null
}

// ─── Document Analysis Proxies ───

export interface RustAnalysisResult {
  readabilityScore: number
  tone: string
  keywords: string[]
  stats: { wordCount: number; charCount: number; sentenceCount: number; paragraphCount: number }
}

export function analyzeDocument(pmJson: string): RustAnalysisResult | null {
  const core = getRustCore()
  if (core) {
    try {
      const raw = core.analyze_document(pmJson)
      if (typeof raw === 'string') return JSON.parse(raw)
      return raw
    } catch { /* fall through */ }
  }
  return null
}

// ─── Search Proxy ───

export interface RustSearchResult {
  documentId: string
  title: string
  snippet: string
  score: number
}

export function searchDocuments(query: string, limit: number = 20): RustSearchResult[] {
  const core = getRustCore()
  if (core) {
    try {
      const raw = core.search_documents(query, limit)
      if (Array.isArray(raw)) return raw
      if (typeof raw === 'string') return JSON.parse(raw)
    } catch { /* fall through */ }
  }
  return []
}

// ─── AI HTTP/SSE Proxy (async) ───

export interface RustAiStreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullContent: string) => void
  onError: (error: string) => void
}

export async function aiStreamCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  callbacks: RustAiStreamCallbacks
): Promise<void> {
  const core = getRustCore()
  if (core?.aiStreamChat) {
    try {
      const messagesJson = JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content })))
      const fullContent = core.aiStreamChat(endpoint, apiKey, model, messagesJson, 0.7, 4096)
      if (typeof fullContent === 'string') {
        callbacks.onDone(fullContent)
      }
    } catch (err) {
      callbacks.onError((err as Error).message)
    }
    return
  }
  throw new Error('RustCore not available')
}

export function aiChatCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): string {
  const core = getRustCore()
  if (core?.aiChatCompletion) {
    try {
      const messagesJson = JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content })))
      return core.aiChatCompletion(endpoint, apiKey, model, messagesJson, 0.7, 4096) || ''
    } catch { /* fall through */ }
  }
  return ''
}

// ─── AI Reactor (Phase 2.2) — polling-based conversation engine ───

export function aiStartConversation(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  tools: Array<{ name: string; description: string; parameters: unknown }>,
  maxTurns: number,
  temperature: number
): string | null {
  const core = getRustCore()
  if (core?.aiStartConversation) {
    try {
      const messagesJson = JSON.stringify(messages)
      const toolsJson = JSON.stringify(tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
      })))
      return core.aiStartConversation(endpoint, apiKey, model, messagesJson, toolsJson, maxTurns, temperature)
    } catch { /* fall through */ }
  }
  return null
}

export interface ReactorEvent {
  type: 'token' | 'tool_calls' | 'done' | 'error'
  data: unknown
}

export function aiPollConversation(convId: string): ReactorEvent | 'waiting' | null {
  const core = getRustCore()
  if (core?.aiPollConversation) {
    try {
      const raw = core.aiPollConversation(convId)
      if (raw === '"waiting"') return 'waiting'
      return JSON.parse(raw) as ReactorEvent
    } catch { /* fall through */ }
  }
  return null
}

export function aiProvideToolResults(convId: string, results: Array<{ toolCallId: string; toolName: string; content: string }>): boolean {
  const core = getRustCore()
  if (core?.aiProvideToolResults) {
    try {
      const resultsJson = JSON.stringify(results.map((r) => ({
        tool_call_id: r.toolCallId,
        tool_name: r.toolName,
        content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
      })))
      core.aiProvideToolResults(convId, resultsJson)
      return true
    } catch { /* fall through */ }
  }
  return false
}

export function aiAbortConversation(convId: string): boolean {
  const core = getRustCore()
  if (core?.aiAbortConversation) {
    try {
      core.aiAbortConversation(convId)
      return true
    } catch { /* fall through */ }
  }
  return false
}
