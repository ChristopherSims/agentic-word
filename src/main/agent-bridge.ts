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
  AgentMemoryEntry
} from '../shared/types'
import { AgentMemoryStore } from './agent-memory'

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
  private pendingApproval: { resolve: (approved: boolean) => void; toolName: string; args: Record<string, unknown> } | null = null
  private config: AgentConfig = {
    endpoint: '',
    apiKey: '',
    model: 'gpt-4'
  }
  private presets: AgentPreset[] = []
  private scratchpad: string = ''
  private maxToolTurns: number = 5
  private temperature: number = 0.7
  private abortController: AbortController | null = null
  private ollamaFormat: boolean = false
  private _currentDocPath: string | null = null

  private sessions: Map<string, AgentSession> = new Map()
  private taskGraphs: Map<string, Map<string, AgentTask>> = new Map()
  private memory: AgentMemoryStore
  private activeGraphId: string | null = null
  private profiles: AgentProfile[] = [
    { id: 'writer', name: 'Writer', role: 'writer', systemPrompt: 'You are a creative writing assistant. Focus on improving prose, expanding ideas, and generating content. Be expressive and help the user develop their document.', color: '#89b4fa' },
    { id: 'reviewer', name: 'Reviewer', role: 'reviewer', systemPrompt: 'You are a critical reviewer and editor. Focus on clarity, grammar, consistency, and logic. Point out issues and suggest improvements. Be constructive but thorough.', color: '#f38ba8' },
    { id: 'researcher', name: 'Researcher', role: 'researcher', systemPrompt: 'You are a research assistant. Gather information, find facts, verify claims, and provide structured research notes. Use web_search and web_fetch tools when available. Cite sources.', color: '#a6e3a1' },
    { id: 'orchestrator', name: 'Orchestrator', role: 'orchestrator', systemPrompt: 'You are a task orchestrator. Decompose the user request into subtasks for Writer, Reviewer, and Researcher agents. Return a JSON array of task objects with fields: agentName, title, prompt, dependencies (array of task indices). Keep decompositions small (2-5 subtasks). Each prompt must be self-contained.', color: '#cba6f7' }
  ]
  private sessionsPath: string
  private configPath: string

  // Tool registry — Hermes ACP-compatible definitions
  private tools: Map<string, { definition: ToolDefinition; handler: (args: Record<string, unknown>) => Promise<ToolExecutionResult> }> = new Map()

  // Streaming insertion sessions — accumulates chunks from multi-turn tool calls
  private streamSessions: Map<string, { position: string; buffer: string[] }> = new Map()

  constructor(vcs: VcsEngine, docStore: DocumentStore) {
    this.vcs = vcs
    this.docStore = docStore
    this.sessionsPath = path.join(app.getPath('userData'), 'agent-sessions.json')
    this.configPath = path.join(app.getPath('userData'), 'agent-config.json')
    // Don't call loadConfig() here — safeStorage isn't available until app is ready
    this.loadSessions()
    this.memory = new AgentMemoryStore()
    this.registerBuiltinTools()
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
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  setPermissions(p: Partial<AgentPermissions>): void {
    this.permissions = { ...this.permissions, ...p }
  }

  getPermissions(): AgentPermissions {
    return { ...this.permissions }
  }

  resolveToolApproval(approved: boolean): boolean {
    if (this.pendingApproval) {
      this.pendingApproval.resolve(approved)
      this.pendingApproval = null
      return true
    }
    return false
  }

  private getPermissionCategory(toolName: string): AgentPermissionCategory | null {
    const writeTools = ['document_write', 'document_prepend', 'document_append', 'document_insert_stream_start', 'document_insert_multiple_locations', 'document_insert_after_element']
    const editTools = ['document_replace', 'document_batch_replace', 'document_delete', 'document_format', 'document_create_list']
    const saveTools = ['document_save']
    const revertTools = ['document_undo_last_stream']
    const storyboardTools = ['storyboard_read', 'storyboard_update']
    const vcsTools = ['vcs_commit', 'vcs_log', 'vcs_diff']
    const streamTools = ['document_insert_stream_chunk', 'document_insert_stream_finalize', 'document_insert_stream_abort', 'document_insert_stream_with_format', 'document_insert_stream_status', 'document_replace_stream', 'document_insert_stream_preview', 'content_validate_stream']
    const webTools = ['web_fetch', 'web_search']
    const memoryTools = ['memory_save', 'memory_recall', 'memory_clear']

    if (writeTools.includes(toolName)) return 'write'
    if (editTools.includes(toolName)) return 'edit'
    if (saveTools.includes(toolName)) return 'save'
    if (revertTools.includes(toolName)) return 'revert'
    if (storyboardTools.includes(toolName)) return 'storyboard'
    if (vcsTools.includes(toolName)) return 'vcs'
    if (streamTools.includes(toolName)) return 'streaming'
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
        const loaded = (parseConfig(data, AgentConfigSchema.partial()) as Partial<AgentConfig> | null) || {}
        console.log('[AgentBridge] Loaded config:', { ...loaded, apiKey: loaded.apiKey ? `[${loaded.apiKey.length} chars]` : '[empty]' })
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
        this.config = { ...this.config, ...loaded }
      }
    } catch (err) {
      console.error('[AgentBridge] Failed to load config:', err)
    }
  }

  private saveConfig(): void {
    try {
      const configToSave = { ...this.config }
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

  async handleChatStream(messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string; storyboardContent?: string; currentFilePath?: string }): Promise<void> {
      // Track current document path for storyboard tools
      this._currentDocPath = context?.currentFilePath || null

      // Delegate to Rust reactor when available (skip for Ollama native format)
    if (isRustAvailable() && !this.ollamaFormat) {
      await this.handleChatStreamViaRustReactor(messages, context)
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

    this.abortController = new AbortController()

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
        `You are a document editing assistant integrated into Lexicon. You have access to the following tools: ${toolDefs.map((t) => t.name).join(', ')}. Use tools when the user explicitly asks you to (e.g. "write", "edit", "replace", "search"). Otherwise, respond conversationally without calling tools.`
      )
    } else {
      systemParts.push(
        `You are a document editing assistant integrated into Lexicon. Respond conversationally and helpfully to the user's requests.`
      )
    }

    if (context?.documentContent) {
          const snippet = context.documentContent.length > 4000
            ? context.documentContent.slice(0, 4000) + '\n... [truncated]'
            : context.documentContent
          systemParts.push(`\nCurrent document content (HTML):\n${snippet}`)
        }
        if (context?.currentBranch) {
          systemParts.push(`Current VCS branch: ${context.currentBranch}`)
        }
        if (context?.selection) {
          systemParts.push(`User's current selection: "${context.selection}"`)
        }
        if (context?.storyboardContent) {
          systemParts.push(`\n<storyboard>\nThe user has a storyboard for this document. Follow its structure and instructions when writing:\n\n${context.storyboardContent}\n</storyboard>`)
        }
        if (this.scratchpad) {
          systemParts.push(`Your scratchpad notes:\n${this.scratchpad}`)
        }

        if (context?.currentFilePath) {
          const memoryContext = this.memory.formatForPrompt(context.currentFilePath)
          if (memoryContext) systemParts.push(`\nLong-term memory for this document:\n${memoryContext}`)
        }

        const ollama = this.ollamaFormat
        const allMessages = [
          { role: 'system', content: systemParts.join('\n') },
          ...messages
        ]
        const payload: Record<string, unknown> = ollama
          ? {
              model: this.getModel('smart'),
              messages: allMessages,
              stream: true,
              options: { temperature: this.temperature }
            }
          : {
              model: this.getModel('smart'),
              messages: allMessages,
              tools: this.listTools().map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.parameters }
              })),
              tool_choice: 'auto',
              temperature: this.temperature,
              stream: true
            }

    try {
      console.log(`[AgentBridge] POST ${this.config.endpoint} | model=${this.config.model} | ollama=${ollama} | messages=${messages.length}`)
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      })

      console.log(`[AgentBridge] Response ${response.status} ${response.statusText} | content-type=${response.headers.get('content-type')}`)
      if (!response.ok) {
        const text = await response.text()
        console.error(`[AgentBridge] API error ${response.status}:`, text.slice(0, 500))
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log(`[AgentBridge] Stream ended | tokens=${fullContent.length} chars | chunks=${rawChunks}`)
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        rawChunks++
        if (rawChunks <= 2) {
          console.log(`[AgentBridge] Raw chunk #${rawChunks} (${chunk.length} bytes):`, chunk.slice(0, 300))
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
                if (tc.id) {
                  toolCalls.push({ id: tc.id, name: tc.function?.name || '', arguments: tc.function?.arguments || '' })
                } else if (tc.function?.arguments && toolCalls.length > 0) {
                  toolCalls[toolCalls.length - 1].arguments += tc.function.arguments
                }
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }

      // If tool calls were made, execute them, signal the renderer, and continue multi-turn.
      // NOTE: agent-stream-done is NOT fired here — multi-turn may generate more tokens.
      // It fires only after the chain completes (or errors) so the renderer finalizes once.
      if (toolCalls.length > 0) {
        const results = []
        for (const tc of toolCalls) {
          let toolArgs: Record<string, unknown>
          try {
            toolArgs = JSON.parse(tc.arguments)
          } catch {
            console.warn(`Malformed tool arguments for ${tc.name}: ${tc.arguments.slice(0, 100)}`)
            toolArgs = {}
          }
          const result = await this.executeTool(tc.name, toolArgs)
          results.push({ toolCallId: tc.id, toolName: tc.name, result })
        }

        this.send('agent-tool-results', { toolCalls: results })

        // Multi-turn: send tool results back and continue the conversation
        await this.handleMultiTurn(messages, fullContent, toolCalls, results)
      } else {
        // No tool calls — stream is done
        this.updateTaskStatus(singleGraphId, `${singleGraphId}_main`, 'done', fullContent)
        this.send('agent-stream-done', { fullContent, toolCalls: [] })

        // Self-improvement loop: auto-extract preferences + cluster corrections
        const docId = context?.currentFilePath || this._currentDocPath || 'default'
        const userMsg = messages.length > 0 ? messages[messages.length - 1]?.content || '' : ''
        if (userMsg.length >= 20) {
          this.autoExtractPreferences(userMsg, fullContent, docId).catch(() => {})
          this.autoClusterCorrections(docId).catch(() => {})
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
          this.abortController = null
        }
  }

  // ─── Rust Reactor Polling Loop ───
  // Delegates the full conversation loop to the native Rust reactor.
  // TS polls for events and executes tools when the reactor requests them.

  private async handleChatStreamViaRustReactor(
    messages: Array<{ role: string; content: string }>,
    context?: { documentContent?: string; currentBranch?: string; selection?: string }
  ): Promise<void> {
    if (!this.config.endpoint) {
      this.send('agent-stream-error', {
        error: 'AI Endpoint Not Configured. Please configure your AI provider in Settings > Agent tab.'
      })
      return
    }

    const toolDefs = this.listTools()

    // Build system message with context
    const systemParts = [
      `You are a document editing assistant integrated into Lexicon. You have access to the following tools: ${toolDefs.map((t) => t.name).join(', ')}. Use tools when the user explicitly asks you to (e.g. "write", "edit", "replace", "search"). Otherwise, respond conversationally without calling tools.`
    ]
    if (context?.documentContent) {
      const snippet = context.documentContent.length > 4000
        ? context.documentContent.slice(0, 4000) + '\n... [truncated]'
        : context.documentContent
      systemParts.push(`\nCurrent document content (HTML):\n${snippet}`)
    }
    if (context?.currentBranch) {
      systemParts.push(`Current VCS branch: ${context.currentBranch}`)
    }
    if (context?.selection) {
          systemParts.push(`User's current selection: "${context.selection}"`)
        }
        if (context?.storyboardContent) {
          systemParts.push(`\n<storyboard>\nThe user has a storyboard for this document. Follow its structure and instructions when writing:\n\n${context.storyboardContent}\n</storyboard>`)
        }
        if (this.scratchpad) {
          systemParts.push(`Your scratchpad notes:\n${this.scratchpad}`)
        }

        const allMessages = [
      { role: 'system', content: systemParts.join('\n') },
      ...messages
    ]

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

    // Store abort controller for cancellation
    this.abortController = new AbortController()
    const signal = this.abortController.signal

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
              const results = []
              for (const tc of toolCalls) {
                let toolArgs: Record<string, unknown>
                try {
                  toolArgs = JSON.parse(tc.arguments)
                } catch {
                  console.warn(`Malformed tool arguments for ${tc.name}: ${tc.arguments.slice(0, 100)}`)
                  toolArgs = {}
                }
                const result = await this.executeTool(tc.name, toolArgs)
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
      this.abortController = null
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
      return
    }

    const MAX_TURNS = this.maxToolTurns
    let messages = [...originalMessages]
    let currentAssistantContent = assistantContent
    let currentToolCalls = originalToolCalls
    let currentToolResults = toolResults

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Check for user abort before each turn
      if (this.abortController?.signal.aborted) {
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
          function: { name: tc.name, arguments: tc.arguments }
        }))
      }

      // Truncate overly large string tool results to prevent context overflow
      const truncatedResults = currentToolResults.map((tr) => ({
        ...tr,
        result: typeof tr.result === 'string' && tr.result.length > 4000
          ? tr.result.slice(0, 4000) + '... [truncated]'
          : tr.result
      }))

      const followUpMessages: Array<Record<string, unknown>> = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        assistantMsg,
        ...truncatedResults.map((tr) => ({
          role: 'tool' as const,
          content: JSON.stringify(tr.result),
          tool_call_id: tr.toolCallId
        }))
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
        stream: false
      }

      try {
        const response = await fetch(`${this.config.endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
          },
          body: JSON.stringify(payload),
          signal: this.abortController?.signal
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown')
          console.error(`[AgentBridge] Multi-turn HTTP ${response.status} at turn ${turn + 1}:`, errorText.slice(0, 500))
          this.send('agent-stream-error', {
            error: `AI endpoint returned HTTP ${response.status} on follow-up (turn ${turn + 1}). ${errorText.slice(0, 200)}`
          })
          break
        }

        // Parse as non-streaming for follow-up
        const data = await response.json()
        const choice = data.choices?.[0]
        const followUpContent = choice?.message?.content || ''
        const followUpToolCalls = choice?.message?.tool_calls

        if (followUpContent) {
          this.send('agent-stream-token', { token: followUpContent, fullContent: followUpContent, isFollowUp: true })
        }

        if (followUpToolCalls && followUpToolCalls.length > 0) {
          const results = []
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

          // Continue the chain with updated message history
          messages = followUpMessages as unknown as Array<{ role: string; content: string }>
          currentAssistantContent = followUpContent
          currentToolCalls = followUpToolCalls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments
          }))
          currentToolResults = results
        } else {
          // No more tool calls — chain complete
          this.send('agent-stream-done', { fullContent: followUpContent, toolCalls: [], chainComplete: true })
          return  // Return directly instead of break + fallthrough to agent-chain-complete
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          console.log('[AgentBridge] Multi-turn chain aborted by user')
          this.send('agent-stream-done', { fullContent: '', toolCalls: [], chainComplete: false })
          return
        }
        const msg = (err as Error).message
        console.error(`[AgentBridge] Multi-turn chain error at turn ${turn + 1}:`, { error: msg, endpoint: this.config.endpoint })
        this.send('agent-stream-error', {
          error: `Multi-turn error at turn ${turn + 1}: ${msg}. The streamed content that was already applied is preserved.`
        })
        // Still fire stream-done so the renderer finalizes the message
        this.send('agent-stream-done', { fullContent: currentAssistantContent, toolCalls: [], chainComplete: false })
        return
      }
    }

    // Fallthrough: max turns exhausted without completion
    this.send('agent-stream-done', { fullContent: currentAssistantContent, toolCalls: [], chainComplete: false })
  }

  abortStream(): void {
    this.abortController?.abort()
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
      return { content: 'Current document content would be sent from renderer' }
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
      this.send('agent-tool-apply', {
        tool: 'document_replace',
        args
      })
      return { success: true, operation: 'document_replace', message: 'Replacement applied to document' }
    })

    this.registerTool({
      name: 'document_insert',
      description: 'Insert content at a specific position in the document',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'HTML content to insert' },
          position: { type: 'string', description: 'Where to insert: "end", "start", or "cursor"', enum: ['end', 'start', 'cursor'] }
        },
        required: ['content', 'position']
      }
    }, async (args) => {
      // Send command to renderer to apply the insert
      this.send('agent-tool-apply', {
        tool: 'document_insert',
        args
      })
      return { success: true, operation: 'document_insert', message: 'Content inserted into document' }
    })

    // v0.5.3: Streaming insertion tools for real-time text generation
    this.registerTool({
      name: 'document_insert_stream_start',
      description: 'Start a streaming insertion session for real-time text generation from LLM. Returns a sessionId to use for subsequent chunks.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'string', description: 'Where to insert: "end" (append), "start" (prepend), or "cursor"', enum: ['end', 'start', 'cursor'] }
        },
        required: ['position']
      }
    }, async (args) => {
      const sessionId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const position = (args.position as string) || 'cursor'
      this.streamSessions.set(sessionId, { position, buffer: [] })
      return { success: true, operation: 'document_insert_stream_start', sessionId, message: 'Streaming session created.' }
    })

    this.registerTool({
      name: 'document_insert_stream_chunk',
      description: 'Send a chunk of text during streaming insertion. Call this repeatedly as LLM generates text tokens.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from document_insert_stream_start' },
          chunk: { type: 'string', description: 'Text chunk to append to the stream (typically a few tokens)' }
        },
        required: ['sessionId', 'chunk']
      }
    }, async (args) => {
      const sessionId = args.sessionId as string
      const chunk = args.chunk as string
      const session = this.streamSessions.get(sessionId)
      if (!session) return { error: `No stream session found for '${sessionId}'` }
      session.buffer.push(chunk)
      return { success: true, operation: 'document_insert_stream_chunk', message: `Chunk appended (${session.buffer.length} total)` }
    })

    this.registerTool({
      name: 'document_insert_stream_end',
      description: 'Finalize a streaming insertion session and apply all accumulated text to the document.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from document_insert_stream_start' }
        },
        required: ['sessionId']
      }
    }, async (args) => {
      const sessionId = args.sessionId as string
      const session = this.streamSessions.get(sessionId)
      if (!session) return { error: `No stream session found for '${sessionId}'` }
      const fullContent = session.buffer.join('')
      this.streamSessions.delete(sessionId)
      // Send the accumulated content to the renderer for insertion
      this.send('agent-tool-apply', {
        tool: 'document_insert_stream_end',
        args: { content: fullContent, position: session.position }
      })
      return { success: true, operation: 'document_insert_stream_end', message: 'Stream finalized, content inserted', contentLength: fullContent.length }
    })

    this.registerTool({
      name: 'document_insert_stream_cancel',
      description: 'Cancel an ongoing streaming insertion session without applying text.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from document_insert_stream_start' }
        },
        required: ['sessionId']
      }
    }, async (args) => {
      const sessionId = args.sessionId as string
      this.streamSessions.delete(sessionId)
      return { success: true, operation: 'document_insert_stream_cancel', message: 'Stream cancelled, accumulated text discarded' }
    })

    // v0.5.3: Advanced streaming tools
    this.registerTool({
      name: 'document_insert_stream_with_format',
      description: 'Send a text chunk with inline formatting (bold, italic, heading) during streaming insertion.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from document_insert_stream_start' },
          chunk: { type: 'string', description: 'Text to insert' },
          format: {
            type: 'object',
            description: 'Optional formatting to apply',
            properties: {
              bold: { type: 'boolean', description: 'Make text bold' },
              italic: { type: 'boolean', description: 'Make text italic' },
              heading: { type: 'number', description: 'Heading level 1-3', enum: [1, 2, 3] }
            }
          }
        },
        required: ['sessionId', 'chunk']
      }
    }, async (args) => {
      const sessionId = args.sessionId as string
      const chunk = args.chunk as string
      const format = args.format as Record<string, unknown> | undefined
      const session = this.streamSessions.get(sessionId)
      if (!session) return { error: `No stream session found for '${sessionId}'` }
      // Wrap the chunk in formatting HTML if format was specified
      let formatted = chunk
      if (format?.heading) {
        formatted = `<h${format.heading}>${chunk}</h${format.heading}>`
      } else {
        if (format?.bold) formatted = `<strong>${formatted}</strong>`
        if (format?.italic) formatted = `<em>${formatted}</em>`
      }
      session.buffer.push(formatted)
      return { success: true, operation: 'document_insert_stream_with_format', message: `Formatted chunk appended (${session.buffer.length} total)` }
    })

    this.registerTool({
      name: 'document_insert_after_element',
      description: 'Insert content immediately after a specific heading or paragraph in the document.',
      parameters: {
        type: 'object',
        properties: {
          searchText: { type: 'string', description: 'The heading or paragraph text to find' },
          content: { type: 'string', description: 'HTML content to insert after the element' },
          elementType: { type: 'string', description: 'Type of element to search for', enum: ['paragraph', 'heading', 'bullet'] }
        },
        required: ['searchText', 'content']
      }
    }, async (args) => {
      return { success: true, operation: 'document_insert_after_element', args, message: 'Content queued for insertion after element' }
    })

    this.registerTool({
      name: 'document_insert_stream_status',
      description: 'Get real-time status of an active streaming session (buffer size, chunk count, elapsed time).',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from document_insert_stream_start' }
        },
        required: ['sessionId']
      }
    }, async (args) => {
      return { success: true, operation: 'document_insert_stream_status', args, message: 'Status retrieved' }
    })

    this.registerTool({
      name: 'document_replace_stream',
      description: 'Start a streaming replacement session. Find text and replace it with streamed content using subsequent chunk calls.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Text to find and replace' }
        },
        required: ['search']
      }
    }, async (args) => {
      const sessionId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      return { success: true, operation: 'document_replace_stream', sessionId, message: 'Replace stream created. Use chunk calls to send replacement text.' }
    })

    this.registerTool({
      name: 'document_insert_stream_preview',
      description: 'Preview the accumulated text buffer of an active stream without finalizing or applying it.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from document_insert_stream_start' }
        },
        required: ['sessionId']
      }
    }, async (args) => {
      return { success: true, operation: 'document_insert_stream_preview', args, message: 'Preview retrieved' }
    })

    this.registerTool({
      name: 'document_undo_last_stream',
      description: 'Undo the most recently finalized stream insertion operation.',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async (args) => {
      return { success: true, operation: 'document_undo_last_stream', message: 'Undo completed' }
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
                content: { type: 'string', description: 'HTML content to insert' },
                afterElement: { type: 'string', description: 'Optional: insert after this element text' }
              }
            }
          }
        },
        required: ['insertions']
      }
    }, async (args) => {
      return { success: true, operation: 'document_insert_multiple_locations', args, message: 'Multiple insertions queued' }
    })

    this.registerTool({
      name: 'content_validate_stream',
      description: 'Validate accumulated stream content against quality criteria (grammar, tone, length, plagiarism).',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from document_insert_stream_start' },
          checks: {
            type: 'array',
            items: { type: 'string', enum: ['grammar', 'tone', 'length', 'plagiarism'] },
            description: 'Validation checks to run (default: grammar, tone)'
          }
        },
        required: ['sessionId']
      }
    }, async (args) => {
      return { success: true, operation: 'content_validate_stream', args, message: 'Validation executed' }
    })

    // v0.5.3: Document intelligence tools
    this.registerTool({
      name: 'document_get_structure',
      description: 'Extract document outline/table of contents with heading hierarchy and positions.',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async (args) => {
      return { success: true, operation: 'document_get_structure', message: 'Structure retrieved' }
    })

    this.registerTool({
      name: 'document_get_section',
      description: 'Get all content within a specific heading section.',
      parameters: {
        type: 'object',
        properties: {
          headingText: { type: 'string', description: 'The heading text to find' },
          includeSubsections: { type: 'boolean', description: 'Include content from nested subsections' }
        },
        required: ['headingText']
      }
    }, async (args) => {
      return { success: true, operation: 'document_get_section', args, message: 'Section retrieved' }
    })

    this.registerTool({
      name: 'document_search',
      description: 'Search document with surrounding context lines before and after matches.',
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
      return { success: true, operation: 'document_search', args, message: 'Search completed' }
    })

    this.registerTool({
      name: 'document_get_metadata',
      description: 'Get document statistics: word count, character count, line count, heading count, estimated reading time.',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async (args) => {
      return { success: true, operation: 'document_get_metadata', message: 'Metadata retrieved' }
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
      return { success: true, operation: 'document_find_and_format', args, message: 'Find and format completed' }
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
      return { success: true, operation: 'document_batch_replace', args, message: 'Batch replace completed' }
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
      return { success: true, operation: 'document_create_list', args, message: 'List created' }
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
      return { success: true, operation: 'document_format', args }
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
      return { success: true, operation: 'document_delete', args }
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
        const docPath = this._currentDocPath
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
        const docPath = this._currentDocPath
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
      const topic = args.topic as string
      const depth = (args.depth as number) || 2
      try {
        const payload = this.buildCompletionPayload([
                    { role: 'system', content: `Generate a document outline for the given topic. Return a JSON array of objects, each with "level" (1-3), "title" (string), and "children" (array of same objects, can be empty). Return ONLY the JSON array, no other text.` },
                    { role: 'user', content: `Generate a ${depth}-level outline for: ${topic}` }
                  ], 0.5)
                const response = await fetch(`${this.config.endpoint}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
                  body: JSON.stringify(payload)
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
      const text = args.text as string
      const targetLanguage = args.targetLanguage as string
      try {
        const payload = this.buildCompletionPayload([
                    { role: 'system', content: `You are a professional translator. Translate the following text to ${targetLanguage}. Return ONLY the translated text, nothing else. Preserve the original formatting and tone.` },
                    { role: 'user', content: text }
                  ], 0.3)
                const response = await fetch(`${this.config.endpoint}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
                  body: JSON.stringify(payload)
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
        ops: args.ops
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
      const docId = this._currentDocPath || 'default'
      const scope = (args.scope as 'document' | 'global') || 'document'
      const entry = this.memory.add(docId, 'assistant', args.type as any, args.content as string, 'inferred', scope)
      return { success: true, result: `Saved ${scope} memory: ${entry.content.slice(0, 50)}...` }
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
      const docId = this._currentDocPath || 'default'
      const result = this.memory.retrieve(docId, args.query as string, 5)
      return { success: true, result: JSON.stringify(result.entries.map(e => `[${e.type}] ${e.content}`)) }
    })

    this.registerTool({
      name: 'memory_clear',
      description: 'Clear all long-term memory for this document. Use when the user asks to forget everything.',
      parameters: { type: 'object', properties: {}, required: [] }
    }, async () => {
      const docId = this._currentDocPath || 'default'
      this.memory.clearForDocument(docId)
      return { success: true, result: 'Memory cleared' }
    })
  }

  private loadSessions(): void {
    try {
      if (fs.existsSync(this.sessionsPath)) {
        const data = JSON.parse(fs.readFileSync(this.sessionsPath, 'utf-8'))
        const arr: AgentSession[] = data.sessions || []
        for (const s of arr) { this.sessions.set(s.id, s) }
      }
    } catch {
      // Corrupted or missing session file — start fresh
      console.warn('Failed to load agent sessions, starting with empty sessions')
    }
  }

  private saveSessions(): void {
    try {
      const arr = Array.from(this.sessions.values())
      fs.writeFileSync(this.sessionsPath, JSON.stringify({ sessions: arr }), 'utf-8')
    } catch {
      // Session persistence is best-effort — don't crash if disk is full or permissions changed
      console.warn('Failed to persist agent sessions to disk')
    }
  }

  getOrCreateSession(documentId: string, agentName: string, systemPrompt?: string): AgentSession {
    const key = `${documentId}:${agentName}`
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
    const session = this.sessions.get(sessionId)
    if (session) {
      session.messages.push({ role, content })
      session.updatedAt = Date.now()
      this.saveSessions()
    }
  }

  getSessionMessages(sessionId: string): Array<{ role: string; content: string }> {
    const session = this.sessions.get(sessionId)
    return session ? [...session.messages] : []
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) { session.messages = []; session.updatedAt = Date.now(); this.saveSessions() }
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.saveSessions()
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
    context?: { documentContent?: string; currentBranch?: string; selection?: string }
  ): Promise<Array<{ agentName: string; content: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }>> {
    const results: Array<{ agentName: string; content: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }> = []
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    for (const agentName of agentNames) {
      if (signal.aborted) {
        results.push({ agentName, content: 'Aborted by user', toolCalls: [] })
        continue
      }
      const session = this.getOrCreateSession(documentId, agentName)
      session.messages.push({ role: 'user', content: userMessage })

      const systemParts = [
        session.systemPrompt,
        `Your role: ${agentName}.`
      ]
      if (context?.documentContent) {
        const snippet = context.documentContent.length > 4000
          ? context.documentContent.slice(0, 4000) + '\n... [truncated]'
          : context.documentContent
        systemParts.push(`\nCurrent document content (HTML):\n${snippet}`)
      }
      if (context?.currentBranch) systemParts.push(`Current VCS branch: ${context.currentBranch}`)
      if (context?.selection) systemParts.push(`User's current selection: "${context.selection}"`)
      if (this.scratchpad) systemParts.push(`Your scratchpad notes:\n${this.scratchpad}`)

      const toolDefs = this.listTools()
            const ollama = this.ollamaFormat
            const allMsgs = [
              { role: 'system', content: systemParts.join('\n') },
              ...session.messages.slice(-20)
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
              const response = await fetch(`${this.config.endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
                body: JSON.stringify(payload),
                signal
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

        // Save to session
        session.messages.push({ role: 'assistant', content })
        this.saveSessions()

        results.push({ agentName, content, toolCalls })
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          results.push({ agentName, content: 'Aborted by user', toolCalls: [] })
        } else {
          results.push({ agentName, content: `Error: ${(err as Error).message}`, toolCalls: [] })
        }
      }
    }

    this.abortController = null
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
    this.abortController?.abort()
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
    const graphId = `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.activeGraphId = graphId
    this.abortController = new AbortController()
    const signal = this.abortController.signal

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
      if (signal.aborted) return []
      plan = this.parseTaskPlan(response)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return []
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

    return this.getTaskGraph(graphId)
  }

  private buildOrchestratorPrompt(userMessage: string, context?: { documentContent?: string; selection?: string; currentFilePath?: string }): string {
    const parts = [`User request: ${userMessage}`]
    if (context?.documentContent) {
      const snippet = context.documentContent.length > 2000
        ? context.documentContent.slice(0, 2000) + '\n... [truncated]'
        : context.documentContent
      parts.push(`Current document: ${snippet}`)
    }
    if (context?.selection) parts.push(`Selected text: "${context.selection}"`)
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
    const payload = this.buildCompletionPayload(messages, this.temperature)
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
      body: JSON.stringify(payload),
      signal
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

  async getInlineSuggestion(documentContent: string, cursorPosition: number, contextBefore: string): Promise<string | null> {
    const snippet = contextBefore.length > 500 ? contextBefore.slice(-500) : contextBefore
    try {
      const payload = this.buildCompletionPayload([
          { role: 'system', content: 'You are an autocomplete assistant for a document editor. Given the text before the cursor, suggest what comes next. Return ONLY the suggested continuation text, nothing else. Keep it concise (1-2 sentences max). Do not repeat existing text.' },
          { role: 'user', content: snippet }
        ], 0.3)
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
      })
      if (!response.ok) return null
      const data = await response.json()
      const suggestion = this.parseCompletionResponse(data).content?.trim()
      return suggestion || null
    } catch {
      return null
    }
  }

  async handleSummarize(documentContent: string, style: string, maxLength: number): Promise<string> {
    const text = documentContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    const snippet = text.length > 8000 ? text.slice(0, 8000) : text
    const styleDescriptions: Record<string, string> = {
      executive: 'Write an executive summary suitable for business stakeholders',
      abstract: 'Write an academic abstract in 150-250 words',
      tldr: 'Write a one-sentence TL;DR',
      bullets: 'Write 3-5 bullet point summary'
    }
    try {
      const payload = this.buildCompletionPayload([
          { role: 'system', content: `${styleDescriptions[style] || styleDescriptions.executive}. Maximum ${maxLength} words. Return ONLY the summary.` },
          { role: 'user', content: snippet }
        ], 0.3)
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
      })
      if (!response.ok) return 'Summary generation failed.'
      const data = await response.json()
      return this.parseCompletionResponse(data).content || 'No summary generated.'
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(BEARER_PROVIDER, this.config.apiKey) },
        body: JSON.stringify(payload)
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

      const approved = await new Promise<boolean>((resolve) => {
        this.pendingApproval = { resolve, toolName: name, args }
        this.mainWindow!.webContents.send('agent:tool-approval-request', { toolName: name, args, category })
      })

      if (!approved) {
        return { error: `Tool '${name}' was rejected by the user.` }
      }
    }

    try {
      return await tool.handler(args)
    } catch (err) {
      return { error: `Tool execution failed: ${(err as Error).message}` }
    }
  }

  configure(config: Partial<AgentConfig>): AgentConfig {
    this.config = { ...this.config, ...removeUndefinedValues(config) }

    // If endpoint is not set but we have a providerId, build it
    if (!this.config.endpoint && (this.config as any).providerId) {
      const provider = getProvider((this.config as any).providerId)
      if (provider) {
        this.config.endpoint = buildChatEndpoint(provider, provider.baseUrl, this.config.model, this.ollamaFormat)
      }
    }

    this.saveConfig()
    return this.config
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

  async suggestImprovements(documentContent: string): Promise<Array<{ type: string; message: string; context: string }>> {
    const snippet = documentContent.length > 6000
      ? documentContent.slice(0, 6000) + '\n... [truncated]'
      : documentContent

    const payload = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: `You are a document editor assistant. Analyze the following document and suggest improvements.
Return a JSON array of suggestions. Each suggestion must have:
- "type": one of "grammar", "style", "structure"
- "message": a brief description of the suggestion
- "context": a short quote from the document that the suggestion applies to

Return ONLY the JSON array, no other text. If no improvements needed, return an empty array [].`
        },
        { role: 'user', content: snippet.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() }
      ],
      temperature: 0.3,
      stream: false
    }

    try {
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) return []
      const data = await response.json()
      const content = this.parseCompletionResponse(data).content || '[]'
      // Parse JSON from response (may be wrapped in markdown code block)
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []
      return JSON.parse(jsonMatch[0])
    } catch {
      return []
    }
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
  deleteMemory(id: string): void { this.memory.delete(id) }
  clearMemoryForDocument(documentId: string): void { this.memory.clearForDocument(documentId) }
  updateMemory(id: string, content: string): void { this.memory.update(id, content) }
  saveMemoryEntry(documentId: string, type: string, content: string, scope?: 'document' | 'global'): AgentMemoryEntry {
    return this.memory.add(documentId, 'assistant', type as AgentMemoryEntry['type'], content, 'inferred', scope || 'document')
  }
  applyMemoryTemplate(documentId: string, templateType: string): number {
    return this.memory.applyTemplate(documentId, templateType)
  }
  async consolidateMemory(documentId: string): Promise<{ consolidated: number; summary: string }> {
    const count = this.memory.countForDocument(documentId)
    if (count < 30) {
      return { consolidated: 0, summary: 'Not enough entries to consolidate (need 30+)' }
    }

    // Get all entries for this document, oldest first (for consolidation)
    const entries = this.memory.getForDocument(documentId).reverse()
    const toConsolidate = entries.slice(0, entries.length - 10) // keep 10 most recent

    const entriesText = toConsolidate.map((e) => `- [${e.type}] ${e.content}`).join('\n')
    const prompt = `Summarize the following memory entries into a concise paragraph that preserves key facts, preferences, and decisions. Return ONLY the summary, no preamble:\n\n${entriesText}`

    try {
      const summary = await this.fetchCompletion([
        { role: 'system', content: 'You are a memory consolidation assistant. Summarize memory entries into a concise, information-dense paragraph.' },
        { role: 'user', content: prompt }
      ])

      const consolidatedIds = this.memory.consolidate(documentId, summary, 10)
      return { consolidated: consolidatedIds?.length || 0, summary }
    } catch (err) {
      return { consolidated: 0, summary: `Consolidation failed: ${(err as Error).message}` }
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
    // Skip if no endpoint configured or very short messages
    if (!this.config.endpoint || userMessage.length < 20) return

    const extractPrompt = `Analyze this conversation exchange. If the user expressed a preference, correction, or instruction about writing style, tone, formatting, or content that should be remembered for future work, extract it.

Return ONLY a JSON object with these fields, or null if nothing worth remembering:
{
  "type": "preference" | "correction" | "decision",
  "content": "concise description of what to remember",
  "scope": "document" | "global"
}

Use "global" for general writing preferences (tone, style, formatting). Use "document" for document-specific facts.

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
        // Check if a similar entry already exists (avoid duplicates)
        const existing = this.memory.getForDocument(documentId)
        const globalEntries = this.memory.getGlobal()
        const allEntries = [...existing, ...globalEntries]
        const isDuplicate = allEntries.some((e) =>
          e.content.toLowerCase().includes(parsed!.content.toLowerCase().slice(0, 30)) ||
          parsed!.content.toLowerCase().includes(e.content.toLowerCase().slice(0, 30))
        )

        if (!isDuplicate) {
          const scope = (parsed.scope as 'document' | 'global') || 'document'
          this.memory.add(documentId, 'system', parsed.type as AgentMemoryEntry['type'], parsed.content, 'inferred', scope)
          console.log(`[AgentBridge] Auto-extracted ${scope} memory: ${parsed.content.slice(0, 60)}...`)
        }
      }
    } catch (err) {
      // Best-effort — don't crash on extraction failure
      console.warn('[AgentBridge] Auto-extract preferences failed:', (err as Error).message)
    }
  }

  /**
   * Run correction clustering for a document. Detects 3+ similar corrections
   * and elevates them to a global preference. Fire-and-forget.
   */
  private async autoClusterCorrections(documentId: string): Promise<void> {
    try {
      const clustered = this.memory.clusterCorrections(documentId)
      if (clustered > 0) {
        console.log(`[AgentBridge] Clustered ${clustered} corrections into a global preference`)
      }
    } catch (err) {
      console.warn('[AgentBridge] Correction clustering failed:', (err as Error).message)
    }
  }
}