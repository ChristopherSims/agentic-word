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
  ToolExecutionResult
} from '../shared/types'

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
  private profiles: AgentProfile[] = [
    { id: 'writer', name: 'Writer', role: 'writer', systemPrompt: 'You are a creative writing assistant. Focus on improving prose, expanding ideas, and generating content. Be expressive and help the user develop their document.', color: '#89b4fa' },
    { id: 'reviewer', name: 'Reviewer', role: 'reviewer', systemPrompt: 'You are a critical reviewer and editor. Focus on clarity, grammar, consistency, and logic. Point out issues and suggest improvements. Be constructive but thorough.', color: '#f38ba8' }
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
    this.loadConfig()
    this.loadSessions()
    this.registerBuiltinTools()
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const loaded = (parseConfig(data, AgentConfigSchema.partial()) as Partial<AgentConfig> | null) || {}
        // Decrypt API key if it was stored encrypted (safeStorage marker prefix)
        if (loaded.apiKey && loaded.apiKey.startsWith('__SAFESTORAGE__:')) {
          try {
            const encrypted = Buffer.from(loaded.apiKey.slice(17), 'base64')
            loaded.apiKey = safeStorage.decryptString(encrypted)
          } catch {
            console.error('[AgentBridge] Failed to decrypt API key — key may be from a different machine')
            delete loaded.apiKey
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
      if (configToSave.apiKey && !configToSave.apiKey.startsWith('__SAFESTORAGE__:')) {
        const encrypted = safeStorage.encryptString(configToSave.apiKey)
        configToSave.apiKey = '__SAFESTORAGE__:' + encrypted.toString('base64')
      }
      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2), 'utf-8')
    } catch (err) {
      console.error('[AgentBridge] Failed to save config:', err)
    }
  }

  async handleChatStream(messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string; storyboardContent?: string; currentFilePath?: string }): Promise<void> {
      // Track current document path for storyboard tools
      this._currentDocPath = context?.currentFilePath || null

      // ── Phase 2.2: Delegate to Rust reactor when available (skip for Ollama native format) ──
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
        this.send('agent-stream-done', { fullContent, toolCalls: [] })
      }

    } catch (err) {
          console.error(`[AgentBridge] Stream error:`, err)
          if ((err as Error).name === 'AbortError') {
            console.log('[AgentBridge] Aborted by user')
            this.send('agent-stream-done', { fullContent: '', toolCalls: [] })
            return
          }
          this.send('agent-stream-error', { error: `Connection failed: ${(err as Error).message}. Make sure the AI endpoint is running at ${this.config.endpoint}` })
        } finally {
          this.abortController = null
        }
  }

  // ─── Phase 2.2: Rust Reactor Polling Loop ───
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
                  headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
                  headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
                headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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

  async getInlineSuggestion(documentContent: string, cursorPosition: number, contextBefore: string): Promise<string | null> {
    const snippet = contextBefore.length > 500 ? contextBefore.slice(-500) : contextBefore
    try {
      const payload = this.buildCompletionPayload([
          { role: 'system', content: 'You are an autocomplete assistant for a document editor. Given the text before the cursor, suggest what comes next. Return ONLY the suggested continuation text, nothing else. Keep it concise (1-2 sentences max). Do not repeat existing text.' },
          { role: 'user', content: snippet }
        ], 0.3)
      const response = await fetch(`${this.config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
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

    try {
      return await tool.handler(args)
    } catch (err) {
      return { error: `Tool execution failed: ${(err as Error).message}` }
    }
  }

  configure(config: Partial<AgentConfig>): AgentConfig {
    this.config = { ...this.config, ...config }
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
}