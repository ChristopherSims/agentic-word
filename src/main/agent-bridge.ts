import { VcsEngine } from './vcs-engine'
import { DocumentStore } from './document-store'
import { BrowserWindow, app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import {
  isRustAvailable,
  aiStartConversation,
  aiPollConversation,
  aiProvideToolResults,
  aiAbortConversation,
  type ReactorEvent
} from './rust-bridge'
import { AgentConfigSchema, parseConfig } from '../shared/schemas'
import { buildChatEndpoint, buildChatRequest } from './endpoint-builder'
import { getProvider } from '../shared/providers'
import { getAgentSkill } from '../shared/skills'
import { buildAuthHeaders, BEARER_PROVIDER } from '../shared/auth-headers'
import { decodeSafeStorageValue, encodeSafeStorageValue, SAFE_STORAGE_PREFIX, removeUndefinedValues } from './agent-config-security'

/** OpenAI-compatible chat completion response (non-streaming) */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
      tool_calls?: Array<{
        id: string
        function: { name: string; arguments: string }
      }>
    }
  }>
}

// Hermes Agent ACP-compatible tool interface
// Tools are described in the format Hermes expects for tool registration

import type {
  AgentToolDefinition as ToolDefinition,
  AgentToolParameter as ToolParameter,
  AgentConfig,
  AgentPreset,
  AgentSession,
  AgentProfile,
  AgentTask,
  AgentRole,
  TaskStatus,
  ToolExecutionResult,
  AgentPermissions,
  AgentPermissionCategory,
  AgentMemoryEntry,
  AgentMemoryApprovalState,
  AgentMemorySourceType,
  ContextRunReport,
  MemoryRetentionPolicy,
  ArtifactCounts,
  DeletionJobStatus,
  DeletionResult,
  DeletionState,
  MemoryStatus
} from '../shared/types'
import { AgentMemoryStore } from './agent-memory'
import { AgentLedger } from './memory/ledger'
import { DeletionCoordinator, emptyArtifactCounts } from './memory/deletion-coordinator'
import { DocumentPolicy } from './memory/document-policy'
import { RunRegistry } from './memory/run-registry'
import { createWorkerBackedStore } from './memory/worker-store'
import { ControlStore } from './memory/control-store'
import { documentSnapshotHash } from './memory/snapshot'
import { currentRunScope, runWithScope } from './memory/run-context'
import { legacyMnesisDbPath, removeLegacyMnesisStore, classifyLegacySessions, legacyMessagesToEvents, type LegacyMnesisSession } from './memory/legacy-mnesis'
import { InProcessLedgerDriver, type LedgerDriver } from './memory/ledger-driver'
import { deriveMemoryStatus } from './memory/status'
import { ProjectionCoordinator } from './memory/projection-coordinator'
import { MemoryError } from './memory/errors'
import { memoryEngineAvailability } from './memory/engine-availability'
import { resolveModelLimits, checkTokenBudget } from './memory/model-budget'
import { RequestGateway } from './ai/request-gateway'
import { persistentMemoryAllowed } from './memory/policy'
import { filterTurnsForRebuild, isSuppressedContent } from './memory/deletion'
import { DEFAULT_CONSENT, effectiveConsent, isLocalEndpoint, type ConsentSettings } from './memory/consent'
import { planProjectionRebuild, sessionToHistoricalEvents } from './memory/migration-sessions'
import { planContext, DEFAULT_CONTEXT_CHAR_BUDGET, contextReportFromPlanned, resolveContextProfile, condenseConversation, clampProfileToModel, documentBudgetShare, MULTI_AGENT_PROFILE, ORCHESTRATOR_PROFILE, type ContextBudgetOptions, type PlannedContext } from './memory/context-planner'
import { MnesisWorkerClient, selectConversationMessages, resolveMnesisPaths, isUncertainRecordFailure } from './memory/mnesis-client'
import { DocumentIndex, formatRetrieval, extractBlocks, chunkBlocks, planBatches, renderBatch, buildOutline, extractSection, rankChunks } from './memory/doc-index'

export type {
  AgentConfig,
  AgentPreset,
  AgentSession,
  AgentProfile
}

export class AgentBridge {
  private vcs: VcsEngine
  private docStore: DocumentStore
  private mainWindow: BrowserWindow | null = null
  private permissions: AgentPermissions = { write: false, edit: false, save: false, revert: false, storyboard: false, vcs: false, streaming: false, web: false, memory: false }
  private config: AgentConfig = {
    providerId: '',
    endpoint: '',
    apiKey: '',
    model: 'gpt-4'
  }
  /** Consolidated consent (§11) — effective view, merged over defaults. */
  private consent: ConsentSettings = { ...DEFAULT_CONSENT }
  private providerApiKeys: Record<string, string> = {}
  private presets: AgentPreset[] = []
  private scratchpad: string = ''
  private maxToolTurns: number = 5
  private temperature: number = 0.7
  /** Per-run state (updates-2.md §B): abort controllers + pending approvals. */
  private runs = new RunRegistry()
  private ollamaFormat: boolean = false
  private _currentDocPath: string | null = null
  /** Stable document identity (memory.md §6.1) — preferred over the file path for memory/session keys */
  private _currentDocumentId: string | null = null
  /**
   * §11 protected-document flag for the current run: when true, all memory
   * persistence (extraction, Mnesis recording, index caching) is disabled —
   * ephemeral, transient context only.
   */
  private _currentDocProtected: boolean = false

  private sessions: Map<string, AgentSession> = new Map()
  /**
   * Messages added while retention consent is off are held transiently and
   * never serialized with the retained sessions (R1). Kept separate so no
   * serializer can flush an opted-out buffer into agent-sessions.json.
   */
  private ephemeralSessionMessages: Map<string, Array<{ role: string; content: string }>> = new Map()
  /**
   * Projection key of the most recently selected session (R12). Live Mnesis
   * projections are keyed by session identity so Writer/Reviewer and session
   * resets do not share a document-wide transcript.
   */
  private _currentProjectionKey: string | null = null
  /**
   * Documents whose sidecar projection must be disposed (or disposed and
   * rebuilt) before it can be read again. Set when a deletion runs while the
   * sidecar is unavailable, and drained on the next request (R10/R14).
   */
  private pendingProjectionDisposal: Map<string, 'dispose' | 'rebuild'> = new Map()
  private taskGraphs: Map<string, Map<string, AgentTask>> = new Map()
  private memory: AgentMemoryStore
  /** Mnesis conversation-context sidecar — lazily started, optional (Phase 1) */
  private mnesis: MnesisWorkerClient | null = null
  private mnesisStartPromise: Promise<boolean> | null = null
  /** Structural document index (memory.md §7) — chunks + FTS ranking */
  private docIndex = new DocumentIndex()
  private activeGraphId: string | null = null
  private profiles: AgentProfile[] = [
    { id: 'writer', name: 'Writer', role: 'writer', systemPrompt: 'You are a creative writing assistant. Focus on improving prose, expanding ideas, and generating content. Be expressive and help the user develop their document.', color: '#89b4fa' },
    { id: 'reviewer', name: 'Reviewer', role: 'reviewer', systemPrompt: 'You are a critical reviewer and editor. Focus on clarity, grammar, consistency, and logic. Point out issues and suggest improvements. Be constructive but thorough.', color: '#f38ba8' },
    { id: 'researcher', name: 'Researcher', role: 'researcher', systemPrompt: 'You are a research assistant. Gather information, find facts, verify claims, and provide structured research notes. Use web_search and web_fetch tools when available. Cite sources.', color: '#a6e3a1' },
    { id: 'orchestrator', name: 'Orchestrator', role: 'orchestrator', systemPrompt: 'You are a task orchestrator. Decompose the user request into subtasks for Writer, Reviewer, and Researcher agents. Return a JSON array of task objects with fields: agentName, title, prompt, dependencies (array of task indices). Keep decompositions small (2-5 subtasks). Each prompt must be self-contained.', color: '#cba6f7' }
  ]
  private sessionsPath: string
  private configPath: string
  private permissionsPath: string
  /** Lexicon-owned ledger for retained sessions (updates-2.md §A). */
  private sessionLedger: AgentLedger
  /** Worker driver owning the session DB when off-main (§A); null in-process. */
  private sessionDriver: LedgerDriver | null = null
  /** Coalesced pending session write for the worker path. */
  private sessionsDirty = false
  /** Cached control state (jobs/policy/generations) — §A/§B/§D/§E. */
  private control: ControlStore
  /** Durable deletion-job coordinator (updates-2.md §D). */
  private deletions: DeletionCoordinator
  /** Authoritative per-document protection/revocation policy (§B). */
  private documentPolicy: DocumentPolicy
  /** The single boundary allowed to dispatch provider HTTP requests (§C). */
  private gateway: RequestGateway
  /** True while a projection rebuild is in progress (§F status). */
  private rebuilding = false
  /** Disposable Mnesis generation ownership + lifecycle (§E). */
  private projections: ProjectionCoordinator
  /** Why the memory engine is unavailable, if it is (§H). */
  private memoryUnavailableReason: string | null = null
  /** Documents with an in-flight consolidation request (§F). */
  private runningConsolidations = new Map<string, { epoch: number; startedAt: number }>()

  // Tool registry — Hermes ACP-compatible definitions
  private tools: Map<string, { definition: ToolDefinition; handler: (args: Record<string, unknown>) => Promise<ToolExecutionResult> }> = new Map()


  constructor(vcs: VcsEngine, docStore: DocumentStore) {
    this.vcs = vcs
    this.docStore = docStore
    this.sessionsPath = path.join(app.getPath('userData'), 'agent-sessions.json')
    this.configPath = path.join(app.getPath('userData'), 'agent-config.json')
    this.permissionsPath = path.join(app.getPath('userData'), 'agent-permissions.json')
    // One Lexicon ledger for memory and sessions (updates-2.md §A).
    this.memory = new AgentMemoryStore()
    this.sessionLedger = this.memory.getLedger()
    this.control = new ControlStore(new InProcessLedgerDriver(this.sessionLedger))
    this.deletions = new DeletionCoordinator(this.control)
    this.documentPolicy = new DocumentPolicy(this.control)
    this.gateway = new RequestGateway({ remoteAllowed: () => this.remoteInferenceAllowed() })
    this.projections = new ProjectionCoordinator(
      this.control,
      path.join(app.getPath('userData'), 'mnesis', 'generations')
    )
    // Don't call loadConfig() here — safeStorage isn't available until app is ready.
    // But consent and protection must be in effect BEFORE any conversation is
    // restored or background work starts (§A/§B): read stored consent directly
    // (it is not encrypted) and keep the main-owned document policy in the
    // ledger (already constructed above).
    this.loadConsentEarly()
    this.loadSessions()
    this.loadPermissions()
    this.registerBuiltinTools()
  }

  /**
   * Read the persisted consent boundaries directly from the config file before
   * safeStorage is available, so "restore conversation" never precedes the
   * consent that governs it. `loadConfig()` re-applies the same values later.
   */
  private loadConsentEarly(): void {
    try {
      if (!fs.existsSync(this.configPath)) return
      const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      if (data?.consent && typeof data.consent === 'object') {
        this.consent = effectiveConsent(data.consent as Partial<ConsentSettings>)
      }
    } catch {
      // Missing/corrupt config — conservative defaults already in place.
    }
  }

  /**
   * Load config after app is ready (safeStorage is now available)
   * Call this from app.whenReady()
   */
  init(): void {
    // Check safeStorage availability
    const encryptAvailable = safeStorage.isEncryptionAvailable()
    console.log('[AgentBridge] safeStorage.isEncryptionAvailable():', encryptAvailable)
    this.loadConfig()
    // Resume interrupted deletion maintenance before sources are readable (§D).
    void this.resumePendingDeletions().catch((err) =>
      console.warn('[AgentBridge] Deletion resume failed:', (err as Error).message)
    )
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  setPermissions(p: Partial<AgentPermissions>): void {
    this.permissions = { ...this.permissions, ...p }
    this.savePermissions()
  }

  private loadPermissions(): void {
    try {
      if (fs.existsSync(this.permissionsPath)) {
        const loaded = JSON.parse(fs.readFileSync(this.permissionsPath, 'utf-8'))
        // Merge over defaults so newly added categories fall back to false
        for (const key of Object.keys(this.permissions) as (keyof AgentPermissions)[]) {
          if (typeof loaded[key] === 'boolean') this.permissions[key] = loaded[key]
        }
      }
    } catch (err) {
      console.warn('[AgentBridge] Failed to load permissions, using defaults:', err)
    }
  }

  private savePermissions(): void {
    try {
      fs.writeFileSync(this.permissionsPath, JSON.stringify(this.permissions, null, 2), 'utf-8')
    } catch (err) {
      console.error('[AgentBridge] Failed to save permissions:', err)
    }
  }

  getPermissions(): AgentPermissions {
    return { ...this.permissions }
  }

  resolveToolApproval(approved: boolean, rendererId?: number): boolean {
    return this.runs.resolveApprovalFor(rendererId, approved)
  }

  // ─── Document content round-trip (main has no copy of the editor content) ───
  private docContentRequests: Map<string, (content: string | null) => void> = new Map()

  /** Ask the renderer for the current document content; resolves null on timeout. */
  private requestDocumentText(timeoutMs = 3000, format: 'text' | 'html' = 'text'): Promise<string | null> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return Promise.resolve(null)
    const id = `docreq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    // §B: bind the request to the originating run's document/snapshot so the
    // renderer never answers with a different tab's content.
    const scope = this.runs.activeScope()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.docContentRequests.delete(id)
        resolve(null)
      }, timeoutMs)
      this.docContentRequests.set(id, (content) => {
        clearTimeout(timer)
        this.docContentRequests.delete(id)
        resolve(content)
      })
      this.send('agent-doc-content-request', {
        id,
        format,
        ...(scope ? { runId: scope.runId, documentId: scope.documentId, snapshotHash: scope.snapshotHash } : {})
      })
    })
  }

  resolveDocumentTextRequest(id: string, content: string, stale = false): boolean {
    const cb = this.docContentRequests.get(id)
    if (cb) {
      if (stale) console.warn('[AgentBridge] Document content request answered stale (originating document changed)')
      cb(stale ? null : content)
      return true
    }
    return false
  }

  private getPermissionCategory(toolName: string): AgentPermissionCategory | null {
    const writeTools = ['document_write', 'document_prepend', 'document_append', 'document_insert_multiple_locations', 'document_insert_after_element']
    const editTools = ['document_replace', 'document_batch_replace', 'document_delete', 'document_format', 'document_create_list']
    const saveTools = ['document_save']
    const storyboardTools = ['storyboard_read', 'storyboard_update']
    const vcsTools = ['vcs_commit', 'vcs_log', 'vcs_diff']
    const webTools = ['web_fetch', 'web_search']
    const memoryTools = ['memory_save', 'memory_recall', 'memory_clear']

    if (writeTools.includes(toolName)) return 'write'
    if (editTools.includes(toolName)) return 'edit'
    if (saveTools.includes(toolName)) return 'save'
    if (storyboardTools.includes(toolName)) return 'storyboard'
    if (vcsTools.includes(toolName)) return 'vcs'
    if (webTools.includes(toolName)) return 'web'
    if (memoryTools.includes(toolName)) return 'memory'
    return null
  }

  private loadConfig(): void {
    try {
      console.log('[AgentBridge] Loading config from:', this.configPath)
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        console.log('[AgentBridge] Config file size:', data.length, 'bytes')
        const loaded = (parseConfig(data, AgentConfigSchema.partial()) as (Partial<AgentConfig> & { providerApiKeys?: Record<string, string> }) | null) || {}
        console.log('[AgentBridge] Loaded config:', { ...loaded, apiKey: loaded.apiKey ? `[${loaded.apiKey.length} chars]` : '[empty]' })
        if (loaded.providerApiKeys) {
          this.providerApiKeys = {}
          for (const [providerId, encryptedValue] of Object.entries(loaded.providerApiKeys)) {
            if (!encryptedValue) continue
            try {
              this.providerApiKeys[providerId] = encryptedValue.startsWith(SAFE_STORAGE_PREFIX)
                ? safeStorage.decryptString(decodeSafeStorageValue(encryptedValue))
                : encryptedValue
            } catch (e) {
              console.error(`[AgentBridge] Failed to decrypt API key for provider ${providerId}:`, e)
            }
          }
          delete loaded.providerApiKeys
        }
        // Decrypt API key if it was stored encrypted (safeStorage marker prefix)
        if (loaded.apiKey && loaded.apiKey.startsWith(SAFE_STORAGE_PREFIX)) {
          console.log('[AgentBridge] Decrypting API key (was encrypted with safeStorage)...')
          try {
            const encrypted = decodeSafeStorageValue(loaded.apiKey)
            loaded.apiKey = safeStorage.decryptString(encrypted)
            console.log('[AgentBridge] API key decrypted successfully')
          } catch (e) {
            console.error('[AgentBridge] safeStorage.decryptString failed:', e)
            // Ciphertext is corrupted — clear it and immediately save clean config
            console.warn('[AgentBridge] Corrupted encrypted key detected — clearing. Please re-enter your API key.')
            loaded.apiKey = ''
            // Write clean config back so the corruption doesn't persist
            try {
              fs.writeFileSync(this.configPath, JSON.stringify({ ...loaded, apiKey: '' }, null, 2), 'utf-8')
            } catch { /* best-effort */ }
          }
        }
        if (loaded.providerId && this.providerApiKeys[loaded.providerId] !== undefined) {
          loaded.apiKey = this.providerApiKeys[loaded.providerId]
        } else if (loaded.providerId && loaded.apiKey) {
          this.providerApiKeys[loaded.providerId] = loaded.apiKey
        } else if (loaded.providerId) {
          loaded.apiKey = ''
        }
        this.config = { ...this.config, ...loaded }
        // Consolidated consent (§11): merge stored decisions over defaults.
        this.consent = effectiveConsent(this.config.consent)
        // §A: ledger-only mode when the compatibility mirror is disabled.
        this.memory.setJsonMirror(this.config.memoryJsonMirror !== false)
        // Apply the configured retention policy (memory.md §11) on startup —
        // expired evidence is removed before any prompt can retrieve it.
        this.applyMemoryRetention()
      }
    } catch (err) {
      console.error('[AgentBridge] Failed to load config:', err)
    }
  }

  private saveConfig(): void {
    try {
      const configToSave: Partial<AgentConfig> & { providerApiKeys?: Record<string, string> } = { ...this.config, consent: this.consent }
      const persistedProviderApiKeys = this.getPersistedEncryptedProviderApiKeys()
      configToSave.providerApiKeys = {}
      for (const [providerId, apiKey] of Object.entries(this.providerApiKeys)) {
        if (!apiKey) continue
        try {
          configToSave.providerApiKeys[providerId] = encodeSafeStorageValue(safeStorage.encryptString(apiKey))
        } catch (e) {
          console.error(`[AgentBridge] safeStorage.encryptString failed for provider ${providerId}:`, e)
          if (persistedProviderApiKeys[providerId]) {
            configToSave.providerApiKeys[providerId] = persistedProviderApiKeys[providerId]
          }
        }
      }
      // Encrypt API key with OS-level encryption (DPAPI on Windows, Keychain on macOS)
      if (configToSave.apiKey && !configToSave.apiKey.startsWith(SAFE_STORAGE_PREFIX)) {
        console.log('[AgentBridge] Encrypting API key...')
        try {
          const encrypted = safeStorage.encryptString(configToSave.apiKey)
          configToSave.apiKey = encodeSafeStorageValue(encrypted)
          console.log('[AgentBridge] API key encrypted successfully')
        } catch (e) {
          console.error('[AgentBridge] safeStorage.encryptString failed:', e)
          const persistedEncryptedKey = this.getPersistedEncryptedApiKey()
          configToSave.apiKey = persistedEncryptedKey || ''
          console.warn('[AgentBridge] API key was not saved because encryption failed')
        }
      }
      console.log('[AgentBridge] Writing config to:', this.configPath)
      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2), 'utf-8')
      console.log('[AgentBridge] Config saved successfully')
    } catch (err) {
      console.error('[AgentBridge] Failed to save config:', err)
    }
  }

  private getPersistedEncryptedApiKey(): string | null {
    try {
      if (!fs.existsSync(this.configPath)) return null
      const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      return typeof data.apiKey === 'string' && data.apiKey.startsWith(SAFE_STORAGE_PREFIX)
        ? data.apiKey
        : null
    } catch {
      return null
    }
  }

  private getPersistedEncryptedProviderApiKeys(): Record<string, string> {
    try {
      if (!fs.existsSync(this.configPath)) return {}
      const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      return data.providerApiKeys && typeof data.providerApiKeys === 'object'
        ? data.providerApiKeys
        : {}
    } catch {
      return {}
    }
  }

  async handleChatStream(messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string; storyboardContent?: string; currentFilePath?: string; documentId?: string; cursorContext?: string; protectedDocument?: boolean; sessionId?: string; streamToDocument?: boolean; skill?: string }, rendererId?: number): Promise<void> {
    // §11 boundary 7: remote inference requires consent (local endpoints exempt).
    if (!this.remoteInferenceAllowed()) {
      this.send('agent-stream-error', { error: 'Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.' })
      return
    }
      // Track current document identity for memory/session keys (memory.md §6.1).
      // documentId is the stable key; the file path remains as a legacy fallback.
      this._currentDocPath = context?.currentFilePath || null
      this._currentDocumentId = context?.documentId || null
      const runDocumentId = context?.documentId || context?.currentFilePath || 'default'
      // §B: a renderer protected flag tightens main-owned protection; it is
      // recorded by stable document ID so later saves/recall obey it even
      // without a recent protected chat.
      if (context?.protectedDocument && runDocumentId !== 'default') {
        this.documentPolicy.protect(runDocumentId)
      }
      // §11: protected (or revoked) documents run in ephemeral mode.
      const policyBlocked = this.documentPolicy.isProtected(runDocumentId) || this.documentPolicy.isRevoked(runDocumentId)
      const runProtected = !!context?.protectedDocument || policyBlocked
      this._currentDocProtected = runProtected
      // R5/R12: capture immutable per-run identity at invocation. A concurrent
      // run must not be able to flip protection or the document mid-flight.
      // The session/projection key comes from the request when supplied, so a
      // concurrent session change cannot redirect this run's retention (R12).
      const runProjectionKey = context?.sessionId || this._currentProjectionKey

      // Delegate to Rust reactor when available (skip for Ollama native format).
      // memory.md §8.5: the reactor manages its own multi-turn loop and only
      // receives a startup context pack — it cannot re-plan the context budget
      // or refresh curated history at each tool-turn boundary. Until a native
      // rebuild hook exists, memory-enabled runs (Mnesis sidecar on) route
      // through the TS path, and the run is disclosed as such in the inspector.
    const bypassRustForMemory = !!this.config.mnesisEnabled
    if (isRustAvailable() && !this.ollamaFormat && !bypassRustForMemory) {
      await this.handleChatStreamViaRustReactor(messages, context, rendererId)
      return
    }

    // Check if endpoint is configured
    if (!this.config.endpoint) {
      console.error('[AgentBridge] Endpoint not configured:', this.config)
      this.send('agent-stream-error', {
        error: '❌ AI Endpoint Not Configured\n\nPlease configure your AI provider in Settings > Agent tab:\n\n📌 Ollama (Local): http://localhost:11434/v1/chat/completions\n📌 OpenAI: https://api.openai.com/v1/chat/completions\n📌 Other: Your full chat completions endpoint URL\n\nThen enter your Model name and click "Save Agent Config"'
      })
      return
    }

    const chatRun = this.runs.begin({ documentId: runDocumentId, documentPath: context?.currentFilePath ?? '', sessionId: runProjectionKey ?? '', rendererId: rendererId ?? null, snapshotHash: documentSnapshotHash(context?.documentContent), protected: runProtected })
    // §B: publish the immutable run scope so the renderer can pin proposals to
    // the originating document/revision.
    this.send('agent-run-scope', { ...chatRun.scope })

    // Create a synthetic task graph for single-agent mode (for the popup)
    const singleGraphId = `single_${Date.now()}`
    const singleTask: AgentTask = {
      id: `${singleGraphId}_main`,
      graphId: singleGraphId,
      parentTaskId: null,
      agentName: 'Assistant',
      agentRole: 'custom',
      title: 'Processing your request',
      prompt: messages[messages.length - 1]?.content || '',
      status: 'running',
      dependencies: [],
      startedAt: Date.now()
    }
    this.createTaskGraph(singleGraphId, [singleTask])

    const systemParts: string[] = []
    if (!this.ollamaFormat) {
      const toolDefs = this.listTools()
      systemParts.push(
        `You are a document editing assistant integrated into Lexicon. You have access to the following tools: ${toolDefs.map((t) => t.name).join(', ')}. Use tools when the user explicitly asks you to (e.g. "write", "edit", "replace", "search"). Otherwise, respond conversationally without calling tools. When the user asks you to write or continue text, insert it at the user's cursor (position "cursor") unless they ask for a different location.\n\nFORMAT CONTRACT: Write all prose and document content in Markdown (plain text is also fine). Never emit HTML tags in your reply or in tool content — the application converts Markdown to rich text automatically. The document below is stored internally as HTML for reference only; do not imitate its markup.`
      )
    } else {
      systemParts.push(
        `You are a document editing assistant integrated into Lexicon. Respond conversationally and helpfully to the user's requests.\n\nFORMAT CONTRACT: Write all prose and document content in Markdown (plain text is also fine). Never emit HTML tags — the application converts Markdown to rich text automatically.`
      )
    }

    // Live streaming mode: the renderer writes this reply into the document as
    // it arrives, so the model must produce the content directly instead of
    // routing it through the document-editing tools.
    if (context?.streamToDocument) {
      systemParts.push(
        'LIVE STREAMING MODE: The user is watching your reply stream directly into the document. Write the requested content in your response as Markdown, in full. Do NOT call document_insert, document_replace, document_insert_multiple_locations, document_batch_replace, or any other document-editing tool for this request.'
      )
    }

    // Named skills (e.g. Proofread) prepend a persona plus hard constraints and
    // their application guidance to the system prompt.
    const activeSkill = getAgentSkill(context?.skill)
    if (activeSkill) {
      systemParts.push(activeSkill.instruction)
      systemParts.push(activeSkill.applyGuidance)
    }

    // Unified context budget (memory.md §8): all context parts share one
        // character budget so their combined size stays predictable.
        const memoryKey = context?.documentId || context?.currentFilePath
        const memoryContext = memoryKey && this.memoryAllowedForRun(memoryKey, runProtected)
      ? this.memory.formatForPrompt(memoryKey, 5, this.consent.crossDocumentPreferences)
      : ''
        // Per-model context profile (memory.md §8.4): small/local models get a
        // smaller budget weighted toward selection and constraints.
        const profile = resolveContextProfile(this.config.model, this.contextBudgetOptions())
        // Structural retrieval (memory.md §7): documents larger than their
        // budget share send query-relevant sections instead of a prefix.
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
        const resolvedDocument = this.resolveDocumentContext(
          memoryKey || 'default',
          context?.documentContent,
          lastUserMessage,
          profile.totalBudget * documentBudgetShare(profile.weights),
          runProtected
        )
        const planned = planContext(
          {
            documentContent: resolvedDocument.content,
            selection: context?.selection,
            cursorContext: context?.cursorContext,
            storyboardContent: context?.storyboardContent,
            scratchpad: this.scratchpad,
            memoryContext
          },
          profile.totalBudget,
          '\n... [truncated — use document_read for the full content]',
          profile.weights
        )

        if (planned.documentContent.content) {
          systemParts.push(
            `\nCurrent document content${resolvedDocument.partial ? '' : ' (HTML)'}:\n${planned.documentContent.content}`
          )
        }
        if (context?.currentBranch) {
          systemParts.push(`Current VCS branch: ${context.currentBranch}`)
        }
        if (planned.selection.content) {
          systemParts.push(`User's current selection: "${planned.selection.content}"`)
        }
        if (planned.cursorContext.content) {
          systemParts.push(`\nText immediately before the user's cursor (the user is working at this exact point — when asked to write or continue, pick up right after this text):\n${planned.cursorContext.content}`)
        }
        if (planned.storyboardContent.content) {
          systemParts.push(`\n<storyboard>\nThe user has a storyboard for this document. Follow its structure and instructions when writing:\n\n${planned.storyboardContent.content}\n</storyboard>`)
        }
        if (planned.scratchpad.content) {
          systemParts.push(`Your scratchpad notes:\n${planned.scratchpad.content}`)
        }

        if (planned.memoryContext.content) {
          systemParts.push(`\nLong-term memory for this document:\n${planned.memoryContext.content}`)
        }

        const ollama = this.ollamaFormat
        // Phase 4 (memory.md §9): swap the raw transcript for Mnesis curated
        // history when the sidecar is enabled; the current request is appended
        // exactly once. Falls back to `messages` on any worker problem.
        const conversation = await this.buildConversationMessages(runDocumentId, messages, {
          protected: runProtected,
          projectionKey: runProjectionKey
        })
        const systemContent = systemParts.join('\n')
        const buildPayload = (
          history: Array<{ role: string; content: string }>
        ): Record<string, unknown> =>
          ollama
            ? {
                model: this.getModel('smart'),
                messages: [{ role: 'system', content: systemContent }, ...history],
                stream: true,
                options: { temperature: this.temperature }
              }
            : {
                model: this.getModel('smart'),
                messages: [{ role: 'system', content: systemContent }, ...history],
                tools: this.listTools().map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.parameters }
                })),
                tool_choice: 'auto',
                temperature: this.temperature,
                stream: true
              }

        // R16: enforce the budget on the whole serialized request, not just six
        // context fields. Trim the oldest complete turns first; never silently
        // truncate the current user request.
        let conversationMessages = conversation.messages
        let payload = buildPayload(conversationMessages)
        let serializedLength = JSON.stringify(payload).length
        while (serializedLength > profile.totalBudget && conversationMessages.length > 1) {
          conversationMessages = conversationMessages.slice(1)
          payload = buildPayload(conversationMessages)
          serializedLength = JSON.stringify(payload).length
        }
        if (serializedLength > profile.totalBudget) {
          // Mandatory input alone cannot fit — refuse rather than over-send.
          this.send('agent-stream-error', {
            error:
              `The request is too large for the configured model budget ` +
              `(${serializedLength} > ${profile.totalBudget} characters). ` +
              `Shorten the request or raise the model limit.`
          })
          this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'error', undefined, 'request-over-budget')
          return
        }
        // §C: explicit model token limits, including the reserved output and a
        // safety margin, checked on the whole serialized request. Estimates are
        // disclosed; the selected model (smart/fast) drives the limits.
        const modelLimits = resolveModelLimits(this.getModel('smart'), {
          contextWindow: this.config.modelContextWindow,
          outputReserve: this.config.modelOutputReserve,
          tokenizer: this.config.modelTokenizer
        })
        const tokenReport = checkTokenBudget(String(JSON.stringify(payload)), modelLimits)
        if (!tokenReport.fits) {
          this.send('agent-stream-error', {
            error:
              `The request exceeds the ${this.getModel('smart')} context window: ` +
              `~${tokenReport.inputTokens} input + ${tokenReport.outputReserve} reserved output + ` +
              `${tokenReport.safetyMargin} safety > ${tokenReport.limit} tokens (${tokenReport.estimator} estimate).`
          })
          this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'error', undefined, 'request-over-budget')
          return
        }
        // Context inspector (memory.md §10.3): report from the final accepted request.
        this.recordContextReport(
          planned,
          memoryKey || null,
          { source: conversation.source, turns: conversationMessages.length },
          [
            conversation.fallback,
            resolvedDocument.partial ? 'document-retrieval-partial' : undefined,
            memoryKey ? undefined : 'memory-unavailable',
            // §8.5 disclosure: this run bypassed the Rust reactor because the
            // sidecar needs per-turn context rebuilds the reactor can't do.
            bypassRustForMemory && isRustAvailable() ? 'rust-reactor-bypassed-memory' : undefined,
            runProtected ? 'protected-document-ephemeral' : undefined,
            conversationMessages.length < conversation.messages.length ? 'history-trimmed-to-budget' : undefined
          ],
          profile.totalBudget,
          serializedLength
        )

    try {
      console.log(`[AgentBridge] POST ${this.config.endpoint} | model=${this.config.model} | ollama=${ollama} | messages=${messages.length}`)
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
        signal: chatRun.signal,
        budgetChars: profile.totalBudget,
        kind: 'chat'
      })

      console.log(`[AgentBridge] Response ${response.status} ${response.statusText} | content-type=${response.headers.get('content-type')}`)
      if (!response.ok) {
        const text = await response.text()
        console.error(`[AgentBridge] API error ${response.status} (${text.length} chars) — response body withheld from logs`)
        this.send('agent-stream-error', { error: `API request failed (${response.status}): ${text}` })
        return
      }

      if (!response.body) {
        this.send('agent-stream-error', { error: 'No response body — streaming not supported by this endpoint' })
        return
      }

      // SSE parsing: OpenAI uses "data: {json}" lines, Ollama uses raw JSON lines
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let toolCalls: Array<{ id: string; name: string; arguments: string }> = []
      let rawChunks = 0
      let abortedByUser = false

      // Electron's main-process fetch does not reliably tear down an in-flight
      // body stream when the AbortSignal fires, so cancel the reader too.
      const onAbort = (): void => { void reader.cancel().catch(() => {}) }
      if (chatRun.signal.aborted) onAbort()
      else chatRun.signal.addEventListener('abort', onAbort, { once: true })

      while (true) {
        if (chatRun.signal.aborted) { abortedByUser = true; break }
        const { done, value } = await reader.read()
        if (chatRun.signal.aborted) { abortedByUser = true; break }
        if (done) {
          console.log(`[AgentBridge] Stream ended | tokens=${fullContent.length} chars | chunks=${rawChunks}`)
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        rawChunks++
        if (rawChunks <= 2) {
          console.log(`[AgentBridge] Raw chunk #${rawChunks} (${chunk.length} bytes) — content withheld from logs`)
        }
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (ollama) {
            // Ollama native format: each line is a raw JSON object
            try {
              const parsed = JSON.parse(trimmed)
              if (parsed.done) continue // end-of-stream marker
              const content = parsed.message?.content
              if (content) {
                fullContent += content
                this.send('agent-stream-token', { token: content, fullContent })
              }
            } catch { /* skip malformed lines */ }
            continue
          }

          // OpenAI SSE format: "data: {json}"
          if (!trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            if (delta.content) {
              fullContent += delta.content
              this.send('agent-stream-token', { token: delta.content, fullContent })
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                // Fragments are keyed by index; appending to the last pushed call
                // corrupts arguments when multiple tool calls interleave in one response
                const idx = typeof tc.index === 'number' ? tc.index : (tc.id ? toolCalls.length : toolCalls.length - 1)
                if (idx < 0) continue
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: tc.id || `call_${idx}`, name: '', arguments: '' }
                }
                if (tc.id) toolCalls[idx].id = tc.id
                if (tc.function?.name) toolCalls[idx].name = tc.function.name
                if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }

      // User pressed Stop: keep whatever streamed so far and finish cleanly
      // instead of letting the model run to completion.
      if (abortedByUser) {
        console.log(`[AgentBridge] Stream aborted by user | tokens=${fullContent.length} chars`)
        this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'cancelled')
        this.send('agent-stream-done', { fullContent, toolCalls: [], chainComplete: false, aborted: true })
        return
      }

      // If tool calls were made, execute them, signal the renderer, and continue multi-turn.
      // NOTE: agent-stream-done is NOT fired here — multi-turn may generate more tokens.
      // It fires only after the chain completes (or errors) so the renderer finalizes once.
      // filter(Boolean) guards against holes if the provider skipped an index
      const completedToolCalls = toolCalls.filter(Boolean)
      if (completedToolCalls.length > 0) {
        const results: Array<{ toolCallId: string; toolName: string; result: ToolExecutionResult }> = []
        for (const tc of completedToolCalls) {
          let toolArgs: Record<string, unknown>
          try {
            toolArgs = JSON.parse(tc.arguments)
          } catch {
            console.warn(`Malformed tool arguments for ${tc.name} (${tc.arguments.length} chars) — content withheld from logs`)
            toolArgs = {}
          }
          const result = await runWithScope(chatRun.scope, () => this.executeTool(tc.name, toolArgs))
          results.push({ toolCallId: tc.id, toolName: tc.name, result })
        }

        this.send('agent-tool-results', { toolCalls: results })

        // Multi-turn: send tool results back and continue the conversation.
        // The frozen system prompt + accepted history keeps follow-up turns
        // within the same authorized scope.
        await runWithScope(chatRun.scope, () => this.handleMultiTurn(
          [{ role: 'system', content: systemContent }, ...conversationMessages],
          fullContent,
          completedToolCalls,
          results
        ))
        // handleMultiTurn sends its own stream-done/error events; mark the synthetic
        // task finished either way so the task popup closes
        this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'done', fullContent)
      } else {
        // No tool calls — stream is done
        this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'done', fullContent)
        this.send('agent-stream-done', { fullContent, toolCalls: [] })

        // Self-improvement loop: auto-extract preferences + cluster corrections.
        // Gated on the memory permission (memory.md §10.1) — extraction only
        // creates candidates; the user approves them in the Memory panel.
        const userMsg = messages.length > 0 ? messages[messages.length - 1]?.content || '' : ''
        // Mnesis conversation recording is independent of the memory permission
        // (it stores only what the user already saw in chat) but is disabled
        // for protected documents (§11) — recordTurn checks internally.
        this.recordTurn(runDocumentId, userMsg, fullContent, {
          protected: runProtected,
          projectionKey: runProjectionKey
        })
        if (userMsg.length >= 20 && this.permissions.memory && this.memoryAllowedForRun(runDocumentId, runProtected)) {
          this.autoExtractPreferences(userMsg, fullContent, runDocumentId).catch(() => {})
          this.autoClusterCorrections(runDocumentId).catch(() => {})
        }
      }

    } catch (err) {
          console.error(`[AgentBridge] Stream error:`, err)
          if ((err as Error).name === 'AbortError') {
            console.log('[AgentBridge] Aborted by user')
            this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'cancelled')
            this.send('agent-stream-done', { fullContent: '', toolCalls: [] })
            return
          }
          this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'error', undefined, (err as Error).message)
          this.send('agent-stream-error', { error: `Connection failed: ${(err as Error).message}. Make sure the AI endpoint is running at ${this.config.endpoint}` })
        } finally {
          this.runs.end(chatRun.runId)
        }
  }

  // ─── Rust Reactor Polling Loop ───
  // Delegates the full conversation loop to the native Rust reactor.
  // TS polls for events and executes tools when the reactor requests them.

  private async handleChatStreamViaRustReactor(
    messages: Array<{ role: string; content: string }>,
    context?: { documentContent?: string; currentBranch?: string; selection?: string; cursorContext?: string; storyboardContent?: string; currentFilePath?: string; documentId?: string; streamToDocument?: boolean; skill?: string },
    rendererId?: number
  ): Promise<void> {
    if (!this.config.endpoint) {
      this.send('agent-stream-error', {
        error: 'AI Endpoint Not Configured. Please configure your AI provider in Settings > Agent tab.'
      })
      return
    }

    const toolDefs = this.listTools()

    // Build system message with context.
    // Unified context budget (memory.md §8): all parts share one character budget.
    const memoryKey = context?.documentId || context?.currentFilePath
    const memoryContext = memoryKey && persistentMemoryAllowed(this.currentDocumentProtected())
      ? this.memory.formatForPrompt(memoryKey)
      : ''
    // Per-model context profile (memory.md §8.4): small/local models get a
    // smaller budget weighted toward selection and constraints.
    const profile = resolveContextProfile(this.config.model, this.contextBudgetOptions())
    // Structural retrieval (memory.md §7): documents larger than their budget
    // share send query-relevant sections instead of a prefix.
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const resolvedDocument = this.resolveDocumentContext(
      memoryKey || 'default',
      context?.documentContent,
      lastUserMessage,
      profile.totalBudget * documentBudgetShare(profile.weights),
      this.currentDocumentProtected()
    )
    const planned = planContext(
      {
        documentContent: resolvedDocument.content,
        selection: context?.selection,
        cursorContext: context?.cursorContext,
        storyboardContent: context?.storyboardContent,
        scratchpad: this.scratchpad,
        memoryContext
      },
      profile.totalBudget,
      '\n... [truncated — use document_read for the full content]',
      profile.weights
    )

    const systemParts = [
      `You are a document editing assistant integrated into Lexicon. You have access to the following tools: ${toolDefs.map((t) => t.name).join(', ')}. Use tools when the user explicitly asks you to (e.g. "write", "edit", "replace", "search"). Otherwise, respond conversationally without calling tools.\n\nFORMAT CONTRACT: Write all prose and document content in Markdown (plain text is also fine). Never emit HTML tags in your reply or in tool content — the application converts Markdown to rich text automatically. The document below is stored internally as HTML for reference only; do not imitate its markup.`
    ]
    if (context?.streamToDocument) {
      systemParts.push(
        'LIVE STREAMING MODE: The user is watching your reply stream directly into the document. Write the requested content in your response as Markdown, in full. Do NOT call document_insert, document_replace, document_insert_multiple_locations, document_batch_replace, or any other document-editing tool for this request.'
      )
    }
    const activeSkill = getAgentSkill(context?.skill)
    if (activeSkill) {
      systemParts.push(activeSkill.instruction)
      systemParts.push(activeSkill.applyGuidance)
    }
    if (planned.documentContent.content) {
      systemParts.push(
        `\nCurrent document content${resolvedDocument.partial ? '' : ' (HTML)'}:\n${planned.documentContent.content}`
      )
    }
    if (context?.currentBranch) {
      systemParts.push(`Current VCS branch: ${context.currentBranch}`)
    }
    if (planned.selection.content) {
      systemParts.push(`User's current selection: "${planned.selection.content}"`)
    }
    if (planned.cursorContext.content) {
      systemParts.push(`\nText immediately before the user's cursor (the user is working at this exact point — when asked to write or continue, pick up right after this text):\n${planned.cursorContext.content}`)
    }
    if (planned.storyboardContent.content) {
      systemParts.push(`\n<storyboard>\nThe user has a storyboard for this document. Follow its structure and instructions when writing:\n\n${planned.storyboardContent.content}\n</storyboard>`)
    }
    if (planned.scratchpad.content) {
      systemParts.push(`Your scratchpad notes:\n${planned.scratchpad.content}`)
    }
    if (planned.memoryContext.content) {
      systemParts.push(`\nLong-term memory for this document:\n${planned.memoryContext.content}`)
    }

    // Phase 4 (memory.md §9): use Mnesis curated history for prior turns when
    // the sidecar is enabled; the current request is appended exactly once.
    const conversation = await this.buildConversationMessages(memoryKey || 'default', messages)
    const allMessages = [
      { role: 'system', content: systemParts.join('\n') },
      ...conversation.messages
    ]
    // Context inspector (memory.md §10.3): account for what was sent.
    this.recordContextReport(
      planned,
      memoryKey || null,
      { source: conversation.source, turns: conversation.messages.length },
      [
        conversation.fallback,
        resolvedDocument.partial ? 'document-retrieval-partial' : undefined,
        memoryKey ? undefined : 'memory-unavailable',
        this.currentDocumentProtected() ? 'protected-document-ephemeral' : undefined
      ],
      profile.totalBudget
    )

    const convId = aiStartConversation(
      this.config.endpoint,
      this.config.apiKey,
      this.config.model,
      allMessages,
      toolDefs,
      this.maxToolTurns,
      this.temperature
    )

    if (!convId) {
      console.warn('[AgentBridge] Rust reactor failed to start — falling back to TS')
      // Re-call handleChatStream but without the Rust check (fallback handled at call site)
      this.send('agent-stream-error', { error: 'Rust conversation reactor failed to initialize' })
      this.send('agent-stream-done', { fullContent: '', toolCalls: [], chainComplete: false })
      return
    }

    // Per-run abort controller for cancellation (updates-2.md §B)
    const reactorRun = this.runs.begin({ documentId: context?.documentId || context?.currentFilePath || 'default', documentPath: context?.currentFilePath ?? '', rendererId: rendererId ?? null, snapshotHash: documentSnapshotHash(context?.documentContent), protected: this.currentDocumentProtected() })
    this.send('agent-run-scope', { ...reactorRun.scope })
    const signal = reactorRun.signal

    // Poll the reactor in a loop
    const POLL_INTERVAL_MS = 50
    const startTime = Date.now()
    const MAX_WAIT_MS = 120_000 // 2 minute max

    // Add a 'resolved' flag to prevent double-resolve on race conditions
    let resolved = false

    try {
      await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
          // Prevent any action after resolve
          if (resolved) return
          // Check abort
          if (signal.aborted) {
            aiAbortConversation(convId)
            clearInterval(interval)
            this.send('agent-stream-done', { fullContent: '', toolCalls: [], chainComplete: false })
            resolved = true
            resolve()
            return
          }

          // Check timeout
          if (Date.now() - startTime > MAX_WAIT_MS) {
            aiAbortConversation(convId)
            clearInterval(interval)
            this.send('agent-stream-error', { error: 'Conversation timed out' })
            this.send('agent-stream-done', { fullContent: '', toolCalls: [], chainComplete: false })
            resolved = true
            resolve()
            return
          }

          const event = aiPollConversation(convId)

          if (event === null) {
            // Rust not available anymore
            clearInterval(interval)
            this.send('agent-stream-error', { error: 'Rust reactor disconnected' })
            this.send('agent-stream-done', { fullContent: '', toolCalls: [], chainComplete: false })
            resolved = true
            resolve()
            return
          }

          if (event === 'waiting') {
            // No events yet — continue polling
            return
          }

          switch (event.type) {
            case 'token': {
              const token = String(event.data)
              this.send('agent-stream-token', { token, fullContent: token })
              break
            }

            case 'tool_calls': {
              const toolCalls = event.data as Array<{ id: string; name: string; arguments: string }>
              if (!Array.isArray(toolCalls)) break

              // Execute tools
        const results: Array<{ toolCallId: string; toolName: string; content: ToolExecutionResult }> = []
              for (const tc of toolCalls) {
                let toolArgs: Record<string, unknown>
                try {
                  toolArgs = JSON.parse(tc.arguments)
                } catch {
                  console.warn(`Malformed tool arguments for ${tc.name} (${tc.arguments.length} chars) — content withheld from logs`)
                  toolArgs = {}
                }
                const result = await runWithScope(reactorRun.scope, () => this.executeTool(tc.name, toolArgs))
                results.push({ toolCallId: tc.id, toolName: tc.name, content: result })
              }

              this.send('agent-tool-results', { toolCalls: results })

              // Feed results back to reactor
              aiProvideToolResults(convId, results.map((r) => ({
                toolCallId: r.toolCallId,
                toolName: r.toolName,
                content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
              })))
              break
            }

            case 'done': {
              clearInterval(interval)
              const data = event.data as { fullContent?: string; chainComplete?: boolean }
              this.send('agent-stream-done', {
                fullContent: data.fullContent || '',
                toolCalls: [],
                chainComplete: !!data.chainComplete,
              })
              resolved = true
              resolve()
              return
            }

            case 'error': {
              const errMsg = String(event.data)
              console.error('[AgentBridge/Rust] Reactor error:', errMsg)
              this.send('agent-stream-error', { error: errMsg })
              break
            }
          }
        }, POLL_INTERVAL_MS)
      })
    } finally {
      this.runs.end(reactorRun.runId)
    }
  }

  // Implements the OpenAI tool-use loop: after the model calls a tool, its result
  // is fed back so the model can decide whether to call another tool or respond.
  private async handleMultiTurn(
    originalMessages: Array<{ role: string; content: string }>,
    assistantContent: string,
    originalToolCalls: Array<{ id: string; name: string; arguments: string }>,
    toolResults: Array<{ toolCallId: string; toolName: string; result: ToolExecutionResult }>
  ): Promise<void> {
    // Ollama native format doesn't support tools — multi-turn is not applicable
    if (this.ollamaFormat) {
      this.send('agent-stream-done', { fullContent: assistantContent, toolCalls: [], chainComplete: true })
      const lastUser = originalMessages.filter((m) => m.role === 'user').pop()?.content || ''
      this.recordTurn(this.currentDocumentId(), lastUser, assistantContent)
      return
    }

    const MAX_TURNS = this.maxToolTurns
    // Full message objects are preserved across turns: assistant tool_calls and
    // tool_call_id fields must survive, or OpenAI-compatible endpoints reject
    // the history with HTTP 400 on the second follow-up turn.
    let messages: Array<Record<string, unknown>> = originalMessages.map((m) => ({ ...m }))
    let currentAssistantContent = assistantContent
    let currentToolCalls = originalToolCalls
    let currentToolResults = toolResults
    // Everything the assistant said across the whole chain — sent on stream-done
    // so the renderer's finalize doesn't wipe earlier turns from the chat bubble
    let aggregatedContent = assistantContent

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Check for user abort before each turn
      if (this.runs.activeSignal()?.aborted) {
        break
      }

      // Build assistant message with tool_calls per OpenAI spec
      // Use empty string instead of null for Ollama compatibility
      const assistantMsg: Record<string, unknown> = {
        role: 'assistant' as const,
        content: currentAssistantContent || ''
      }
      if (currentToolCalls.length > 0) {
        assistantMsg.tool_calls = currentToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          // Some providers return arguments as an object; the API expects a JSON string
          function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) }
        }))
      }

      // Cap serialized tool results: results are objects (e.g. document_read can
      // carry ~50k chars of HTML), and oversized histories make Ollama Cloud kill
      // the connection ("terminated") instead of returning a clean error.
      const MAX_TOOL_RESULT_CHARS = 12000
      const followUpMessages: Array<Record<string, unknown>> = [
        ...messages,
        assistantMsg,
        ...currentToolResults.map((tr) => {
          let content = JSON.stringify(tr.result)
          if (content.length > MAX_TOOL_RESULT_CHARS) {
            console.warn(`[AgentBridge] Truncating ${tr.toolName} result: ${content.length} -> ${MAX_TOOL_RESULT_CHARS} chars`)
            content = content.slice(0, MAX_TOOL_RESULT_CHARS) + '... [truncated: result too large for context]'
          }
          return { role: 'tool' as const, content, tool_call_id: tr.toolCallId }
        })
      ]

      // Send a status update so the UI shows the chain is progressing
      this.send('agent-chain-turn', { turn: turn + 1, maxTurns: MAX_TURNS })

      const toolDefs = this.listTools()
      const payload = {
        model: this.config.model,
        messages: followUpMessages,
        tools: toolDefs.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters }
        })),
        tool_choice: 'auto',
        temperature: this.temperature,
        // Follow-ups stream too: proxied endpoints (e.g. Ollama Cloud) close the
        // socket on long non-streaming completions ("other side closed")
        stream: true
      }

      try {
        // Retry the whole turn (fetch + body read) on transient network errors:
        // Ollama Cloud and other proxied endpoints can close the socket both at
        // connection time ("other side closed") and mid-SSE-read ("terminated").
        // The turn is buffered, not emitted live, so a retry can't splice text
        // from a discarded attempt into the chat bubble.
        const MAX_ATTEMPTS = 3
        const body = JSON.stringify(payload)
        console.log(`[AgentBridge] Multi-turn turn ${turn + 1}: payload ${(body.length / 1024).toFixed(1)} KB | ${followUpMessages.length} messages | ${toolDefs.length} tools`)
        let turnResult: { content: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> } | undefined
        let httpFailed = false
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const response = await this.gateway.post({
              endpoint: this.config.endpoint,
              body,
              headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
              signal: this.runs.activeSignal(),
              kind: 'chat'
            })
            if (!response.ok) {
              const errorText = await response.text().catch(() => 'unknown')
              console.error(`[AgentBridge] Multi-turn HTTP ${response.status} at turn ${turn + 1} (${errorText.length} chars) — body withheld from logs`)
              this.send('agent-stream-error', {
                error: `AI endpoint returned HTTP ${response.status} on follow-up (turn ${turn + 1}). ${errorText.slice(0, 200)}`
              })
              httpFailed = true
              break
            }
            turnResult = await this.readFollowUpResponse(response)
            if (attempt > 1) console.log(`[AgentBridge] Multi-turn turn ${turn + 1} succeeded on attempt ${attempt}`)
            break
          } catch (fetchErr) {
            if ((fetchErr as Error).name === 'AbortError') throw fetchErr
            // Surface the underlying network error — "fetch failed"/"terminated" alone hide the cause
            const cause = (fetchErr as { cause?: { message?: string; code?: string } }).cause
            const detail = cause?.message || cause?.code || (fetchErr as Error).message
            console.warn(`[AgentBridge] Multi-turn attempt ${attempt}/${MAX_ATTEMPTS} failed: ${detail}`)
            if (attempt === MAX_ATTEMPTS) {
              throw new Error(`${(fetchErr as Error).message}${cause ? ` (${detail})` : ''}`)
            }
            await new Promise((r) => setTimeout(r, 500 * attempt))
          }
        }
        if (httpFailed) break
        if (!turnResult) throw new Error('No response from endpoint')

        const followUpContent = turnResult.content
        const followUpToolCalls = turnResult.toolCalls
        if (followUpContent) {
          const separator = aggregatedContent ? '\n\n' : ''
          aggregatedContent += separator + followUpContent
          this.send('agent-stream-token', { token: separator + followUpContent, fullContent: aggregatedContent, isFollowUp: true })
        }

        if (followUpToolCalls && followUpToolCalls.length > 0) {
          const results: Array<{ toolCallId: string; toolName: string; result: ToolExecutionResult }> = []
          for (const tc of followUpToolCalls) {
            let toolArgs: Record<string, unknown> = {}
            try {
              const argsStr = typeof tc.function.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments)
              toolArgs = JSON.parse(argsStr)
            } catch (e) {
              console.error(`[AgentBridge] Failed to parse arguments for tool ${tc.function.name}:`, {
                rawArguments: tc.function.arguments,
                error: (e as Error).message
              })
            }
            const result = await this.executeTool(tc.function.name, toolArgs)
            results.push({ toolCallId: tc.id, toolName: tc.function.name, result })
          }
          this.send('agent-tool-results', { toolCalls: results, turn: turn + 1 })

          // Continue the chain with updated message history (full objects, tool_calls intact)
          messages = followUpMessages
          currentAssistantContent = followUpContent
          currentToolCalls = followUpToolCalls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments
          }))
          currentToolResults = results
        } else {
          // No more tool calls — chain complete
          this.send('agent-stream-done', { fullContent: aggregatedContent, toolCalls: [], chainComplete: true })
          const lastUser = originalMessages.filter((m) => m.role === 'user').pop()?.content || ''
          this.recordTurn(this.currentDocumentId(), lastUser, aggregatedContent)
          return  // Return directly instead of break + fallthrough to agent-chain-complete
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          console.log('[AgentBridge] Multi-turn chain aborted by user')
          this.send('agent-stream-done', { fullContent: aggregatedContent, toolCalls: [], chainComplete: false })
          return
        }
        const msg = (err as Error).message
        console.error(`[AgentBridge] Multi-turn chain error at turn ${turn + 1}:`, { error: msg, endpoint: this.config.endpoint })
        this.send('agent-stream-error', {
          error: `Multi-turn error at turn ${turn + 1}: ${msg}. The streamed content that was already applied is preserved.`
        })
        // Still fire stream-done so the renderer finalizes the message
        this.send('agent-stream-done', { fullContent: aggregatedContent, toolCalls: [], chainComplete: false })
        return
      }
    }

    // Fallthrough: max turns exhausted without completion
    this.send('agent-stream-done', { fullContent: aggregatedContent, toolCalls: [], chainComplete: false })
  }

  // Reads a follow-up completion, SSE or plain JSON, fully buffered with no
  // side effects so a failed read can be retried without duplicating UI output.
  private async readFollowUpResponse(
    response: Response
  ): Promise<{ content: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }> {
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('event-stream') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      const accumulated: Array<{ id: string; name: string; arguments: string }> = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue
          try {
            const parsed = JSON.parse(dataStr)
            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue
            if (delta.content) content += delta.content
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = typeof tc.index === 'number' ? tc.index : (tc.id ? accumulated.length : accumulated.length - 1)
                if (idx < 0) continue
                if (!accumulated[idx]) accumulated[idx] = { id: tc.id || `call_${idx}`, name: '', arguments: '' }
                if (tc.id) accumulated[idx].id = tc.id
                if (tc.function?.name) accumulated[idx].name = tc.function.name
                if (tc.function?.arguments) accumulated[idx].arguments += tc.function.arguments
              }
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
      return {
        content,
        toolCalls: accumulated.filter(Boolean).map((tc) => ({ id: tc.id, function: { name: tc.name, arguments: tc.arguments } }))
      }
    }

    // Endpoint ignored stream:true and returned plain JSON
    const data = await response.json()
    const choice = data.choices?.[0]
    return { content: choice?.message?.content || '', toolCalls: choice?.message?.tool_calls || [] }
  }

  abortStream(rendererId?: number): number {
    return rendererId === undefined ? this.runs.abortAll() : this.runs.abortFor(rendererId)
  }

  getPresets(): AgentPreset[] {
    return [...this.presets]
  }

  addPreset(preset: Omit<AgentPreset, 'id'>): AgentPreset {
    const p: AgentPreset = { ...preset, id: crypto.randomUUID().slice(0, 8) }
    this.presets.push(p)
    return p
  }

  deletePreset(id: string): boolean {
    const idx = this.presets.findIndex((p) => p.id === id)
    if (idx === -1) return false
    this.presets.splice(idx, 1)
    return true
  }

  applyPreset(id: string): AgentConfig | null {
    const preset = this.presets.find((p) => p.id === id)
    if (!preset) return null
    this.config = { endpoint: preset.endpoint, apiKey: preset.apiKey, model: preset.model }
    return { ...this.config }
  }

  getScratchpad(): string {
    return this.scratchpad
  }

  setScratchpad(content: string): void {
    this.scratchpad = content
  }

  private registerBuiltinTools(): void {
    this.registerTool({
      name: 'document_read',
      description: 'Read the current document content as HTML',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async () => {
      const html = await this.requestDocumentText(3000, 'html')
      if (html === null) {
        return { error: 'Could not read document content from the editor (no document open or editor not ready)' }
      }
      // Cap payload so huge documents don't blow up the model context
      const MAX_CHARS = 50000
      const truncated = html.length > MAX_CHARS
      return {
        success: true,
        operation: 'document_read',
        content: truncated ? html.slice(0, MAX_CHARS) : html,
        truncated,
        totalLength: html.length
      }
    })

    this.registerTool({
      name: 'document_section',
      description:
        'Read one section of the current document by (partial) heading name. Use this after a partial document view to read a specific section in full — it returns the section from its heading to the next heading of the same level, with its heading path.',
      parameters: {
        type: 'object',
        properties: {
          heading: { type: 'string', description: 'Heading text or path fragment, e.g. "Results" or "Chapter 1 > Scene 2"' }
        },
        required: ['heading']
      }
    }, async (args) => {
      const heading = typeof args.heading === 'string' ? args.heading : ''
      if (!heading.trim()) {
        return { error: 'heading is required' }
      }
      const html = await this.requestDocumentText(3000, 'html')
      if (html === null) {
        return { error: 'Could not read document content from the editor (no document open or editor not ready)' }
      }
      // §7.3/§9.2 expansion: a fresh source read, never a summary quote.
      const section = extractSection(html, heading)
      if (!section) {
        return { success: true, operation: 'document_section', found: false, error: `No section heading matches "${heading}"` }
      }
      const MAX_CHARS = 20000
      const truncated = section.text.length > MAX_CHARS
      return {
        success: true,
        operation: 'document_section',
        found: true,
        headingPath: section.headingPath,
        content: truncated ? section.text.slice(0, MAX_CHARS) : section.text,
        truncated,
        totalLength: section.text.length
      }
    })

    this.registerTool({
      name: 'document_replace',
      description: 'Replace text in the document. Supports find/replace with optional regex.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Text to search for' },
          replace: { type: 'string', description: 'Replacement text' },
          useRegex: { type: 'boolean', description: 'Use regex for search' },
          replaceAll: { type: 'boolean', description: 'Replace all occurrences' }
        },
        required: ['search', 'replace']
      }
    }, async (args) => {
      // Send command to renderer to apply the replace
      this.sendToolApply('document_replace', args)
      return { success: true, operation: 'document_replace', message: 'Replacement applied to document' }
    })

    this.registerTool({
      name: 'document_insert',
      description: 'Insert content at a specific position in the document. Defaults to the user\'s cursor, which is where the user is currently working.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Markdown (or plain text) content to insert — the app converts it to rich text' },
          position: { type: 'string', description: 'Where to insert: "cursor" (default, at the user\'s cursor), "end" (append to the end of the document), or "start" (prepend to the beginning)', enum: ['cursor', 'end', 'start'] }
        },
        required: ['content']
      }
    }, async (args) => {
      // Send command to renderer to apply the insert
      this.sendToolApply('document_insert', args)
      return { success: true, operation: 'document_insert', message: 'Content inserted into document' }
    })

    this.registerTool({
      name: 'document_insert_after_element',
      description: 'Insert content immediately after a specific heading or paragraph in the document.',
      parameters: {
        type: 'object',
        properties: {
          searchText: { type: 'string', description: 'The heading or paragraph text to find' },
          content: { type: 'string', description: 'Markdown (or plain text) content to insert after the element — the app converts it to rich text' },
          elementType: { type: 'string', description: 'Type of element to search for', enum: ['paragraph', 'heading', 'bullet'] }
        },
        required: ['searchText', 'content']
      }
    }, async (args) => {
      this.sendToolApply('document_insert_after_element', args)
      return { success: true, operation: 'document_insert_after_element', args, message: 'Content queued for insertion after element (pending user review)' }
    })

    this.registerTool({
      name: 'document_insert_multiple_locations',
      description: 'Atomically insert content at multiple locations in the document in a single operation.',
      parameters: {
        type: 'object',
        properties: {
          insertions: {
            type: 'array',
            description: 'Array of insertion specifications',
            items: {
              type: 'object',
              properties: {
                position: { type: 'string', enum: ['end', 'start', 'cursor'], description: 'Position within document' },
                content: { type: 'string', description: 'Markdown (or plain text) content to insert — the app converts it to rich text' },
                afterElement: { type: 'string', description: 'Optional: insert after this element text' }
              }
            }
          }
        },
        required: ['insertions']
      }
    }, async (args) => {
      this.sendToolApply('document_insert_multiple_locations', args)
      return { success: true, operation: 'document_insert_multiple_locations', args, message: 'Multiple insertions queued (pending user review)' }
    })

    // v0.5.3: Document intelligence tools
    this.registerTool({
      name: 'document_search',
      description: 'Search the current document text. Supports plain text or regex queries and returns matching lines with surrounding context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query or regex pattern' },
          contextLines: { type: 'number', description: 'Context lines before/after (default 2)' },
          caseSensitive: { type: 'boolean', description: 'Case sensitive search' }
        },
        required: ['query']
      }
    }, async (args) => {
      const query = args.query as string
      if (!query) return { error: 'query is required' }
      const contextLines = typeof args.contextLines === 'number' ? Math.max(0, args.contextLines) : 2
      const caseSensitive = args.caseSensitive === true

      const text = await this.requestDocumentText()
      if (text === null) {
        return { error: 'Could not read document content from the editor (no document open or editor not ready)' }
      }

      let regex: RegExp
      try {
        regex = new RegExp(query, caseSensitive ? '' : 'i')
      } catch {
        // Not a valid regex — fall back to a literal match
        regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i')
      }

      const lines = text.split('\n')
      const results: Array<{ line: number; match: string; before: string; after: string }> = []
      const MAX_RESULTS = 20
      for (let i = 0; i < lines.length; i++) {
        if (!regex.test(lines[i])) continue
        results.push({
          line: i + 1,
          match: lines[i].trim(),
          before: lines.slice(Math.max(0, i - contextLines), i).join('\n'),
          after: lines.slice(i + 1, i + 1 + contextLines).join('\n')
        })
        if (results.length >= MAX_RESULTS) break
      }

      return {
        success: true,
        operation: 'document_search',
        query,
        matchCount: results.length,
        truncated: results.length >= MAX_RESULTS,
        results,
        message: results.length > 0
          ? `Found ${results.length} matching line${results.length !== 1 ? 's' : ''}`
          : 'No matches found'
      }
    })

    this.registerTool({
      name: 'document_find_and_format',
      description: 'Atomically find text and apply formatting (bold, italic, heading, color).',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Text to find' },
          format: {
            type: 'object',
            description: 'Formatting to apply',
            properties: {
              bold: { type: 'boolean', description: 'Make text bold' },
              italic: { type: 'boolean', description: 'Make text italic' },
              heading: { type: 'number', description: 'Heading level 1-3', enum: [1, 2, 3] },
              color: { type: 'string', description: 'Text color (hex or name)' }
            }
          },
          occurrence: { type: 'number', description: 'Occurrence number (1-based), 0 = all' }
        },
        required: ['search', 'format']
      }
    }, async (args) => {
      this.sendToolApply('document_find_and_format', args)
      return { success: true, operation: 'document_find_and_format', args, message: 'Find and format queued (pending user review)' }
    })

    this.registerTool({
      name: 'document_batch_replace',
      description: 'Perform multiple find/replace operations atomically with single undo.',
      parameters: {
        type: 'object',
        properties: {
          replacements: {
            type: 'array',
            description: 'Array of find/replace pairs',
            items: {
              type: 'object',
              properties: {
                search: { type: 'string', description: 'Text to find' },
                replace: { type: 'string', description: 'Replacement text' }
              }
            }
          },
          useRegex: { type: 'boolean', description: 'Use regex patterns' }
        },
        required: ['replacements']
      }
    }, async (args) => {
      this.sendToolApply('document_batch_replace', args)
      return { success: true, operation: 'document_batch_replace', args, message: 'Batch replace queued (pending user review)' }
    })

    this.registerTool({
      name: 'document_create_list',
      description: 'Create a bullet or numbered list from an array of items.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'List items'
          },
          type: { type: 'string', description: 'List type', enum: ['bullet', 'ordered'] },
          position: { type: 'string', description: 'Where to insert', enum: ['end', 'start'] }
        },
        required: ['items', 'type']
      }
    }, async (args) => {
      this.sendToolApply('document_create_list', args)
      return { success: true, operation: 'document_create_list', args, message: 'List queued for insertion (pending user review)' }
    })

    this.registerTool({
      name: 'document_format',
      description: 'Apply formatting to selected text or the whole document',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Format type to apply', enum: ['bold', 'italic', 'underline', 'heading1', 'heading2', 'heading3', 'bulletList', 'orderedList'] },
          selection: { type: 'string', description: 'Text to format (finds and formats it)' }
        },
        required: ['type']
      }
    }, async (args) => {
      this.sendToolApply('document_format', args)
      return { success: true, operation: 'document_format', args, message: 'Formatting queued (pending user review)' }
    })

    this.registerTool({
      name: 'document_delete',
      description: 'Delete a range of text from the document',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Text to find and delete' },
          occurrence: { type: 'number', description: 'Which occurrence to delete (1-based), 0 = all' }
        },
        required: ['search']
      }
    }, async (args) => {
      this.sendToolApply('document_delete', args)
      return { success: true, operation: 'document_delete', args, message: 'Deletion queued (pending user review)' }
    })

    // Scratchpad tool
    this.registerTool({
      name: 'scratchpad_write',
      description: 'Write notes to your private scratchpad. These notes persist across conversations and are included in your context for future responses.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to write to the scratchpad' },
          append: { type: 'boolean', description: 'Append to existing content instead of replacing' }
        },
        required: ['content']
      }
    }, async (args) => {
      const content = args.content as string
      const append = args.append as boolean
      if (append) {
        this.scratchpad += '\n' + content
      } else {
        this.scratchpad = content
      }
      return { success: true, length: this.scratchpad.length }
    })

    this.registerTool({
      name: 'scratchpad_read',
      description: 'Read your private scratchpad notes',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async () => {
      return { content: this.scratchpad || '(empty)' }
    })

    // Storyboard tools — read and update the companion .storyboard.md file
    this.registerTool({
      name: 'storyboard_read',
      description: 'Read the current document\'s storyboard. The storyboard contains writing instructions, chapter outlines, character profiles, style guides, and section statuses. Always read this before writing new content.',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async () => {
      try {
        const fs = await import('fs/promises')
        const docPath = this.currentDocumentPath()
        if (!docPath) return { content: '', error: 'No document path available' }
        const sbPath = docPath.replace(/\.\w+$/, '.storyboard.md')
        const content = await fs.readFile(sbPath, 'utf-8')
        return { content }
      } catch {
        return { content: '', note: 'No storyboard exists yet. Use storyboard_update to create one.' }
      }
    })

    this.registerTool({
      name: 'storyboard_update',
      description: 'Update the document\'s storyboard. Use this to mark sections as complete, add notes, update statuses, or modify writing instructions. Provide the full updated markdown content.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Full updated storyboard markdown content' },
          section: { type: 'string', description: 'Optional: specific section being updated (e.g. "Chapters.Chapter 1.Status")' },
          mode: { type: 'string', description: 'replace (default) or append' }
        },
        required: ['content']
      }
    }, async (args) => {
      try {
        const fs = await import('fs/promises')
        const docPath = this.currentDocumentPath()
        if (!docPath) return { success: false, error: 'No document path available' }
        const sbPath = docPath.replace(/\.\w+$/, '.storyboard.md')
        const content = args.content as string
        await fs.writeFile(sbPath, content, 'utf-8')
        return { success: true, section: args.section || 'full' }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })

    // Cross-document search
    this.registerTool({
      name: 'search_documents',
      description: 'Search across all open documents for specific terms. Returns matching file paths and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or phrase' }
        },
        required: ['query']
      }
    }, async (args) => {
        return { query: args.query, results: [], note: 'Use web_search for external research or ask user to open specific files' }
        })

        // VCS tools
    this.registerTool({
      name: 'vcs_commit',
      description: 'Create a version control commit with the current document state',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' }
        },
        required: ['message']
      }
    }, async (args) => {
      const message = args.message as string
      return { success: true, operation: 'vcs_commit', message }
    })

    this.registerTool({
      name: 'vcs_log',
      description: 'Show version control commit history',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async () => {
      const commits = await this.vcs.log()
      return { commits }
    })

    this.registerTool({
      name: 'vcs_diff',
      description: 'Show differences between document versions',
      parameters: {
        type: 'object',
        properties: {
          fromId: { type: 'string', description: 'Source commit ID (omit for previous)' },
          toId: { type: 'string', description: 'Target commit ID (omit for current)' }
        },
        required: []
      }
    }, async (args) => {
      return this.vcs.diff(args.fromId as string | undefined, args.toId as string | undefined)
    })

    this.registerTool({
      name: 'vcs_revert',
      description: 'Revert document to a previous commit',
      parameters: {
        type: 'object',
        properties: {
          commitId: { type: 'string', description: 'Commit ID to revert to' }
        },
        required: ['commitId']
      }
    }, async (args) => {
      const content = this.vcs.revert(args.commitId as string)
      return { success: !!content, content, commitId: args.commitId }
    })

    this.registerTool({
      name: 'vcs_branch_create',
      description: 'Create a new branch for parallel editing',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Branch name' }
        },
        required: ['name']
      }
    }, async (args) => {
      const branch = await this.vcs.createBranch(args.name as string)
      return { success: true, branch }
    })

    this.registerTool({
      name: 'vcs_branch_switch',
      description: 'Switch to a different branch',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Branch name to switch to' }
        },
        required: ['name']
      }
    }, async (args) => {
      const success = await this.vcs.switchBranch(args.name as string)
      return { success, branch: args.name }
    })

    this.registerTool({
      name: 'vcs_branch_list',
      description: 'List all branches',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async () => {
      const branches = await this.vcs.listBranches()
      return { branches }
    })

    this.registerTool({
      name: 'web_search',
      description: 'Search the web for information. Returns search results with titles, URLs, and snippets that can be cited in the document.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Maximum number of results (default 5)' }
        },
        required: ['query']
      }
    }, async (args) => {
      const query = args.query as string
      const maxResults = (args.maxResults as number) || 5
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
        const response = await fetch(url)
        if (!response.ok) return { error: `Search failed: HTTP ${response.status}` }
        const data = await response.json() as {
          Abstract?: string; Heading?: string; AbstractURL?: string
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
          Results?: Array<{ Title?: string; FirstURL?: string; Text?: string }>
        }
        const results: Array<{ title: string; url: string; snippet: string }> = []

        // Parse DDG results
        if (data.Abstract) {
          results.push({ title: data.Heading || query, url: data.AbstractURL || '', snippet: data.Abstract })
        }
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
            if (topic.Text && topic.FirstURL) {
              results.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL, snippet: topic.Text })
            }
          }
        }
        if (data.Results) {
          for (const r of data.Results.slice(0, maxResults - results.length)) {
            results.push({ title: r.Title || '', url: r.FirstURL || '', snippet: r.Text || '' })
          }
        }

        return { query, results: results.slice(0, maxResults) }
      } catch (err) {
        return { error: `Web search failed: ${(err as Error).message}` }
      }
    })

    this.registerTool({
      name: 'web_fetch',
      description: 'Fetch and extract readable text content from a URL. Use this after web_search to read full article content for research.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch and extract content from' }
        },
        required: ['url']
      }
    }, async (args) => {
        const url = args.url as string
        try {
          // SSRF protection: block private IP ranges and metadata endpoints
          const parsed = new URL(url)
          const hostname = parsed.hostname
          const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|::1$|fc00:|fe80:)/i.test(hostname)
          const isMetadata = hostname === '169.254.169.254' || hostname === 'metadata.google.internal'
          if (isPrivate || isMetadata || !['http:', 'https:'].includes(parsed.protocol)) {
            return { error: 'Blocked: URL resolves to a private/internal address or non-http protocol' }
          }

          const response = await fetch(url, {
            headers: { 'User-Agent': 'Lexicon/1.0 (research agent)' },
            signal: AbortSignal.timeout(15000)
          })
          if (!response.ok) return { error: `HTTP ${response.status}` }
          const html = await response.text()
          // Simple readability: strip tags, normalize whitespace, truncate
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
          const truncated = text.length > 8000 ? text.slice(0, 8000) + '... [truncated]' : text
          return { url, content: truncated, length: truncated.length }
        } catch (err) {
          return { error: `Web fetch failed: ${(err as Error).message}` }
        }
      })

      this.registerTool({
        name: 'outline_generate',
      description: 'Generate a document outline/structure from a topic. Returns a hierarchical outline with headings and subheadings.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic or subject for the outline' },
          depth: { type: 'number', description: 'Outline depth: 1=main headings only, 2=subheadings, 3=sub-subheadings (default 2)' }
        },
        required: ['topic']
      }
    }, async (args) => {
      // §11 boundary 7 gate (R2): tool-dispatched provider calls require consent.
      if (!this.remoteInferenceAllowed()) {
        return { error: 'Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.' }
      }
      const topic = args.topic as string
      const depth = (args.depth as number) || 2
      try {
        const payload = this.buildCompletionPayload([
                    { role: 'system', content: `Generate a document outline for the given topic. Return a JSON array of objects, each with "level" (1-3), "title" (string), and "children" (array of same objects, can be empty). Return ONLY the JSON array, no other text.` },
                    { role: 'user', content: `Generate a ${depth}-level outline for: ${topic}` }
                  ], 0.5)
                const response = await this.gateway.post({
                  endpoint: this.config.endpoint,
                  payload,
                  headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
                })
                if (!response.ok) return { error: 'Outline generation failed' }
                const data = await response.json()
                const content = this.parseCompletionResponse(data).content || '[]'
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        const outline = jsonMatch ? JSON.parse(jsonMatch[0]) : []
        return { topic, depth, outline }
      } catch (err) {
        return { error: `Outline generation failed: ${(err as Error).message}` }
      }
    })

    this.registerTool({
      name: 'summarize',
      description: 'Generate a summary of the document or selected text. Returns an executive summary, abstract, or TL;DR.',
      parameters: {
        type: 'object',
        properties: {
          style: { type: 'string', description: 'Summary style', enum: ['executive', 'abstract', 'tldr', 'bullets'] },
          maxLength: { type: 'number', description: 'Maximum length in words (default 200)' }
        },
        required: ['style']
      }
    }, async (args) => {
      const style = args.style as string
      const maxLength = (args.maxLength as number) || 200
      // The actual document content will be injected from the context in the system prompt
      return { success: true, operation: 'summarize', style, maxLength }
    })

    this.registerTool({
      name: 'translate',
      description: 'Translate text to a target language. Returns the translated text.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          targetLanguage: { type: 'string', description: 'Target language (e.g. "Spanish", "French", "Japanese")' }
        },
        required: ['text', 'targetLanguage']
      }
    }, async (args) => {
      // §11 boundary 7: a tool dispatch is still a provider request and must
      // obey remote-consent on every attempt (R2).
      if (!this.remoteInferenceAllowed()) {
        return { error: 'Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.' }
      }
      const text = args.text as string
      const targetLanguage = args.targetLanguage as string
      try {
        const payload = this.buildCompletionPayload([
                    { role: 'system', content: `You are a professional translator. Translate the following text to ${targetLanguage}. Return ONLY the translated text, nothing else. Preserve the original formatting and tone.` },
                    { role: 'user', content: text }
                  ], 0.3)
                const response = await this.gateway.post({
                  endpoint: this.config.endpoint,
                  payload,
                  headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
                })
                if (!response.ok) return { error: 'Translation failed' }
                const data = await response.json()
                const translated = this.parseCompletionResponse(data).content
        return { original: text, translated, targetLanguage }
      } catch (err) {
        return { error: `Translation failed: ${(err as Error).message}` }
      }
    })

    // Structured TipTap editing tool for precise, type-safe document operations
    this.registerTool({
      name: 'edit_tiptap_document',
      description: 'Apply structured edits to the document using deterministic, reversible operations. Never write raw HTML. Use this for complex document transformations.',
      parameters: {
        type: 'object',
        properties: {
          ops: {
            type: 'array',
            description: 'Array of structured operations to apply to the document',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['insert_text', 'replace_range', 'add_heading', 'add_paragraph', 'bullet_list', 'bold', 'italic'],
                  description: 'The type of operation to perform'
                },
                text: { type: 'string', description: 'Text content (for insert_text, add_heading, add_paragraph)' },
                pos: { type: 'number', description: 'Position to insert at (for insert_text, optional)' },
                from: { type: 'number', description: 'Start position (for replace_range, bold, italic)' },
                to: { type: 'number', description: 'End position (for replace_range, bold, italic)' },
                level: {
                  type: 'number',
                  enum: [1, 2, 3, 4, 5, 6],
                  description: 'Heading level (for add_heading)'
                },
                items: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List items (for bullet_list)'
                }
              },
              required: ['type']
            }
          }
        },
        required: ['ops']
      }
    }, async (args) => {
      // Send structured ops to renderer for execution via TipTap
      this.send('agent-edit-tiptap', {
        ops: args.ops,
        ...this.runIdentity()
      })
      const opsCount = Array.isArray(args.ops) ? args.ops.length : 0
      return { success: true, operation: 'edit_tiptap_document', message: `Queued ${opsCount} operation${opsCount !== 1 ? 's' : ''} for application` }
    })

    this.registerTool({
      name: 'memory_save',
      description: 'Save a fact, preference, decision, or correction to long-term memory. Use scope "global" for preferences that apply to all documents (writing style, tone, formatting). Use scope "document" for document-specific facts.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Memory type: fact, preference, decision, correction, or summary' },
          content: { type: 'string', description: 'The memory content to save' },
          scope: { type: 'string', description: 'Scope: "document" (default) or "global" (applies to all documents)', enum: ['document', 'global'] }
        },
        required: ['type', 'content']
      }
    }, async (args) => {
      const docId = this.currentDocumentId()
      // §11/§B: protected or revoked documents never persist memory, even on
      // tool request — main-owned policy wins over a renderer flag.
      if (!this.memoryAllowedForRun(docId, this.currentDocumentProtected())) {
        return { success: false, error: 'This document is protected — memory saving is disabled (ephemeral mode).' }
      }
      // §11 boundary 2: remembering facts requires consent; boundary 5:
      // global scope additionally requires cross-document consent.
      if (!this.consent.rememberDocumentFacts) {
        return { success: false, error: 'Remembering document facts is disabled in Privacy settings.' }
      }
      const scope = (args.scope as 'document' | 'global') || 'document'
      if (scope === 'global' && !this.consent.crossDocumentPreferences) {
        return { success: false, error: 'Cross-document preferences are disabled in Privacy settings. Save with document scope instead.' }
      }
      const entry = this.memory.add(docId, 'assistant', args.type as any, args.content as string, 'inferred', scope)
      return { success: true, result: `Saved ${scope} memory (pending approval): ${entry.content.slice(0, 50)}...` }
    })

    this.registerTool({
      name: 'memory_recall',
      description: 'Search long-term memory for this document. Returns entries relevant to the query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }, async (args) => {
      const docId = this.currentDocumentId()
      // §11/§B protected documents: recall is transient-only, even if the
      // memory permission is granted (R3/R6).
      if (!this.memoryAllowedForRun(docId, this.currentDocumentProtected())) {
        return { success: false, error: 'This document is protected — memory recall is disabled (ephemeral mode).' }
      }
      const result = this.memory.retrieve(docId, args.query as string, 5, this.consent.crossDocumentPreferences)
      return { success: true, result: JSON.stringify(result.entries.map(e => `[${e.type}] ${e.content}`)) }
    })

    this.registerTool({
      name: 'memory_clear',
      description: 'Clear all long-term memory for this document. Use when the user asks to forget everything.',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async () => {
      const docId = this.currentDocumentId()
      this.memory.clearForDocument(docId)
      return { success: true, result: 'Memory cleared' }
    })
  }

  private loadSessions(): void {
    // Worker path: sessions load asynchronously via loadSessionsFromDriver().
    if (this.sessionDriver) return
    try {
      // Ledger first: authoritative once materialized.
      if (this.sessionLedger.isInitialized(AgentLedger.sessionsMetaKey())) {
        for (const s of this.sessionLedger.loadSessions()) this.sessions.set(s.id, s)
        return
      }
    } catch (err) {
      console.warn('[AgentBridge] Session ledger unavailable:', (err as Error).message)
      return
    }
    try {
      if (fs.existsSync(this.sessionsPath)) {
        const data = JSON.parse(fs.readFileSync(this.sessionsPath, 'utf-8'))
        const arr: AgentSession[] = data.sessions || []
        for (const s of arr) { this.sessions.set(s.id, s) }
      }
      // Materialize the ledger so subsequent loads are authoritative.
      this.sessionLedger.writeSessions(Array.from(this.sessions.values()))
    } catch {
      // Corrupted or missing session file — start fresh
      console.warn('Failed to load agent sessions, starting with empty sessions')
    }
  }

  private saveSessions(): void {
    const arr = Array.from(this.sessions.values())
    // Compatibility mirror first (legacy commit point), ledger commit second.
    fs.writeFileSync(this.sessionsPath, JSON.stringify({ sessions: arr }), 'utf-8')
    if (this.sessionDriver) {
      // Write-behind: the worker owns the session DB; commit on flushSessions().
      this.sessionsDirty = true
      return
    }
    this.sessionLedger.writeSessions(arr)
  }

  /** Worker path: load the authoritative sessions from the driver at startup. */
  async loadSessionsFromDriver(): Promise<void> {
    if (!this.sessionDriver) return
    try {
      const loaded = await this.sessionDriver.loadSessions()
      this.sessions.clear()
      for (const s of loaded) this.sessions.set(s.id, s)
    } catch (err) {
      console.warn('[AgentBridge] Session driver load failed:', (err as Error).message)
    }
  }

  /** Worker path: commit write-behind sessions through the driver. */
  async flushSessions(): Promise<void> {
    if (!this.sessionDriver || !this.sessionsDirty) return
    this.sessionsDirty = false
    try {
      await this.sessionDriver.writeSessions(Array.from(this.sessions.values()))
    } catch (err) {
      this.sessionsDirty = true
      throw err
    }
  }

  /** Await commit of all write-behind memory + session + control mutations (§A). */
  async flushMemoryWrites(): Promise<void> {
    await this.memory.flush()
    await this.flushSessions()
    await this.control.flush()
  }

  getOrCreateSession(documentId: string, agentName: string, systemPrompt?: string): AgentSession {
    const key = `${documentId}:${agentName}`
    // Track the session-scoped projection key for the next run (R12).
    this._currentProjectionKey = key
    const existing = this.sessions.get(key)
    if (existing) { existing.updatedAt = Date.now(); return existing }

    const profile = this.profiles.find((p) => p.name === agentName)
    const session: AgentSession = {
      id: key,
      documentId,
      agentName,
      systemPrompt: systemPrompt || profile?.systemPrompt || 'You are a helpful document editing assistant.',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    this.sessions.set(key, session)
    this.saveSessions()
    return session
  }

  addSessionMessage(sessionId: string, role: string, content: string): void {
    // §11 boundary 1 / §B (R1): without consent to retain chat history — or for
    // a protected/revoked document — messages stay in a separate ephemeral
    // buffer and are never serialized. A later opt-in does not flush this buffer
    // into the retained store.
    if (!this.sessionRetentionAllowed(this.documentIdForSession(sessionId))) {
      const buffer = this.ephemeralSessionMessages.get(sessionId) ?? []
      buffer.push({ role, content })
      this.ephemeralSessionMessages.set(sessionId, buffer)
      return
    }
    const session = this.sessions.get(sessionId)
    if (session) {
      session.messages.push({ role, content })
      session.updatedAt = Date.now()
      this.saveSessions()
    }
  }

  /** True when a document's sessions may be written to retained storage. */
  private sessionRetentionAllowed(documentId: string): boolean {
    if (!this.consent.retainLocalChatHistory) return false
    if (this.documentPolicy.isProtected(documentId) || this.documentPolicy.isRevoked(documentId)) return false
    return true
  }

  private documentIdForSession(sessionId: string): string {
    return this.sessions.get(sessionId)?.documentId ?? sessionId.split(':')[0]
  }

  getSessionMessages(sessionId: string): Array<{ role: string; content: string }> {
    const session = this.sessions.get(sessionId)
    const retained = session ? session.messages : []
    const ephemeral = this.ephemeralSessionMessages.get(sessionId) ?? []
    return [...retained, ...ephemeral]
  }

  clearSession(sessionId: string): void {
    this.ephemeralSessionMessages.delete(sessionId)
    const session = this.sessions.get(sessionId)
    if (session) { session.messages = []; session.updatedAt = Date.now(); this.saveSessions() }
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.ephemeralSessionMessages.delete(sessionId)
    this.saveSessions()
  }

  /**
   * Purge retained plaintext that re-derives forgotten memory (R7). Suppression
   * fingerprints decide what leaves, so unrelated turns survive. Applies to
   * both retained sessions and the separate ephemeral buffer.
   */
  private purgeSuppressedSessionMessages(documentId: string): number {
    const suppressions = this.memory.suppressionsFor(documentId)
    if (suppressions.length === 0) return 0
    let removed = 0
    let changed = false
    const filter = (content: string): boolean => !isSuppressedContent(content, suppressions)
    for (const session of Array.from(this.sessions.values())) {
      if (session.documentId !== documentId) continue
      const before = session.messages.length
      session.messages = session.messages.filter((m: { content: string }) => filter(m.content))
      removed += before - session.messages.length
      if (session.messages.length !== before) { session.updatedAt = Date.now(); changed = true }
    }
    for (const [sessionId, buffer] of Array.from(this.ephemeralSessionMessages)) {
      const session = this.sessions.get(sessionId)
      if (!session || session.documentId !== documentId) continue
      const kept = buffer.filter((m: { content: string }) => filter(m.content))
      removed += buffer.length - kept.length
      if (kept.length !== buffer.length) this.ephemeralSessionMessages.set(sessionId, kept)
    }
    if (changed) this.saveSessions()
    return removed
  }

  /** Remove every retained session message for a document (clear/revoke). */
  private clearSessionMessagesForDocument(documentId: string): number {
    let changed = false
    let removed = 0
    for (const session of Array.from(this.sessions.values())) {
      if (session.documentId === documentId && session.messages.length > 0) {
        removed += session.messages.length
        session.messages = []
        session.updatedAt = Date.now()
        changed = true
      }
    }
    for (const sessionId of Array.from(this.ephemeralSessionMessages.keys())) {
      const session = this.sessions.get(sessionId)
      if (session?.documentId === documentId) {
        removed += this.ephemeralSessionMessages.get(sessionId)?.length ?? 0
        this.ephemeralSessionMessages.delete(sessionId)
      }
    }
    if (changed) this.saveSessions()
    return removed
  }

  listSessions(documentId?: string): AgentSession[] {
    const all = Array.from(this.sessions.values())
    return documentId ? all.filter((s) => s.documentId === documentId) : all
  }

  getProfiles(): AgentProfile[] { return [...this.profiles] }

  addProfile(profile: Omit<AgentProfile, 'id'>): AgentProfile {
    const p: AgentProfile = { ...profile, id: crypto.randomUUID().slice(0, 8) }
    this.profiles.push(p)
    return p
  }

  deleteProfile(id: string): boolean {
    const idx = this.profiles.findIndex((p) => p.id === id)
    if (idx === -1) return false
    this.profiles.splice(idx, 1)
    return true
  }

  async runMultiAgent(
    documentId: string,
    userMessage: string,
    agentNames: string[],
    context?: { documentContent?: string; currentBranch?: string; selection?: string; storyboardContent?: string }
  ): Promise<Array<{ agentName: string; content: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }>> {
    // §11 boundary 7 gate (local endpoints exempt).
    if (!this.remoteInferenceAllowed()) {
      throw new Error('Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.')
    }
    const results: Array<{ agentName: string; content: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }> = []
    const multiRun = this.runs.begin({ documentId })
    const signal = multiRun.signal

    for (const agentName of agentNames) {
      if (signal.aborted) {
        results.push({ agentName, content: 'Aborted by user', toolCalls: [] })
        continue
      }
      const session = this.getOrCreateSession(documentId, agentName)
      // Route through the retention-aware buffer so an opt-out never gets
      // flushed by the multi-agent save path (R1).
      this.addSessionMessage(session.id, 'user', userMessage)

      const systemParts = [
        session.systemPrompt,
        `Your role: ${agentName}.`
      ]
      // §12 audit: purpose-specific profile instead of an ad-hoc 4000-char
      // prefix — one budget, model-clamped, disclosed truncation.
      const runProfile = clampProfileToModel(MULTI_AGENT_PROFILE, this.config.model, this.contextBudgetOptions())
      const planned = planContext(
        {
          documentContent: context?.documentContent,
          selection: context?.selection,
          storyboardContent: context?.storyboardContent,
          scratchpad: this.scratchpad
        },
        runProfile.totalBudget,
        '\n... [truncated — request document_read for the full content]',
        runProfile.weights
      )
      if (planned.documentContent.content) {
        systemParts.push(`\nCurrent document content${planned.documentContent.truncated ? '' : ' (HTML)'}:\n${planned.documentContent.content}`)
      }
      if (context?.currentBranch) systemParts.push(`Current VCS branch: ${context.currentBranch}`)
      if (planned.selection.content) systemParts.push(`User's current selection: "${planned.selection.content}"`)
      if (planned.scratchpad.content) systemParts.push(`Your scratchpad notes:\n${planned.scratchpad.content}`)

      const toolDefs = this.listTools()
            const ollama = this.ollamaFormat
            const allMsgs = [
              { role: 'system', content: systemParts.join('\n') },
              ...this.getSessionMessages(session.id).slice(-20)
            ]
            const payload: Record<string, unknown> = ollama
              ? {
                  model: this.config.model,
                  messages: allMsgs,
                  stream: false,
                  options: { temperature: this.temperature }
                }
              : {
                  model: this.config.model,
                  messages: allMsgs,
                  tools: toolDefs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
                  tool_choice: 'auto',
                  temperature: this.temperature,
                  stream: false
                }

            try {
              const response = await this.gateway.post({
                endpoint: this.config.endpoint,
                payload,
                headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey),
                signal,
                kind: 'orchestration'
              })

              if (!response.ok) {
                results.push({ agentName, content: `Error: HTTP ${response.status}`, toolCalls: [] })
                continue
              }

              const data = await response.json()
              const content = ollama
                ? (data.message?.content || 'No response')
                : ((data as ChatCompletionResponse).choices?.[0]?.message?.content || 'No response')
              const toolCalls = ollama ? [] : ((data as ChatCompletionResponse).choices?.[0]?.message?.tool_calls || [])

        // Save to session (retention-aware)
        this.addSessionMessage(session.id, 'assistant', content)

        results.push({ agentName, content, toolCalls })
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          results.push({ agentName, content: 'Aborted by user', toolCalls: [] })
        } else {
          results.push({ agentName, content: `Error: ${(err as Error).message}`, toolCalls: [] })
        }
      }
    }

    this.runs.end(multiRun.runId)
    return results
  }

  // ─── Task Graph: state management ───

  /** Create a new task graph from an orchestrator plan */
  createTaskGraph(graphId: string, tasks: AgentTask[]): void {
    const graph = new Map<string, AgentTask>()
    for (const t of tasks) graph.set(t.id, t)
    this.taskGraphs.set(graphId, graph)
    this.activeGraphId = graphId
    this.send('agent-task-graph-created', { graphId, tasks })
  }

  /** Update a task's status and notify renderer */
  updateTaskStatus(graphId: string, taskId: string, status: TaskStatus, result?: string, error?: string): void {
    const graph = this.taskGraphs.get(graphId)
    if (!graph) return
    const task = graph.get(taskId)
    if (!task) return
    task.status = status
    if (result !== undefined) task.result = result
    if (error !== undefined) task.error = error
    if (status === 'running' && !task.startedAt) task.startedAt = Date.now()
    if (status === 'done' || status === 'error') task.completedAt = Date.now()
    this.send('agent-task-updated', { graphId, task })
  }

  /** Get all tasks in a graph as a flat list */
  getTaskGraph(graphId: string): AgentTask[] {
    const graph = this.taskGraphs.get(graphId)
    return graph ? Array.from(graph.values()) : []
  }

  /** Get tasks that are ready to run (all dependencies done) */
  getReadyTasks(graphId: string): AgentTask[] {
    const graph = this.taskGraphs.get(graphId)
    if (!graph) return []
    return Array.from(graph.values()).filter(t =>
      t.status === 'pending' &&
      t.dependencies.every(depId => {
        const dep = graph.get(depId)
        return dep && dep.status === 'done'
      })
    )
  }

  /** Cancel all pending/running tasks in a graph */
  cancelTaskGraph(graphId: string): void {
    const graph = this.taskGraphs.get(graphId)
    if (!graph) return
    for (const task of Array.from(graph.values())) {
      if (task.status === 'pending' || task.status === 'running') {
        this.updateTaskStatus(graphId, task.id, 'cancelled')
      }
    }
    this.runs.abortAll()
  }

  // ─── Task Graph: orchestration ───

  /**
   * Run orchestrated multi-agent task graph.
   * 1. Call Orchestrator LLM to decompose request into subtasks
   * 2. Parse JSON plan into AgentTask objects
   * 3. Execute tasks respecting dependencies
   * 4. Stream status updates to renderer
   */
  async orchestrate(
    documentId: string,
    userMessage: string,
    context?: { documentContent?: string; currentBranch?: string; selection?: string; currentFilePath?: string }
  ): Promise<AgentTask[]> {
    // §11 boundary 7 gate (local endpoints exempt).
    if (!this.remoteInferenceAllowed()) {
      throw new Error('Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.')
    }
    const graphId = `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.activeGraphId = graphId
    const orchestrationRun = this.runs.begin({ documentId })
    const signal = orchestrationRun.signal

    // Phase 1: Orchestrator decomposes
    const orchPrompt = this.buildOrchestratorPrompt(userMessage, context)
    let plan: Array<{ agentName: string; title: string; prompt: string; dependencies: number[] }>

    try {
      const response = await this.fetchCompletion(
        [
          { role: 'system', content: this.getProfile('Orchestrator')?.systemPrompt || '' },
          { role: 'user', content: orchPrompt }
        ],
        signal
      )
      if (signal.aborted) { this.runs.end(orchestrationRun.runId); return [] }
      plan = this.parseTaskPlan(response)
    } catch (err) {
      if ((err as Error).name === 'AbortError') { this.runs.end(orchestrationRun.runId); return [] }
      // Fallback: single writer task
      plan = [{ agentName: 'Writer', title: 'Write response', prompt: userMessage, dependencies: [] }]
    }

    // Phase 2: Create task graph
    const tasks: AgentTask[] = plan.map((p, i) => ({
      id: `${graphId}_task_${i}`,
      graphId,
      parentTaskId: null,
      agentName: p.agentName,
      agentRole: this.getRoleForAgent(p.agentName),
      title: p.title,
      prompt: p.prompt,
      status: 'pending' as TaskStatus,
      dependencies: p.dependencies.map(depIdx => `${graphId}_task_${depIdx}`)
    }))

    this.createTaskGraph(graphId, tasks)

    // Phase 3: Execute tasks (respecting dependencies)
    await this.executeTaskGraph(graphId, documentId, context, signal)

    const graphTasks = this.getTaskGraph(graphId)
    this.runs.end(orchestrationRun.runId)
    return graphTasks
  }

  private buildOrchestratorPrompt(userMessage: string, context?: { documentContent?: string; selection?: string; currentFilePath?: string; storyboardContent?: string }): string {
    // §12 audit: purpose-specific profile instead of an ad-hoc 2000-char
    // prefix — decomposition needs only enough context to split the request.
    const profile = clampProfileToModel(ORCHESTRATOR_PROFILE, this.config.model, this.contextBudgetOptions())
    const planned = planContext(
      {
        documentContent: context?.documentContent,
        selection: context?.selection,
        storyboardContent: context?.storyboardContent
      },
      profile.totalBudget,
      '\n... [truncated — subtask prompts must be self-contained]',
      profile.weights
    )
    const parts = [`User request: ${userMessage}`]
    if (planned.documentContent.content) {
      parts.push(`Current document${planned.documentContent.truncated ? ' (partial view)' : ''}: ${planned.documentContent.content}`)
    }
    if (planned.selection.content) parts.push(`Selected text: "${planned.selection.content}"`)
    if (planned.storyboardContent.content) parts.push(`Storyboard: ${planned.storyboardContent.content}`)
    parts.push('Decompose this into subtasks. Return ONLY a JSON array, no markdown fences.')
    parts.push('Each object: { "agentName": "Writer"|"Reviewer"|"Researcher", "title": "short desc", "prompt": "self-contained prompt", "dependencies": [task indices] }')
    return parts.join('\n')
  }

  private parseTaskPlan(content: string): Array<{ agentName: string; title: string; prompt: string; dependencies: number[] }> {
    // Strip markdown fences if present
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((p: any) => p.agentName && p.prompt)
        .map((p: any) => ({
          agentName: String(p.agentName),
          title: String(p.title || 'Task'),
          prompt: String(p.prompt),
          dependencies: Array.isArray(p.dependencies) ? p.dependencies.map((d: any) => Number(d)) : []
        }))
    } catch {
      // Try to extract JSON array from surrounding text
      const match = cleaned.match(/\[[\s\S]*\]/)
      if (match) {
        try {
          const parsed = JSON.parse(match[0])
          if (Array.isArray(parsed)) return parsed.filter((p: any) => p.agentName && p.prompt)
        } catch { return [] }
      }
      return []
    }
  }

  private getRoleForAgent(name: string): AgentRole {
    const profile = this.profiles.find(p => p.name === name)
    return (profile?.role as AgentRole) || 'custom'
  }

  private getProfile(name: string): AgentProfile | undefined {
    return this.profiles.find(p => p.name === name)
  }

  /** Non-streaming completion with tool support disabled (for orchestrator/subtasks) */
  private async fetchCompletion(messages: Array<{ role: string; content: string }>, signal?: AbortSignal): Promise<string> {
    // §11 boundary 7: remote inference requires consent (local endpoints exempt).
    if (!this.remoteInferenceAllowed()) {
      throw new Error('Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.')
    }
    const payload = this.buildCompletionPayload(messages, this.temperature)
    const response = await this.gateway.post({
      endpoint: this.config.endpoint,
      payload,
      headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey),
      signal,
      kind: 'completion'
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return this.parseCompletionResponse(data).content || ''
  }

  private async executeTaskGraph(
    graphId: string,
    documentId: string,
    context: { documentContent?: string; currentBranch?: string; selection?: string } | undefined,
    signal: AbortSignal
  ): Promise<void> {
    const graph = this.taskGraphs.get(graphId)
    if (!graph) return

    let safety = 0
    while (safety++ < 50) {
      if (signal.aborted) { this.cancelTaskGraph(graphId); return }

      const ready = this.getReadyTasks(graphId)
      if (ready.length === 0) {
        const anyRunning = Array.from(graph.values()).some(t => t.status === 'running')
        if (!anyRunning) break
        await new Promise(r => setTimeout(r, 100))
        continue
      }

      // Execute ready tasks in parallel
      await Promise.all(ready.map(async (task) => {
        this.updateTaskStatus(graphId, task.id, 'running')
        try {
          // Inject dependency results into the prompt
          let prompt = task.prompt
          for (const depId of task.dependencies) {
            const dep = graph.get(depId)
            if (dep?.result) {
              prompt += `\n\n--- Result from ${dep.agentName} (${dep.title}) ---\n${dep.result}`
            }
          }

          const result = await this.fetchCompletion(
            [
              { role: 'system', content: this.getProfile(task.agentName)?.systemPrompt || 'You are a helpful assistant.' },
              { role: 'user', content: prompt }
            ],
            signal
          )

          if (signal.aborted) {
            this.updateTaskStatus(graphId, task.id, 'cancelled')
          } else {
            this.updateTaskStatus(graphId, task.id, 'done', result)
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            this.updateTaskStatus(graphId, task.id, 'cancelled')
          } else {
            this.updateTaskStatus(graphId, task.id, 'error', undefined, (err as Error).message)
          }
        }
      }))
    }
  }

  /**
   * Inline autocomplete (memory.md §12 audit): already purpose-bounded — it
   * receives only the 500 characters before the cursor and never the
   * document body, so no profile machinery is needed. `documentContent` is
   * accepted for IPC-contract stability but intentionally unused.
   */
  async getInlineSuggestion(documentContent: string, cursorPosition: number, contextBefore: string): Promise<string | null> {
    void documentContent
    void cursorPosition
    // §11 boundary 7 gate (local endpoints exempt).
    if (!this.remoteInferenceAllowed()) return null
    const snippet = contextBefore.length > 500 ? contextBefore.slice(-500) : contextBefore
    try {
      const payload = this.buildCompletionPayload([
          { role: 'system', content: 'You are an autocomplete assistant for a document editor. Given the text before the cursor, suggest what comes next. Return ONLY the suggested continuation text, nothing else. Keep it concise (1-2 sentences max). Do not repeat existing text.' },
          { role: 'user', content: snippet }
        ], 0.3)
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return null
      const data = await response.json()
      const suggestion = this.parseCompletionResponse(data).content?.trim()
      return suggestion || null
    } catch {
      return null
    }
  }

  /**
   * Whole-document summarization (memory.md §7.4): coverage, not top-k.
   * The document is processed structurally in bounded batches — every
   * section is seen once, batch failures are counted and disclosed, and the
   * final pass aggregates the section summaries with source references.
   * Small documents take the original single-shot path.
   */
  async handleSummarize(documentContent: string, style: string, maxLength: number): Promise<string> {
    // §11 boundary 7 gate (local endpoints exempt).
    if (!this.remoteInferenceAllowed()) {
      throw new Error('Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.')
    }
    const styleDescriptions: Record<string, string> = {
      executive: 'Write an executive summary suitable for business stakeholders',
      abstract: 'Write an academic abstract in 150-250 words',
      tldr: 'Write a one-sentence TL;DR',
      bullets: 'Write 3-5 bullet point summary'
    }
    const styleLine = `${styleDescriptions[style] || styleDescriptions.executive}. Maximum ${maxLength} words. Return ONLY the summary.`

    // Structural text (§7.1: structure, not a regex-stripped prefix).
    const blocks = extractBlocks(documentContent)
    const chunks = chunkBlocks(blocks)
    const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0)
    const SINGLE_PASS_CHARS = 8000

    // Single-shot path for small documents — no orchestration needed.
    if (totalChars <= SINGLE_PASS_CHARS) {
      const text = renderBatch(chunks)
      try {
        const payload = this.buildCompletionPayload([
          { role: 'system', content: styleLine },
          { role: 'user', content: text }
        ], 0.3)
        const response = await this.gateway.post({
          endpoint: this.config.endpoint,
          payload,
          headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
        })
        if (!response.ok) return 'Summary generation failed.'
        const data = await response.json()
        return this.parseCompletionResponse(data).content || 'No summary generated.'
      } catch (err) {
        return `Summary failed: ${(err as Error).message}`
      }
    }

    // Bounded-batch whole-document pass (§7.4 / §C): an explicit operation
    // allowance so a huge document cannot fan out into unbounded calls.
    const MAX_BATCH_CALLS = 8
    const MAX_SUMMARY_CHARS = 120_000
    const { batches, skipped } = planBatches(chunks, 6000)
    const reviewedBatches = batches.slice(0, MAX_BATCH_CALLS)
    const unreviewedBatches = batches.length - reviewedBatches.length
    const sectionSummaries: string[] = []
    let failedBatches = 0
    let operationChars = 0

    for (const batch of reviewedBatches) {
      const text = renderBatch(batch)
      if (operationChars + text.length > MAX_SUMMARY_CHARS) break
      operationChars += text.length
      try {
        const payload = this.buildCompletionPayload([
          {
            role: 'system',
            content: 'Summarize these document sections in 2-3 sentences each, labeled by section. Return ONLY the section summaries. Be faithful to the text — do not invent content.'
          },
          { role: 'user', content: text }
        ], 0.2)
        const response = await this.gateway.post({
          endpoint: this.config.endpoint,
          payload,
          headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
        })
        if (!response.ok) {
          failedBatches++
          continue
        }
        const data = await response.json()
        const content = this.parseCompletionResponse(data).content
        if (content) sectionSummaries.push(content)
        else failedBatches++
      } catch {
        failedBatches++
        // A failed batch must not abort the pass — coverage continues.
      }
    }

    if (sectionSummaries.length === 0) {
      return 'Summary generation failed — no document section could be processed.'
    }

    // Aggregation pass with source references.
    try {
      const outline = buildOutline(blocks)
      const aggregationPayload = this.buildCompletionPayload([
        {
          role: 'system',
          content: `${styleLine}\nYou are given section summaries of a larger document, each labeled by section. Synthesize them into the final summary, citing section names where they support a point.`
        },
        {
          role: 'user',
          content: `Document outline:\n${outline || '(no headings)'}\n\nSection summaries:\n${sectionSummaries.join('\n\n')}`
        }
      ], 0.3)
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload: aggregationPayload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return 'Summary generation failed.'
      const data = await response.json()
      let summary = this.parseCompletionResponse(data).content || 'No summary generated.'
      // Label incomplete results accurately (§7.4).
      if (failedBatches > 0 || skipped > 0 || unreviewedBatches > 0) {
        const gaps: string[] = []
        if (failedBatches > 0) gaps.push(`${failedBatches} of ${reviewedBatches.length} batches failed`)
        if (skipped > 0) gaps.push(`${skipped} oversized section(s) skipped`)
        if (unreviewedBatches > 0) gaps.push(`${unreviewedBatches} of ${batches.length} sections not summarized (operation cap); summarize them separately`)
        summary += `\n\n[Partial coverage: ${gaps.join('; ')}.]`
      }
      return summary
    } catch (err) {
      return `Summary failed: ${(err as Error).message}`
    }
  }

  // v0.4.7: AI Writing Assistant methods
  async generateOutline(topic: string, depth: number = 2): Promise<Array<{ level: number; title: string; children?: any[] }>> {
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: 'Generate a document outline for the given topic. Return a JSON array of objects with "level" (1-3), "title" (string), and "children" (array). Return ONLY valid JSON, no other text.' },
          { role: 'user', content: `Generate a ${depth}-level outline for: ${topic}` }
        ],
        temperature: 0.5,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return []
      const data = await response.json()
      const content = this.parseCompletionResponse(data).content || '[]'
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } catch {
      return []
    }
  }

  async generateTitles(topic: string, count: number = 5): Promise<string[]> {
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `Generate ${count} creative, compelling titles for a document about this topic. Return ONLY a JSON array of strings, one title per element. No other text.` },
          { role: 'user', content: topic }
        ],
        temperature: 0.7,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return []
      const data = await response.json()
      const content = this.parseCompletionResponse(data).content || '[]'
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } catch {
      return []
    }
  }

  async generateIntroduction(topic: string, style: 'brief' | 'medium' | 'detailed' = 'medium'): Promise<string> {
    const styles = {
      brief: '50-75 words',
      medium: '100-150 words',
      detailed: '200-300 words'
    }
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `Write an engaging introduction for a document about the given topic. Length: ${styles[style]}. Make it compelling and set context for the reader. Return ONLY the introduction text.` },
          { role: 'user', content: topic }
        ],
        temperature: 0.7,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return ''
      const data = await response.json()
      return this.parseCompletionResponse(data).content || ''
    } catch {
      return ''
    }
  }

  async generateConclusion(docType: string, mainPoints: string[], style: 'brief' | 'medium' | 'detailed' = 'medium'): Promise<string> {
    const styles = {
      brief: '50-75 words',
      medium: '100-150 words',
      detailed: '200-300 words'
    }
    const pointsList = mainPoints.join('\n- ')
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `Write a strong conclusion for a ${docType}. Length: ${styles[style]}. Summarize the key points and leave a lasting impression. Return ONLY the conclusion text.` },
          { role: 'user', content: `Main points to conclude on:\n- ${pointsList}` }
        ],
        temperature: 0.7,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return ''
      const data = await response.json()
      return this.parseCompletionResponse(data).content || ''
    } catch {
      return ''
    }
  }

  async adjustTone(text: string, targetTone: 'formal' | 'casual' | 'professional'): Promise<string> {
    const toneDescriptions = {
      formal: 'formal, academic, serious tone with sophisticated vocabulary',
      casual: 'casual, friendly, conversational tone with simple language',
      professional: 'professional, business-appropriate tone with clear language'
    }
    const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `Rewrite the provided text in a ${toneDescriptions[targetTone]}. Maintain the original meaning and content. Return ONLY the rewritten text.` },
          { role: 'user', content: cleanText }
        ],
        temperature: 0.6,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return text
      const data = await response.json()
      return this.parseCompletionResponse(data).content || text
    } catch {
      return text
    }
  }

  async paraphraseSuggestions(text: string, count: number = 3): Promise<string[]> {
    const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `Generate ${count} different paraphrases of the given text. Each should preserve the meaning but use different wording. Return ONLY a JSON array of strings.` },
          { role: 'user', content: cleanText }
        ],
        temperature: 0.8,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return [text]
      const data = await response.json()
      const content = this.parseCompletionResponse(data).content || '[]'
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : [text]
    } catch {
      return [text]
    }
  }

  async adjustComplexity(text: string, level: 'simple' | 'moderate' | 'advanced'): Promise<string> {
    const levelDescriptions = {
      simple: 'simple, easy-to-understand language suitable for a general audience',
      moderate: 'moderately complex language suitable for educated readers',
      advanced: 'advanced, sophisticated language suitable for subject matter experts'
    }
    const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `Rewrite the text to match a ${levelDescriptions[level]}. Adjust vocabulary and sentence structure accordingly. Return ONLY the rewritten text.` },
          { role: 'user', content: cleanText }
        ],
        temperature: 0.6,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return text
      const data = await response.json()
      return this.parseCompletionResponse(data).content || text
    } catch {
      return text
    }
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `Translate the given text to ${targetLanguage}. Maintain the tone and meaning. Return ONLY the translated text.` },
          { role: 'user', content: cleanText }
        ],
        temperature: 0.3,
        stream: false
      }
      const response = await this.gateway.post({
        endpoint: this.config.endpoint,
        payload,
        headers: buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey)
      })
      if (!response.ok) return text
      const data = await response.json()
      return this.parseCompletionResponse(data).content || text
    } catch {
      return text
    }
  }

  registerTool(definition: ToolDefinition, handler: (args: Record<string, unknown>) => Promise<ToolExecutionResult>): void {
    this.tools.set(definition.name, { definition, handler })
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { error: `Tool '${name}' not found. Available: ${Array.from(this.tools.keys()).join(', ')}` }
    }

    // Check permissions
    const category = this.getPermissionCategory(name)
    if (category && !this.permissions[category]) {
      // Need user approval
      if (!this.mainWindow) {
        return { error: `Tool '${name}' requires approval but no window is available to ask.` }
      }

      // Bind the pending approval to the active run (or a short-lived one for
      // an out-of-band tool call) so overlapping runs don't cross approvals.
      const existingRunId = this.runs.activeRunId()
      const approvalRunId = existingRunId ?? this.runs.begin({ documentId: 'tool-approval' }).runId
      try {
        const approved = await new Promise<boolean>((resolve) => {
          this.runs.setPendingApproval(approvalRunId, { resolve, toolName: name, args })
          this.mainWindow!.webContents.send('agent:tool-approval-request', { toolName: name, args, category })
        })

        if (!approved) {
          return { error: `Tool '${name}' was rejected by the user.` }
        }
      } finally {
        if (!existingRunId) this.runs.end(approvalRunId)
      }
    }

    try {
      return await tool.handler(args)
    } catch (err) {
      return { error: `Tool execution failed: ${(err as Error).message}` }
    }
  }

  configure(config: Partial<AgentConfig>): AgentConfig {
    const sanitizedConfig = removeUndefinedValues(config)
    const previousModel = this.config.model
    this.config = { ...this.config, ...sanitizedConfig }

    // A new model invalidates a window detected for the previous one: clear
    // derived fields unless the caller supplied them explicitly in this call.
    const modelChanged = Boolean(sanitizedConfig.model) && sanitizedConfig.model !== previousModel
    if (modelChanged) {
      if (!('modelContextWindow' in sanitizedConfig)) this.config.modelContextWindow = undefined
      if (!('modelOutputReserve' in sanitizedConfig)) this.config.modelOutputReserve = undefined
      if (!('modelTokenizer' in sanitizedConfig)) this.config.modelTokenizer = undefined
    }

    const providerId = this.config.providerId
    if (providerId && Object.prototype.hasOwnProperty.call(sanitizedConfig, 'apiKey')) {
      if (this.config.apiKey) this.providerApiKeys[providerId] = this.config.apiKey
      else delete this.providerApiKeys[providerId]
    } else if (providerId && this.providerApiKeys[providerId] !== undefined) {
      this.config.apiKey = this.providerApiKeys[providerId]
    } else if (providerId && Object.prototype.hasOwnProperty.call(sanitizedConfig, 'providerId')) {
      this.config.apiKey = ''
    }

    // If endpoint is not set but we have a providerId, build it
    if (!this.config.endpoint && (this.config as any).providerId) {
      const provider = getProvider((this.config as any).providerId)
      if (provider) {
        this.config.endpoint = buildChatEndpoint(provider, provider.baseUrl, this.config.model, this.ollamaFormat)
      }
    }

    // Auto-wire the model's context window when the caller did not supply one
    // (memory.md §8.4): prefer bundled provider metadata, then the known
    // per-model table. Unknown models keep the name heuristic (no value).
    if (this.config.modelContextWindow === undefined) {
      const model = this.getModel('smart')
      const provider = this.config.providerId ? getProvider(this.config.providerId) : undefined
      const catalogWindow = provider?.hardcodedModels?.find((m) => m.id === model)?.contextWindow
      if (catalogWindow) {
        this.config.modelContextWindow = catalogWindow
      } else {
        const limits = resolveModelLimits(model)
        if (limits.source === 'known') {
          this.config.modelContextWindow = limits.contextWindow
          if (this.config.modelOutputReserve === undefined) {
            this.config.modelOutputReserve = limits.outputReserve
          }
          if (this.config.modelTokenizer === undefined) {
            this.config.modelTokenizer = limits.tokenizer
          }
        }
      }
    }

    this.saveConfig()
    return this.config
  }

  getProviderApiKey(providerId: string): string {
    return this.providerApiKeys[providerId] || ''
  }

  configureAdvanced(opts: { maxToolTurns?: number; temperature?: number; ollamaFormat?: boolean }): void {
    if (opts.maxToolTurns !== undefined) this.maxToolTurns = opts.maxToolTurns
    if (opts.temperature !== undefined) this.temperature = opts.temperature
    if (opts.ollamaFormat !== undefined) this.ollamaFormat = opts.ollamaFormat
  }

  getMaxToolTurns(): number { return this.maxToolTurns }
  getTemperature(): number { return this.temperature }

  getConfig(): AgentConfig {
      return { ...this.config }
    }

    /** Select the right model based on task type */
    getModel(task?: 'fast' | 'smart'): string {
      if (task === 'fast' && this.config.fastModel) return this.config.fastModel
      if (task === 'smart' && this.config.smartModel) return this.config.smartModel
      return this.config.model
    }

  /**
   * Context budget options (memory.md §8.4): when the user configured a model
   * context window, it drives the context-part character budget instead of the
   * inherited 24k default; otherwise the name heuristic applies.
   */
  private contextBudgetOptions(): ContextBudgetOptions {
    return {
      contextWindow: this.config.modelContextWindow,
      outputReserve: this.config.modelOutputReserve
    }
  }

  getAcpManifest(): { name: string; version: string; description: string; capabilities: { tools: ToolDefinition[] }; protocol: string } {
    return {
      name: 'wordapp',
      version: '0.2.2',
      description: 'Lexicon DOCX Editor with version control',
      capabilities: {
        tools: this.listTools().map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      },
      protocol: 'acp-1.0'
    }
  }

  private send(channel: string, data: Record<string, unknown> | string | null): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * Grammar/style/structure review (memory.md §12 audit + §7.4): coverage,
   * not a 6000-char prefix. The document is processed structurally in bounded
   * batches (capped so a huge document can't fan out into dozens of review
   * calls); the result is labeled with actual coverage, and skipped sections
   * are disclosed rather than silently unaudited.
   */
  async suggestImprovements(documentContent: string): Promise<Array<{ type: string; message: string; context: string }>> {
    // §11 boundary 7 gate (local endpoints exempt).
    if (!this.remoteInferenceAllowed()) return []
    const REVIEW_SYSTEM = `You are a document editor assistant. Analyze the following document sections and suggest improvements.
Return a JSON array of suggestions. Each suggestion must have:
- "type": one of "grammar", "style", "structure"
- "message": a brief description of the suggestion
- "context": a short quote from the section that the suggestion applies to

Return ONLY the JSON array, no other text. If no improvements needed, return an empty array [].`
    const MAX_REVIEW_BATCHES = 6
    const BATCH_CHARS = 6000

    // Structural text, not a regex-stripped prefix (§7.1).
    const chunks = chunkBlocks(extractBlocks(documentContent))
    const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0)

    const reviewOne = async (text: string): Promise<Array<{ type: string; message: string; context: string }>> => {
      try {
        const payload = this.buildCompletionPayload([
          { role: 'system', content: REVIEW_SYSTEM },
          { role: 'user', content: text }
        ], 0.3)
        const response = await this.gateway.post({
          endpoint: this.config.endpoint,
          payload,
          headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
          kind: 'review'
        })
        if (!response.ok) return []
        const data = await response.json()
        const content = this.parseCompletionResponse(data).content || '[]'
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (!jsonMatch) return []
        const parsed = JSON.parse(jsonMatch[0])
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return [] // a failed batch must not abort the review pass
      }
    }

    // Small document: single-shot over the structured text.
    if (totalChars <= BATCH_CHARS) {
      return reviewOne(renderBatch(chunks))
    }

    // Bounded-batch coverage with explicit labeling (§7.4).
    const { batches, skipped } = planBatches(chunks, BATCH_CHARS)
    const reviewed = batches.slice(0, MAX_REVIEW_BATCHES)
    const suggestions: Array<{ type: string; message: string; context: string }> = []
    for (const batch of reviewed) {
      suggestions.push(...(await reviewOne(renderBatch(batch))))
    }
    const unreviewedBatches = batches.length - reviewed.length
    if (unreviewedBatches > 0 || skipped > 0) {
      const gaps: string[] = []
      if (unreviewedBatches > 0) gaps.push(`${unreviewedBatches} of ${batches.length} sections not reviewed (review cap)`)
      if (skipped > 0) gaps.push(`${skipped} oversized section(s) skipped`)
      suggestions.push({
        type: 'structure',
        message: `[Partial review — ${gaps.join('; ')}. Review the remaining sections separately.]`,
        context: ''
      })
    }
    return suggestions
  }

  /** Build a non-streaming chat completion payload in OpenAI or Ollama format */
  private buildCompletionPayload(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    tools?: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>
  ): Record<string, unknown> {
    if (this.ollamaFormat) {
      return {
        model: this.config.model,
        messages,
        stream: false,
        options: { temperature }
      }
    }
    const payload: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature,
      stream: false
    }
    if (tools && tools.length > 0) {
      payload.tools = tools
      payload.tool_choice = 'auto'
    }
    return payload
  }

  /** Parse a non-streaming chat completion response from OpenAI or Ollama format */
  private parseCompletionResponse(data: Record<string, unknown>): { content: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> } {
    if (this.ollamaFormat) {
      return {
        content: (data.message as any)?.content || '',
        toolCalls: []
      }
    }
    const choice = (data as any).choices?.[0]
    return {
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls || []
    }
  }

  getMemoryForDocument(documentId: string): AgentMemoryEntry[] { return this.memory.getForDocument(documentId) }

  /**
   * Commit write-behind memory mutations (§A). No-op for the in-process store;
   * on a worker-backed store this keeps the single writer caught up without
   * blocking the sync read path. Errors are logged (async wrappers surface
   * them explicitly instead).
   */
  private flushMemory(): void {
    void this.memory.flush().catch((err) => console.warn('[AgentBridge] memory flush failed:', err))
    void this.flushSessions().catch((err) => console.warn('[AgentBridge] session flush failed:', err))
    void this.control.flush().catch((err) => console.warn('[AgentBridge] control flush failed:', err))
  }

  /**
   * Swap the in-process memory/session/control stores for a worker-backed
   * single writer (§A). Call once during startup before memory is used;
   * mutations are write-behind and committed by `flushMemoryWrites()`.
   */
  async useWorkerMemoryLedger(input: { dbPath: string; workerPath: string; store?: AgentMemoryStore }): Promise<void> {
    const store = input.store ?? (await createWorkerBackedStore(input)).store
    store.setJsonMirror(this.config.memoryJsonMirror !== false)
    this.memory = store
    const driver = store.getDriver()
    this.sessionDriver = driver

    // Control state shares the worker driver (one writer, one database).
    this.control = new ControlStore(driver)
    await this.control.init()
    this.deletions = new DeletionCoordinator(this.control)
    this.documentPolicy = new DocumentPolicy(this.control)
    this.projections = new ProjectionCoordinator(
      this.control,
      path.join(app.getPath('userData'), 'mnesis', 'generations')
    )

    await this.loadSessionsFromDriver()
  }

  /** Terminate the worker-backed ledger writer (app shutdown). */
  async disposeWorkerLedger(): Promise<void> {
    if (!this.sessionDriver) return
    const driver = this.sessionDriver
    this.sessionDriver = null
    try { await driver.close() } catch { /* already gone */ }
  }

  /**
   * Lazily start the Mnesis conversation-context sidecar (memory.md Phase 1).
   * Returns null when disabled, already failed, or not yet ready — callers
   * must treat null as "no-op" (kill switch, mnesis-phase0-spike.md §Verdict).
   */
  private async getReadyMnesis(): Promise<MnesisWorkerClient | null> {
    // §11 consent gates: boundary 1 (retaining chat history) and boundary 4
    // (background summarization). The sidecar is both a history projection
    // and the compaction engine — either boundary off means no sidecar.
    if (!this.consent.retainLocalChatHistory || !this.consent.backgroundSummarization) return null
    if (!this.config.mnesisEnabled) return null
    if (!this.mnesis) {
      // Dev builds run from the repo; packaged builds use extraResources
      // (outside asar — Python cannot read asar) and prefer a bundled
      // embeddable runtime when one ships (memory.md §13 packaging).
      const paths = resolveMnesisPaths({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
        configPythonPath: this.config.mnesisPythonPath,
        platform: process.platform,
        exists: (p) => fs.existsSync(p)
      })
      if (paths.runtimeBundled) {
        console.log('[AgentBridge] Using bundled Mnesis runtime:', paths.pythonPath)
      }
      // §H: explicit availability gate. Unsupported platforms and packaged
      // builds without a bundled runtime are disabled with a reason — never a
      // silent fallback to an arbitrary system Python.
      const availability = memoryEngineAvailability({
        platform: process.platform,
        isPackaged: app.isPackaged,
        runtimeBundled: paths.runtimeBundled,
        configPythonPath: this.config.mnesisPythonPath
      })
      if (!availability.available) {
        this.memoryUnavailableReason = availability.detail
        console.warn('[AgentBridge] Memory engine unavailable:', availability.reason)
        return null
      }
      this.memoryUnavailableReason = null
      const dbPath = path.join(app.getPath('userData'), 'mnesis', 'sessions.db')
      this.mnesis = new MnesisWorkerClient({
        pythonPath: paths.pythonPath,
        workerPath: paths.workerPath,
        dbPath,
        model: this.config.model || 'openai/gpt-4o',
        onStderr: (line) => console.warn('[Mnesis]', line)
      })
      // §E: install the TS summarization hook so compaction is available even
      // without upstream support. Requires a configured endpoint.
      if (this.config.endpoint && typeof this.mnesis.setSummarizer === 'function') {
        this.mnesis.setSummarizer(async (transcript) => {
          const text = transcript.map((m) => `${m.role}: ${m.content}`).join('\n')
          return await this.fetchCompletion([
            { role: 'system', content: 'Summarize the earlier conversation concisely. Preserve decisions, facts, user preferences, and open threads; omit pleasantries.' },
            { role: 'user', content: text }
          ])
        })
      }
    }
    if (!this.mnesisStartPromise) {
      this.mnesisStartPromise = this.mnesis.start()
    }
    const ok = await this.mnesisStartPromise
    if (!ok) {
      console.warn('[AgentBridge] Mnesis worker unavailable:', this.mnesis.error)
      return null
    }
    return this.mnesis.running ? this.mnesis : null
  }

  /**
   * Record a completed conversation turn to the Mnesis sidecar (BYO-LLM
   * `record()` — persistence + compaction accounting, no LLM call).
   * Fire-and-forget: failures are logged, never surfaced to the chat.
   */
  private recordTurn(
    documentId: string,
    userMessage: string,
    assistantResponse: string,
    opts: { protected?: boolean; projectionKey?: string | null } = {}
  ): void {
    if (assistantResponse.trim().length === 0) return
    // §11/§B: protected or revoked documents never persist turns to the sidecar.
    // Use the captured per-run value, not shared mutable state (R5).
    if (opts.protected || this.currentDocumentProtected()) return
    if (this.documentPolicy.isProtected(documentId) || this.documentPolicy.isRevoked(documentId)) return
    // Retaining local chat history is the precondition for any projection.
    if (!this.consent.retainLocalChatHistory) return
    // Key the projection by session identity so independent profiles do not
    // share one document-wide transcript (R12).
    const key = opts.projectionKey || documentId
    // §A: commit the retained turn as canonical ledger events first. This is
    // authoritative and survives a down/missing sidecar; the projection-outbox
    // row is written in the same transaction.
    let committedEventIds: string[] = []
    try {
      const committed = this.memory.commitRetainedTurn(documentId, key, userMessage, assistantResponse)
      committedEventIds = [committed.userEventId, committed.assistantEventId].filter((id): id is string => !!id)
    } catch (err) {
      console.warn('[AgentBridge] Retained turn commit failed:', (err as Error).message)
    }
    this.getReadyMnesis()
      .then(async (client) => {
        if (!client) return null
        // Generation-scoped database for this document (§E): each generation
        // owns its own file, so it can be disposed by removing the file.
        const dbPath = this.projectionDbPath(documentId, key)
        // Prefer the receipt-bearing call; fall back for a client/worker that
        // does not expose it (keeps older transports and test doubles working).
        const receipt = typeof client.recordWithReceipt === 'function'
          ? await client.recordWithReceipt(key, userMessage, assistantResponse, dbPath)
          : ((await client.record(key, userMessage, assistantResponse, dbPath)) as unknown as {
              sessionId?: string
            })
        // Persist the real Mnesis session id against the generation (§E) so a
        // restart can resume exactly this session instead of creating a new one.
        if (receipt?.sessionId) {
          try {
            this.rememberProjectionSession(documentId, key, receipt.sessionId)
          } catch (err) {
            console.warn('[AgentBridge] Generation record failed:', (err as Error).message)
          }
        }
        // Projection confirmed: clear the matching outbox items (§A).
        if (committedEventIds.length > 0) {
          try {
            const ids = this.memory
              .pendingProjectionOutbox()
              .filter((item) => committedEventIds.includes(item.eventId))
              .map((item) => item.id)
            if (ids.length > 0) this.memory.markProjectionOutboxProcessed(ids)
          } catch (err) {
            console.warn('[AgentBridge] Outbox update failed:', (err as Error).message)
          }
        }
        return receipt
      })
      .catch((err) => {
        if (isUncertainRecordFailure(err)) {
          // §E: a timeout means the outcome is unknown — never blindly repeat
          // `record` into the same generation. Fence it so the next request
          // disposes and rebuilds from the filtered transcript.
          this.pendingProjectionDisposal.set(documentId, 'rebuild')
          console.warn('[AgentBridge] Mnesis record outcome uncertain (timeout) — generation fenced for rebuild')
          return
        }
        console.warn('[AgentBridge] Mnesis record failed:', (err as Error).message)
      })
  }

  /** Database path for a projection key's active generation, if any. */
  private projectionDbPath(documentId: string, sessionKey?: string): string | undefined {
    try {
      const generation = this.projections.ensureDocumentGeneration(documentId, sessionKey)
      return this.projections.generationDbPath(generation.generationId)
    } catch (err) {
      console.warn('[AgentBridge] Projection generation unavailable:', (err as Error).message)
      return undefined
    }
  }

  private rememberProjectionSession(documentId: string, sessionKey: string, mnesisSessionId: string): void {
    const generation = this.projections.ensureDocumentGeneration(documentId, sessionKey)
    this.projections.recordMnesisSession(generation.generationId, mnesisSessionId)
  }

  /**
   * Conversation messages for the next model request (memory.md §9, Phase 4):
   * when the Mnesis sidecar is enabled and healthy, its compacted curated
   * history replaces the raw transcript for prior turns and the current user
   * request is appended exactly once. Any failure falls back to the raw
   * messages — the feature must never block a chat. The returned source
   * ('curated' | 'raw') feeds the context inspector (§10.3).
   */
  private async buildConversationMessages(
    documentId: string,
    messages: Array<{ role: string; content: string }>,
    opts: { protected?: boolean; projectionKey?: string | null } = {}
  ): Promise<{ messages: Array<{ role: string; content: string }>; source: 'curated' | 'raw'; fallback?: string }> {
    const protectedRun = !!opts.protected
    if (protectedRun) {
      // §11 ephemeral mode: never read from or write to the durable sidecar.
      // Condensation is in-memory and transient, which is allowed.
      const condensed = condenseConversation(messages)
      return { messages: condensed.messages, source: 'raw', fallback: 'protected-document-ephemeral' }
    }
    const client = await this.getReadyMnesis()
    // R10/R14: a deletion that ran while the sidecar was unavailable leaves a
    // pending disposal. Do it before any curated read so a revoked/forgotten
    // generation can never be served as a fallback.
    const pending = this.pendingProjectionDisposal.get(documentId)
    if (pending) {
      const handled =
        pending === 'dispose'
          ? await this.disposeProjectionOnly(documentId)
          : (await this.disposeAndRebuildProjection(documentId)).disposed
      if (handled) this.pendingProjectionDisposal.delete(documentId)
    }
    if (!client) {
      // No sidecar: condense very long raw transcripts ourselves so context
      // stays bounded (§7.2 item 6 — session recap + recent episodes).
      const condensed = condenseConversation(messages)
      const fallbacks = [
        this.config.mnesisEnabled ? 'mnesis-worker-unavailable' : undefined,
        condensed.condensed ? 'session-condensed' : undefined
      ].filter(Boolean).join(', ') || undefined
      return { messages: condensed.messages, source: 'raw', fallback: fallbacks }
    }
    try {
      // Session-scoped projection key (R12): Reviewer does not inherit the
      // Writer session's document-wide transcript.
      const key = opts.projectionKey || documentId
      const curated = await client.messages(key, this.projectionDbPath(documentId, key))
      const selected = selectConversationMessages(curated, messages)
      // The helper passes the local transcript through when the worker is
      // behind — surface that as a fallback rather than claiming curated.
      const usedCurated = selected !== messages
      if (usedCurated) {
        return { messages: selected, source: 'curated' }
      }
      // Worker behind: condense the raw transcript (same as no-sidecar).
      const condensed = condenseConversation(selected)
      return {
        messages: condensed.messages,
        source: 'raw',
        fallback: condensed.condensed ? 'mnesis-history-stale, session-condensed' : 'mnesis-history-stale'
      }
    } catch (err) {
      console.warn('[AgentBridge] Mnesis curated history unavailable, using raw transcript:', (err as Error).message)
      const condensed = condenseConversation(messages)
      return {
        messages: condensed.messages,
        source: 'raw',
        fallback: condensed.condensed ? 'mnesis-request-failed, session-condensed' : 'mnesis-request-failed'
      }
    }
  }

  /**
   * Document context for a request (memory.md §7): when the document fits
   * its share of the context budget, send it whole as before. When it does
   * not, index its structure and send the query-relevant sections with an
   * explicit partial-retrieval disclosure instead of a blind prefix
   * truncation (§7.1: "index document structure, not a prefix").
   */
  private resolveDocumentContext(
    documentId: string,
    documentContent: string | undefined,
    query: string,
    documentAllowance: number,
    ephemeral: boolean = false
  ): { content: string; partial: boolean } {
    if (!documentContent) return { content: '', partial: false }
    // The caller allocates the document slot from the model profile's weight;
    // no hardcoded fraction lives here.
    const allowance = Math.max(0, Math.floor(documentAllowance))
    if (documentContent.length <= allowance) return { content: documentContent, partial: false }
    if (ephemeral) {
      // §11 protected documents: retrieval must not leave durable state —
      // chunk transiently, never cache in the cross-run DocumentIndex.
      const chunks = chunkBlocks(extractBlocks(documentContent))
      const scored = rankChunks(query, chunks, { k: 5, perSectionCap: 2 })
      if (scored.length === 0) return { content: documentContent, partial: false }
      return { content: formatRetrieval(scored, chunks.length), partial: true }
    }
    const indexed = this.docIndex.update(documentId, documentContent)
    const scored = this.docIndex.search(documentId, query, { k: 5, perSectionCap: 2 })
    if (scored.length === 0) {
      // No section matched the request — fall back to the planner's own
      // truncation rather than sending nothing.
      return { content: documentContent, partial: false }
    }
    return { content: formatRetrieval(scored, indexed.chunks.length), partial: true }
  }

  /**
   * Context inspector ledger (memory.md §10.3): the last few runs' context
   * accounting — budget usage, per-part truncation, history source, and
   * degraded-fallback disclosures. Counts and source IDs only, never another
   * copy of the assembled prompt.
   */
  private contextReports: ContextRunReport[] = []

  private recordContextReport(
    planned: PlannedContext,
    documentId: string | null,
    history: { source: 'curated' | 'raw'; turns: number },
    fallbacks: Array<string | undefined>,
    budgetChars: number = DEFAULT_CONTEXT_CHAR_BUDGET,
    finalChars?: number
  ): void {
    const endpoint = this.config.endpoint || ''
    const local = this.ollamaFormat || /localhost|127\.0\.0\.1/i.test(endpoint)
    const report = contextReportFromPlanned(planned, {
      documentId,
      model: this.config.model,
      providerId: this.config.providerId || '',
      local,
      budgetChars,
      history,
      fallbacks
    })
    // Report accounting from the final accepted request (R16), not planContext
    // alone: the whole serialized body is what actually occupies the window.
    if (typeof finalChars === 'number') {
      report.totalChars = finalChars
      report.estimatedInputTokens = Math.ceil(finalChars / 4)
    }
    this.contextReports.unshift(report)
    if (this.contextReports.length > 10) this.contextReports.length = 10
  }

  /** IPC: recent context-run reports, newest first (memory.md §10.3) */
  contextRunReports(): ContextRunReport[] {
    return this.contextReports
  }

  /** Toggle the Mnesis sidecar (disabled by default). Persists to config. */
  async setMnesisEnabled(enabled: boolean): Promise<void> {
    if (this.config.mnesisEnabled === enabled) return
    this.config.mnesisEnabled = enabled
    this.saveConfig()
    if (!enabled) {
      this.mnesis?.stop()
      this.mnesis = null
      this.mnesisStartPromise = null
    }
  }

  /** Worker status for the Memory panel toggle. */
  mnesisStatus(): { enabled: boolean; running: boolean; error: string | null; compaction: 'available' | 'unavailable'; legacyStorePresent: boolean } {
    return {
      enabled: !!this.config.mnesisEnabled,
      running: this.mnesis?.running ?? false,
      error: this.mnesis?.error ?? null,
      // §E: available when upstream supports it or the TS summarization hook
      // is installed.
      compaction: this.mnesis?.compactionAvailable ? 'available' : 'unavailable',
      // §D: report the superseded shared store so the UI can offer an explicit,
      // user-confirmed cleanup. Detection only — never auto-removed.
      legacyStorePresent: fs.existsSync(legacyMnesisDbPath(app.getPath('userData')))
    }
  }

  /**
   * §D: retire the superseded shared Mnesis store. Explicit and confirm-gated —
   * refuses to run without `confirm`, and only removes the store plus its
   * SQLite sidecars (confined to the `mnesis` directory).
   */
  retireLegacyMnesisStore(confirm: boolean): { removed: string[] } {
    if (confirm !== true) throw new MemoryError('invalid-input', 'Legacy Mnesis store removal requires explicit confirmation')
    const dbPath = legacyMnesisDbPath(app.getPath('userData'))
    const { removed } = removeLegacyMnesisStore(dbPath)
    return { removed }
  }

  /**
   * §D: plan legacy shared-store retirement by listing its sessions and
   * classifying them as attributable (owner is a known document) or anonymous
   * (never guessed). Read-only; requires the sidecar to be available.
   */
  async planLegacyMnesisRetirement(): Promise<{
    available: boolean
    present: boolean
    attributable: LegacyMnesisSession[]
    anonymous: LegacyMnesisSession[]
  }> {
    const dbPath = legacyMnesisDbPath(app.getPath('userData'))
    if (!fs.existsSync(dbPath)) return { available: true, present: false, attributable: [], anonymous: [] }
    const client = await this.getReadyMnesis()
    if (!client) return { available: false, present: true, attributable: [], anonymous: [] }
    const known = new Set<string>(this.control.documentIds())
    for (const event of this.memory.allHistoricalEvents()) known.add(event.documentId)
    const sessions = await client.sessions(dbPath)
    return { available: true, present: true, ...classifyLegacySessions(sessions, known) }
  }

  /**
   * §D: import attributable legacy-store history into the authoritative ledger.
   * Explicit and confirm-gated. Deterministic event ids make re-runs idempotent;
   * anonymous sessions are never imported (they require review). Does not remove
   * the legacy store — that is the separate gated retirement action.
   */
  async migrateLegacyMnesisSessions(confirm: boolean): Promise<{ available: boolean; migratedSessions: number; importedEvents: number }> {
    if (confirm !== true) throw new MemoryError('invalid-input', 'Legacy Mnesis migration requires explicit confirmation')
    const dbPath = legacyMnesisDbPath(app.getPath('userData'))
    if (!fs.existsSync(dbPath)) return { available: true, migratedSessions: 0, importedEvents: 0 }
    const client = await this.getReadyMnesis()
    if (!client) return { available: false, migratedSessions: 0, importedEvents: 0 }
    const known = new Set<string>(this.control.documentIds())
    for (const event of this.memory.allHistoricalEvents()) known.add(event.documentId)
    const sessions = await client.sessions(dbPath)
    const { attributable } = classifyLegacySessions(sessions, known)
    let migratedSessions = 0
    let importedEvents = 0
    for (const session of attributable) {
      if (!session.agent) continue
      const messages = await client.messages(session.agent, dbPath)
      if (messages.length === 0) continue
      const events = legacyMessagesToEvents(session.agent, session.sessionId, messages)
      const added = this.memory.importHistoricalEvents(events)
      if (added > 0) migratedSessions++
      importedEvents += added
    }
    if (importedEvents > 0) await this.memory.flush()
    return { available: true, migratedSessions, importedEvents }
  }

  /**
   * §D: purge **anonymous** legacy sessions (owner cannot be attributed). The
   * caller names the sessions from a fresh classification — never a whole-store
   * purge by omission, never attributable history. Confirm-gated.
   */
  async purgeLegacyAnonymousSessions(confirm: boolean): Promise<{ available: boolean; purgedSessions: number; purgedMessages: number }> {
    if (confirm !== true) throw new MemoryError('invalid-input', 'Legacy anonymous purge requires explicit confirmation')
    const dbPath = legacyMnesisDbPath(app.getPath('userData'))
    if (!fs.existsSync(dbPath)) return { available: true, purgedSessions: 0, purgedMessages: 0 }
    const client = await this.getReadyMnesis()
    if (!client) return { available: false, purgedSessions: 0, purgedMessages: 0 }
    const known = new Set<string>(this.control.documentIds())
    for (const event of this.memory.allHistoricalEvents()) known.add(event.documentId)
    const sessions = await client.sessions(dbPath)
    const { anonymous } = classifyLegacySessions(sessions, known)
    if (anonymous.length === 0) return { available: true, purgedSessions: 0, purgedMessages: 0 }
    const result = await client.purge(anonymous.map((s) => s.sessionId), dbPath)
    return { available: true, purgedSessions: result.sessionsDeleted, purgedMessages: result.messagesDeleted }
  }

  /**
   * Honest memory-engine status (§F): distinguishes disabled-by-user,
   * blocked-by-consent, unavailable runtime, pending maintenance, rebuilding,
   * ready and failed. An enabled toggle is not a running worker.
   */
  memoryStatus(): MemoryStatus {
    return deriveMemoryStatus({
      mnesisEnabled: !!this.config.mnesisEnabled,
      retainLocalChatHistory: this.consent.retainLocalChatHistory,
      backgroundSummarization: this.consent.backgroundSummarization,
      running: this.mnesis?.running ?? false,
      startFailed: !!this.mnesis?.error,
      error: this.mnesis?.error ?? null,
      pendingDeletions: this.deletions.pendingJobs().length,
      rebuilding: this.rebuilding,
      unavailableReason: this.memoryUnavailableReason
    })
  }

  /** Current memory retention policy (memory.md §11). Defaults to keep forever. */
  getMemoryPolicy(): MemoryRetentionPolicy {
    return this.config.memoryRetention ?? { rejectedDays: null, candidateDays: null }
  }

  /**
   * Set the retention policy, persist it, and apply it immediately so an
   * expiry decision takes effect without waiting for the next start.
   */
  setMemoryPolicy(policy: MemoryRetentionPolicy): { removedRejected: number; removedCandidates: number } {
    this.config.memoryRetention = policy
    this.saveConfig()
    return this.applyMemoryRetention()
  }

  private applyMemoryRetention(): { removedRejected: number; removedCandidates: number } {
    const policy = this.config.memoryRetention
    if (!policy) return { removedRejected: 0, removedCandidates: 0 }
    const result = this.memory.applyRetention(Date.now(), policy)
    if (result.removedRejected + result.removedCandidates > 0) {
      this.flushMemory()
      console.log(
        `[AgentBridge] Retention applied: ${result.removedRejected} archived entries, ` +
        `${result.removedCandidates} stale candidates removed`
      )
    }
    return result
  }

  /** Stop the sidecar (app shutdown). */
  stopMnesis(): void {
    this.mnesis?.stop()
    this.mnesis = null
    this.mnesisStartPromise = null
  }

  deleteMemory(id: string): void { this.memory.delete(id); this.flushMemory() }

  /**
   * Clear all retained state for a document (R9): ledger entries, retained
   * session transcripts, imported historical events, and the sidecar
   * projection. Deletion is dispose-only — no rebuild from residual evidence.
   */
  clearMemoryForDocument(documentId: string): void {
    const operationId = this.deletions.begin('clear-document', documentId)
    const removed = emptyArtifactCounts()
    try {
      removed.entries = this.memory.getForDocument(documentId).length
      this.memory.clearForDocument(documentId)
      removed.sessions = this.clearSessionMessagesForDocument(documentId)
      removed.events = this.memory.removeHistoricalEvents(documentId)
      removed.suppressions = this.memory.suppressionsFor(documentId).length
      // §D: compact the active file so removed plaintext does not remain in
      // free pages (best-effort; a locked file leaves cleanup pending).
      try { this.memory.compact() } catch { /* pending maintenance */ }
      this.flushMemory()
      // §F: invalidate in-flight consolidation against the old epoch.
      try { this.documentPolicy.bumpEpoch(documentId) } catch { /* best-effort */ }
      this.runningConsolidations.delete(documentId)
    } catch (err) {
      this.deletions.failed(operationId, (err as Error).message)
      throw err
    }
    this.pendingProjectionDisposal.set(documentId, 'dispose')
    void this.disposeProjectionOnly(documentId).then((disposed) => {
      if (disposed) {
        this.pendingProjectionDisposal.delete(documentId)
        this.deletions.complete(operationId, { ...removed, projections: 1 })
      } else {
        this.deletions.pending(operationId, ['projection'], removed)
      }
    })
  }

  /**
   * Forget a memory entry (memory.md §11 deletion flow, "prove before
   * release"). The full chain:
   * 1. Ledger: the entry and everything derived from it are removed, and
   *    shingle-hash suppressions are recorded so automatic extraction cannot
   *    re-derive them (explicit user saves remain the opt-back-in).
   * 2. Raw evidence: retained session transcripts and imported historical
   *    events that re-derive the forgotten content are purged (R7).
   * 3. Projection: the document's Mnesis session set is disposed wholesale
   *    and rebuilt from the transcript filtered by the suppressions — so a
   *    compaction summary generated before the forget cannot resurrect it.
   * A durable deletion job records the outcome; a failed mirror/ledger write
   * rejects rather than falsely acknowledging completion (R13).
   */
  async forgetMemory(id: string): Promise<{
    removedIds: string[]
    suppressedCount: number
    projectionDisposed: boolean
    projectionRebuilt: boolean
    state: DeletionState
    operationId: string
  }> {
    // Capture the entry's document BEFORE the ledger removal deletes it.
    const documentId = this.documentIdForMemory(id) ?? this.currentDocumentId()
    const operationId = this.deletions.begin('forget-entry', documentId ?? null)
    try {
      const result = this.memory.forget(id)
      if (!result) {
        this.deletions.failed(operationId, 'entry-not-found')
        return {
          removedIds: [], suppressedCount: 0, projectionDisposed: false,
          projectionRebuilt: false, state: 'failed', operationId
        }
      }
      let projectionDisposed = false
      let projectionRebuilt = false
      let sessionsPurged = 0
      let eventsRemoved = 0
      if (documentId) {
        // Purge matching plaintext from retained sessions and imported history.
        sessionsPurged = this.purgeSuppressedSessionMessages(documentId)
        eventsRemoved = this.memory.purgeSuppressedEvents(documentId)
        const disposal = await this.disposeAndRebuildProjection(documentId)
        projectionDisposed = disposal.disposed
        projectionRebuilt = disposal.rebuilt
        // A type/report alone is not completion: if the sidecar was unavailable,
        // keep the document fenced until disposal actually succeeds (R10).
        if (projectionDisposed) this.pendingProjectionDisposal.delete(documentId)
        else this.pendingProjectionDisposal.set(documentId, 'rebuild')
        // §D: compact the active file after removing retained evidence.
        try { await this.memory.compactAsync() } catch { /* pending maintenance */ }
        try { await this.flushSessions() } catch { /* write-behind retried on next flush */ }
        // §F: invalidate in-flight consolidation/compaction that captured the
        // old policy epoch, and drop it from the running set.
        try { this.documentPolicy.bumpEpoch(documentId) } catch { /* best-effort */ }
        this.runningConsolidations.delete(documentId)
      }
      const removed: ArtifactCounts = {
        entries: result.removedIds.length,
        events: eventsRemoved,
        suppressions: result.suppressedCount,
        sessions: sessionsPurged,
        projections: projectionDisposed ? 1 : 0
      }
      const state: DeletionState = !documentId || projectionDisposed ? 'complete' : 'pending'
      if (state === 'complete') this.deletions.complete(operationId, removed)
      else this.deletions.pending(operationId, ['projection'], removed)
      return { ...result, projectionDisposed, projectionRebuilt, state, operationId }
    } catch (err) {
      this.deletions.failed(operationId, (err as Error).message)
      throw err
    }
  }

  /** Document id for a memory entry, or null if it is gone (deleted) or global. */
  private documentIdForMemory(id: string): string | null {
    const entry = this.memory.getEntry(id)
    if (!entry || entry.scope === 'global') return null
    return entry.documentId
  }

  /** Dispose a document's sidecar projection without rebuilding (R10). */
  private async disposeProjectionOnly(documentId: string): Promise<boolean> {
    const mnesis = await this.getReadyMnesis()
    if (!mnesis) return false
    try {
      // Purge each generation's own database, then remove its owned files (§E).
      for (const generation of this.projections.generations(documentId)) {
        if (generation.state === 'disposed') continue
        const dbPath = this.projections.generationDbPath(generation.generationId)
        try { await mnesis.forgetDocument(documentId, dbPath) } catch { /* dispose proceeds */ }
        this.projections.dispose(generation.generationId)
      }
      // Legacy/shared projection that predates generations.
      await mnesis.forgetDocument(documentId)
      return true
    } catch (err) {
      console.warn('[AgentBridge] Projection disposal failed:', (err as Error).message)
      return false
    }
  }

  /**
   * Whole-session disposal + filtered rebuild of a document's Mnesis
   * projection (§11). Order matters: read the transcript first, dispose,
   * then re-record the filtered turns into a fresh generation — after
   * disposal nothing of the old sessions (including in-flight compaction
   * summaries) survives. Filtering is turn-aware so dropping a forgotten
   * message cannot shift unrelated pairs (R15).
   */
  private async disposeAndRebuildProjection(
    documentId: string
  ): Promise<{ disposed: boolean; rebuilt: boolean }> {
    if (this.currentDocumentProtected()) {
      // Protected documents never had a persistent projection (§11 ephemeral
      // mode) — nothing to dispose.
      return { disposed: false, rebuilt: false }
    }
    const mnesis = await this.getReadyMnesis()
    if (!mnesis) return { disposed: false, rebuilt: false }
    try {
      // Read each generation's live transcript BEFORE disposal (the filtered
      // ledger), keyed by its projection identity.
      const transcriptByKey = new Map<string, Array<{ role: string; content: string }>>()
      const generations = this.projections.generations(documentId).filter((g) => g.state !== 'disposed')
      if (generations.length === 0) {
        let transcript: Array<{ role: string; content: string }> = []
        try {
          transcript = await mnesis.messages(documentId)
        } catch { /* no session yet */ }
        transcriptByKey.set(documentId, transcript)
        await mnesis.forgetDocument(documentId)
      } else {
        for (const generation of generations) {
          const sessionKey = generation.sessionId ?? documentId
          const dbPath = this.projections.generationDbPath(generation.generationId)
          try {
            const transcript = await mnesis.messages(sessionKey, dbPath)
            transcriptByKey.set(sessionKey, (transcriptByKey.get(sessionKey) ?? []).concat(transcript))
          } catch { /* no session yet */ }
          try {
            await mnesis.forgetDocument(documentId, dbPath)
          } catch { /* dispose proceeds */ }
          this.projections.dispose(generation.generationId)
        }
      }

      const suppressions = this.memory.suppressionsFor(documentId)
      let rebuilt = false
      // Rebuild every affected projection into a fresh generation from the
      // filtered turns ("forgotten stays forgotten", R15).
      for (const [sessionKey, transcript] of Array.from(transcriptByKey.entries())) {
        const { kept } = filterTurnsForRebuild(transcript, suppressions)
        const fresh = this.projections.refreshGeneration(documentId, sessionKey)
        const dbPath = this.projections.generationDbPath(fresh.generationId)
        for (let i = 0; i + 1 < kept.length; i += 2) {
          if (kept[i].role === 'user' && kept[i + 1].role === 'assistant') {
            await mnesis.record(sessionKey, kept[i].content, kept[i + 1].content, dbPath)
            rebuilt = true
          }
        }
      }
      // The rebuilt generations are active and populated — retire any
      // superseded ones now (§E).
      this.projections.retireSuperseded(documentId)
      return { disposed: true, rebuilt }
    } catch (err) {
      console.warn('[AgentBridge] Projection disposal/rebuild failed:', err)
      return { disposed: false, rebuilt: false }
    }
  }

  /**
   * Collaboration access revoked (§14 fixture row): forget everything for a
   * document and dispose its projection. Revocation is dispose-only — nothing
   * is rebuilt and a later access grant cannot replay the revoked data (R10).
   */
  async revokeDocumentMemoryAccess(documentId: string): Promise<{
    removedIds: string[]
    suppressedCount: number
    projectionDisposed: boolean
    state: DeletionState
    operationId: string
  }> {
    const operationId = this.deletions.begin('revoke-document', documentId)
    try {
      // Durable deny rule with a new policy epoch; in-flight jobs for the old
      // epoch can no longer commit (R10).
      this.documentPolicy.revoke(documentId)
      this.runningConsolidations.delete(documentId)
      const result = this.memory.revokeDocumentAccess(documentId)
      const sessionsPurged = this.clearSessionMessagesForDocument(documentId)
      const eventsRemoved = this.memory.removeHistoricalEvents(documentId)
      const disposed = await this.disposeProjectionOnly(documentId)
      if (disposed) this.pendingProjectionDisposal.delete(documentId)
      else this.pendingProjectionDisposal.set(documentId, 'dispose')
      try { await this.memory.compactAsync() } catch { /* pending maintenance */ }
      try { await this.flushSessions() } catch { /* write-behind retried on next flush */ }
      const removed: ArtifactCounts = {
        entries: result.removedIds.length,
        events: eventsRemoved,
        suppressions: result.suppressedCount,
        sessions: sessionsPurged,
        projections: disposed ? 1 : 0
      }
      const state: DeletionState = disposed ? 'complete' : 'pending'
      if (state === 'complete') this.deletions.complete(operationId, removed)
      else this.deletions.pending(operationId, ['projection'], removed)
      return { ...result, projectionDisposed: disposed, state, operationId }
    } catch (err) {
      this.deletions.failed(operationId, (err as Error).message)
      throw err
    }
  }

  // ─── Deletion job status (updates-2.md §D: expose, don't infer) ───

  /** Durable status of a deletion operation, for IPC/UI reporting. */
  getDeletionJob(operationId: string): DeletionJobStatus | null {
    return this.deletions.status(operationId)
  }

  /** Deletion jobs still pending (e.g. sidecar was unavailable). */
  pendingDeletionJobs(): DeletionJobStatus[] {
    return this.deletions.pendingJobs()
  }

  /** Documents with an in-flight consolidation request (§F). */
  consolidatingDocuments(): string[] {
    return Array.from(this.runningConsolidations.keys())
  }

  /** Typed result for a persisted operation (complete/pending/failed). */
  deletionResult(operationId: string): DeletionResult | null {
    const job = this.deletions.status(operationId)
    if (!job) return null
    if (job.state === 'complete') return { state: 'complete', operationId, removed: job.removed }
    if (job.state === 'pending') return { state: 'pending', operationId, remaining: job.remaining }
    return { state: 'failed', operationId, code: job.code ?? 'unknown' }
  }

  /**
   * Resume interrupted deletion maintenance (R8/§D step 7). Runs before
   * affected sources are readable again; a job stays pending if the sidecar is
   * still unavailable rather than being falsely completed.
   */
  async resumePendingDeletions(): Promise<number> {
    let resumed = 0
    for (const job of this.deletions.pendingJobs()) {
      if (!job.documentId) continue
      const handled =
        job.kind === 'forget-entry'
          ? (await this.disposeAndRebuildProjection(job.documentId)).disposed
          : await this.disposeProjectionOnly(job.documentId)
      if (handled) {
        this.pendingProjectionDisposal.delete(job.documentId)
        this.deletions.complete(job.operationId, job.removed)
        resumed++
      }
    }
    return resumed
  }

  /** Opt back in (§11): clear anti-re-learning suppressions for a document. */
  clearMemorySuppressions(documentId?: string, entryId?: string): number {
    return this.memory.clearSuppressions(documentId, entryId)
  }

  // ─── Consolidated consent (§11: the seven boundaries, one surface) ───

  getConsent(): ConsentSettings {
    return { ...this.consent }
  }

  setConsent(partial: Partial<ConsentSettings>): ConsentSettings {
    const before = this.consent
    this.consent = effectiveConsent({ ...this.consent, ...partial })
    this.config.consent = this.consent
    this.saveConfig()
    // §C: withdrawing a consent boundary cancels intersecting in-flight runs.
    // We cannot retract content already sent, but we stop further dispatch.
    const revoked =
      (before.remoteInference && !this.consent.remoteInference) ||
      (before.retainLocalChatHistory && !this.consent.retainLocalChatHistory) ||
      (before.backgroundSummarization && !this.consent.backgroundSummarization)
    if (revoked) this.runs.abortAll()
    return { ...this.consent }
  }

  /**
   * Boundary 7 gate: remote inference. Called before every provider call.
   * Local endpoints are never blocked by this boundary.
   */
  private remoteInferenceAllowed(): boolean {
    if (this.consent.remoteInference) return true
    return isLocalEndpoint(this.config.endpoint)
  }

  /**
   * Unified persistent-memory gate (§B): a run may touch retained document
   * memory only when it is not protected/revoked by main-owned policy and the
   * caller did not mark it protected. Revocation is durable and wins over any
   * renderer flag that would loosen it.
   */
  private memoryAllowedForRun(documentId: string, runProtected: boolean): boolean {
    if (!persistentMemoryAllowed(runProtected)) return false
    if (this.documentPolicy.isProtected(documentId) || this.documentPolicy.isRevoked(documentId)) return false
    return true
  }

  /**
   * §B/R5: identity of the run currently executing (async-local), preferring
   * its immutable scope over the legacy shared fields so overlapping runs do
   * not clobber each other. Falls back to the last-invocation fields for
   * out-of-run callers (IPC, background work).
   */
  private currentDocumentId(): string {
    const scope = currentRunScope()
    if (scope?.documentId) return scope.documentId
    return this._currentDocumentId || this._currentDocPath || 'default'
  }

  private currentDocumentPath(): string | null {
    const scope = currentRunScope()
    if (scope?.documentPath) return scope.documentPath
    return this._currentDocPath
  }

  private currentDocumentProtected(): boolean {
    const scope = currentRunScope()
    if (scope) return scope.protected
    return this._currentDocProtected
  }

  /**
   * §B/D8: origin identity attached to agent edit/apply events so the renderer
   * can refuse applying a proposal to a different document than it was made for.
   */
  private runIdentity(): Record<string, unknown> {
    const scope = currentRunScope()
    if (!scope) return this._currentDocumentId ? { documentId: this._currentDocumentId } : {}
    return { documentId: scope.documentId, runId: scope.runId, snapshotHash: scope.snapshotHash }
  }

  private sendToolApply(tool: string, args: Record<string, unknown>): void {
    this.send('agent-tool-apply', { tool, args, ...this.runIdentity() })
  }

  // ─── Migration steps 7 and 9 (§12: sessions → events → projections) ───

  /**
   * Step 7: import legacy agent sessions as historical events. Idempotent —
   * deterministic event ids mean a re-run adds nothing. Provenance records
   * exactly what is unknown (per-message timestamps, revision and tool
   * evidence were never recorded).
   */
  migrateLegacySessions(): { sessionsConsidered: number; eventsAdded: number } {
    const sessions = this.listSessions()
    let eventsAdded = 0
    for (const session of sessions) {
      eventsAdded += this.memory.importHistoricalEvents(sessionToHistoricalEvents(session))
    }
    return { sessionsConsidered: sessions.length, eventsAdded }
  }

  /**
   * Step 9: rebuild Mnesis projections from eligible imported events, after
   * canonical migration. Fresh-generation semantics (§9.5): each document's
   * projection is disposed first, then replayed from the filtered ledger —
   * suppressed (forgotten) content is never rebuilt. Skips are counted and
   * reported, never silently merged.
   */
  async rebuildProjectionsFromMigration(): Promise<{
    documents: number
    turnsReplayed: number
    skipped: { orphan: number; projected: number; suppressed: number; unexpectedRole: number }
    sidecarUnavailable: boolean
  }> {
    const mnesis = await this.getReadyMnesis()
    if (!mnesis) {
      return { documents: 0, turnsReplayed: 0, skipped: { orphan: 0, projected: 0, suppressed: 0, unexpectedRole: 0 }, sidecarUnavailable: true }
    }
    this.rebuilding = true
    const byDoc = new Map<string, ReturnType<AgentMemoryStore['allHistoricalEvents']>>()
    for (const event of this.memory.allHistoricalEvents()) {
      const list = byDoc.get(event.documentId) ?? []
      list.push(event)
      byDoc.set(event.documentId, list)
    }
    const skipped = { orphan: 0, projected: 0, suppressed: 0, unexpectedRole: 0 }
    let turnsReplayed = 0
    let documents = 0
    try {
      for (const [documentId, events] of Array.from(byDoc.entries())) {
        if (events.length === 0) continue
        const isSuppressed = (content: string): boolean => this.memory.isSuppressed(content, documentId)
        // New events since the last projection decide whether a rebuild is due.
        const newPlan = planProjectionRebuild(events, isSuppressed)
        skipped.orphan += newPlan.skipped.orphan
        skipped.projected += newPlan.skipped.projected
        skipped.suppressed += newPlan.skipped.suppressed
        skipped.unexpectedRole += newPlan.skipped.unexpectedRole
        if (newPlan.turns.length === 0) continue
        // R11: rebuild the generation from ALL eligible committed events, not
        // only the newly imported ones, so previously projected turns survive.
        const fullPlan = planProjectionRebuild(events, isSuppressed, { includeProjected: true })
        try {
          // Fresh generation in its own owned database: replay from the
          // filtered ledger so previously projected turns survive (R11/§E).
          const startSequence = this.memory.latestEventSequence(documentId)
          const generation = this.projections.refreshGeneration(documentId)
          const dbPath = this.projections.generationDbPath(generation.generationId)
          // A brand-new generation database is empty; this also guarantees a
          // clean slate if a generation file is ever reused.
          await mnesis.forgetDocument(documentId, dbPath)
          for (const turn of fullPlan.turns) {
            await mnesis.record(documentId, turn.user, turn.assistant, dbPath)
          }
          this.memory.markEventsProjected(fullPlan.projectedEventIds)
          // §E catch-up: fold in events committed while we were replaying,
          // before the replacement generation is treated as complete.
          const catchUp = this.memory.eventsAfter(documentId, startSequence)
          if (catchUp.length > 0) {
            const catchPlan = planProjectionRebuild(catchUp, isSuppressed)
            for (const turn of catchPlan.turns) {
              await mnesis.record(documentId, turn.user, turn.assistant, dbPath)
            }
            this.memory.markEventsProjected(catchPlan.projectedEventIds)
            turnsReplayed += catchPlan.turns.length
          }
          // The replacement generation is active and populated — retire the
          // superseded one only now (R11/§E).
          this.projections.retireSuperseded(documentId)
          turnsReplayed += newPlan.turns.length
          documents++
        } catch (err) {
          console.warn(`[AgentBridge] Projection rebuild failed for ${documentId}:`, err)
        }
      }
    } finally {
      this.rebuilding = false
    }
    return { documents, turnsReplayed, skipped, sidecarUnavailable: false }
  }

  // ─── Migration backups (§12 step 12: explicit removal only) ───

  listMigrationBackups(): Array<{ name: string; createdAt: number }> {
    return this.memory.listMigrationBackups()
  }

  removeMigrationBackup(name: string): boolean {
    return this.memory.removeMigrationBackup(name)
  }

  updateMemory(id: string, content: string): void { this.memory.update(id, content); this.flushMemory() }
  saveMemoryEntry(
    documentId: string,
    type: string,
    content: string,
    scope?: 'document' | 'global',
    provenance?: { sourceType?: AgentMemorySourceType; runId?: string; originKey?: string; approvalState?: AgentMemoryApprovalState }
  ): AgentMemoryEntry {
    // §11/§B: protected or revoked documents never persist memory, including
    // review-time saves that bypass the memory_save tool (R6).
    if (!this.memoryAllowedForRun(documentId, this.currentDocumentProtected())) {
      throw new MemoryError('protected-document', 'This document is protected — memory saving is disabled (ephemeral mode).')
    }
    // §11 boundary 2: remembering explicit facts requires consent.
    if (!this.consent.rememberDocumentFacts) {
      throw new MemoryError('consent-required', 'Remembering document facts is disabled in Privacy settings (consent boundary 2).')
    }
    // §11 boundary 5: author-level ("all my documents") preferences require
    // consent; document-scoped saves are unaffected.
    if (scope === 'global' && !this.consent.crossDocumentPreferences) {
      throw new MemoryError('consent-required', 'Cross-document preferences are disabled in Privacy settings (consent boundary 5). Save as document-scoped instead.')
    }
    const source = provenance?.sourceType === 'user' ? 'explicit' : 'inferred'
    const entry = this.memory.add(documentId, 'assistant', type as AgentMemoryEntry['type'], content, source, scope || 'document', provenance)
    this.flushMemory()
    return entry
  }
  setMemoryApproval(id: string, state: AgentMemoryApprovalState): void { this.memory.setApproval(id, state); this.flushMemory() }
  getMemoryCandidates(documentId: string): AgentMemoryEntry[] { return this.memory.getCandidates(documentId) }
  /**
   * Migrate memory entries from a legacy key (file path, tab id, 'default')
   * to a stable documentId (memory.md §6.1). Idempotent.
   */
  rekeyMemory(oldKey: string, newKey: string): number { const moved = this.memory.rekey(oldKey, newKey); if (moved > 0) this.flushMemory(); return moved }
  /** Quarantined legacy records awaiting user review (memory.md §12 step 5). */
  getMemoryQuarantine() { return this.memory.getQuarantined() }
  /** Resolve a quarantined record by explicit user action (keep/discard). */
  resolveMemoryQuarantine(
    key: string,
    action: { type: 'keep'; documentId: string } | { type: 'discard' }
  ): boolean { const ok = this.memory.resolveQuarantine(key, action); if (ok) this.flushMemory(); return ok }
  applyMemoryTemplate(documentId: string, templateType: string): number {
    // §11 boundary 2: templates are an ingestion path and obey the same
    // explicit-facts consent as a manual save (R4). Boundary 5 additionally
    // gates any global-scope template items.
    if (!this.consent.rememberDocumentFacts) {
      throw new MemoryError('consent-required', 'Remembering document facts is disabled in Privacy settings (consent boundary 2).')
    }
    const count = this.memory.applyTemplate(documentId, templateType, 'system', this.consent.crossDocumentPreferences)
    if (count > 0) this.flushMemory()
    return count
  }
  async consolidateMemory(documentId: string): Promise<{ consolidated: number; summary: string }> {
    const count = this.memory.countForDocument(documentId)
    if (count < 30) {
      return { consolidated: 0, summary: 'Not enough entries to consolidate (need 30+)' }
    }

    // R19: only approved, in-scope, current entries feed the model request.
    // Rejected/candidate/superseded records are never reactivated by a summary.
    const entries = this.memory.getEligibleForDocument(documentId).reverse()
    const toConsolidate = entries.slice(0, Math.max(0, entries.length - 10)) // keep 10 most recent

    const entriesText = toConsolidate.map((e) => `- [${e.type}] ${e.content}`).join('\n')
    const prompt = `Summarize the following memory entries into a concise paragraph that preserves key facts, preferences, and decisions. Return ONLY the summary, no preamble:\n\n${entriesText}`

    // Capture the source snapshot and policy epoch before the request; at
    // commit, the store re-checks suppression and we require the epoch to be
    // unchanged so a forget/revoke/clear in flight cannot publish stale lineage
    // (R14/F).
    const policyEpoch = this.documentPolicy.policyEpoch(documentId)
    this.runningConsolidations.set(documentId, { epoch: policyEpoch, startedAt: Date.now() })
    try {
      const summary = await this.fetchCompletion([
        { role: 'system', content: 'You are a memory consolidation assistant. Summarize memory entries into a concise, information-dense paragraph.' },
        { role: 'user', content: prompt }
      ])

      const epochUnchanged = this.documentPolicy.policyEpoch(documentId) === policyEpoch
      const consolidatedIds = this.memory.consolidate(documentId, summary, 10, epochUnchanged)
      await this.memory.flush()
      return { consolidated: consolidatedIds?.length || 0, summary }
    } catch (err) {
      return { consolidated: 0, summary: `Consolidation failed: ${(err as Error).message}` }
    } finally {
      this.runningConsolidations.delete(documentId)
    }
  }

  // ─── Self-Improvement Loop ───

  /**
   * After a chat exchange completes, check if the user's message contained
   * a preference, correction, or instruction worth remembering. Uses a
   * lightweight LLM call to extract structured memory from the conversation.
   * Fire-and-forget — never blocks the UI.
   */
  private async autoExtractPreferences(
    userMessage: string,
    assistantResponse: string,
    documentId: string
  ): Promise<void> {
    // §11/§B defense-in-depth: protected or revoked documents never persist
    // memory, even if a future call site forgets the outer gate.
    if (!this.memoryAllowedForRun(documentId, this.currentDocumentProtected())) return
    // §11 boundary 3: automatic inference requires explicit consent.
    if (!this.consent.automaticMemoryInference) return
    // Skip if no endpoint configured or very short messages
    if (!this.config.endpoint || userMessage.length < 20) return

    const extractPrompt = `Analyze this conversation exchange. If the user expressed a preference, correction, or instruction about writing style, tone, formatting, or content that should be remembered for future work, extract it.

Return ONLY a JSON object with these fields, or null if nothing worth remembering:
{
  "type": "preference" | "correction" | "decision",
  "content": "concise description of what to remember"
}

Note: extracted memories are saved as document-scoped suggestions the user must approve before they take effect — do not claim they have been applied globally.

Conversation:
User: ${userMessage.slice(0, 500)}
Assistant: ${assistantResponse.slice(0, 500)}`

    try {
      const response = await this.fetchCompletion([
        { role: 'system', content: 'You are a memory extraction assistant. Extract preferences and corrections from conversations. Return only valid JSON or null.' },
        { role: 'user', content: extractPrompt }
      ])

      if (!response || response.trim() === 'null' || response.trim() === '') return

      // Parse the response — strip markdown fences if present
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: { type: string; content: string; scope: string } | null = null

      try {
        parsed = JSON.parse(cleaned)
      } catch {
        // Try to extract JSON object from surrounding text
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
          try { parsed = JSON.parse(match[0]) } catch { return }
        } else { return }
      }

      if (parsed && parsed.content && parsed.type) {
        // §11 anti-re-learning: forgotten content must not be re-derived
        // automatically from the still-present conversation. Only an
        // explicit user save (agent-memory-save) can bring it back.
        if (this.memory.isSuppressed(parsed.content, documentId)) {
          console.log('[AgentBridge] Suppressed re-extraction of forgotten content — ignored')
          return
        }
        // Check if a similar entry already exists (avoid duplicates)
        const existing = this.memory.getForDocument(documentId)
        const globalEntries = this.memory.getGlobal()
        const allEntries = [...existing, ...globalEntries]
        const isDuplicate = allEntries.some((e) =>
          e.content.toLowerCase().includes(parsed!.content.toLowerCase().slice(0, 30)) ||
          parsed!.content.toLowerCase().includes(e.content.toLowerCase().slice(0, 30))
        )

        if (!isDuplicate) {
          // memory.md §10.1: auto-extracted entries are document-scoped
          // candidates — never auto-promoted to global scope.
          this.memory.add(documentId, 'system', parsed.type as AgentMemoryEntry['type'], parsed.content, 'inferred', 'document')
          console.log('[AgentBridge] Auto-extracted memory candidate for user review')
        }
      }
    } catch (err) {
      // Best-effort — don't crash on extraction failure
      console.warn('[AgentBridge] Auto-extract preferences failed:', (err as Error).message)
    }
  }

  /**
   * Run correction clustering for a document. Detects 3+ similar corrections
   * and suggests a document-scoped candidate preference (no automatic global
   * promotion — the originals are kept as evidence). Fire-and-forget.
   */
  private async autoClusterCorrections(documentId: string): Promise<void> {
    try {
      const clustered = this.memory.clusterCorrections(documentId)
      if (clustered > 0) {
        console.log(`[AgentBridge] Suggested ${clustered} preference candidate(s) from correction clusters`)
      }
    } catch (err) {
      console.warn('[AgentBridge] Correction clustering failed:', (err as Error).message)
    }
  }
}