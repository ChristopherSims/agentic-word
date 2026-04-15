import { VcsEngine } from './vcs-engine'
import { DocumentStore } from './document-store'
import { BrowserWindow } from 'electron'

// Hermes Agent ACP-compatible tool interface
// Tools are described in the format Hermes expects for tool registration

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
}

interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  enum?: string[]
}

interface AgentConfig {
  endpoint: string
  apiKey: string
  model: string
}

interface AgentPreset {
  id: string
  name: string
  endpoint: string
  apiKey: string
  model: string
}

export class AgentBridge {
  private vcs: VcsEngine
  private docStore: DocumentStore
  private mainWindow: BrowserWindow | null = null
  private config: AgentConfig = {
    endpoint: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'hermes3'
  }
  private presets: AgentPreset[] = []
  private scratchpad: string = ''
  private abortController: AbortController | null = null

  // Tool registry — Hermes ACP-compatible definitions
  private tools: Map<string, { definition: ToolDefinition; handler: (args: Record<string, unknown>) => Promise<unknown> }> = new Map()

  constructor(vcs: VcsEngine, docStore: DocumentStore) {
    this.vcs = vcs
    this.docStore = docStore
    this.registerBuiltinTools()
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  // ─── Streaming Chat ───

  async handleChatStream(messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string }): Promise<void> {
    this.abortController = new AbortController()
    const toolDefs = this.listTools()

    const systemParts = [
      `You are a document editing assistant integrated into Agentic Word. You can edit the document using the tools provided. Available tools: ${toolDefs.map((t) => t.name).join(', ')}. Always use tools to make changes rather than describing them. When the user asks you to edit the document, call the appropriate tool.`
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
    if (this.scratchpad) {
      systemParts.push(`Your scratchpad notes:\n${this.scratchpad}`)
    }

    const payload = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemParts.join('\n') },
        ...messages
      ],
      tools: toolDefs.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })),
      tool_choice: 'auto',
      stream: true
    }

    try {
      const response = await fetch(`${this.config.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      })

      if (!response.ok) {
        const text = await response.text()
        this.send('agent-stream-error', { error: `API request failed (${response.status}): ${text}` })
        return
      }

      if (!response.body) {
        this.send('agent-stream-error', { error: 'No response body — streaming not supported by this endpoint' })
        return
      }

      // Parse SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let toolCalls: Array<{ id: string; name: string; arguments: string }> = []
      let inToolCall = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            // Content token
            if (delta.content) {
              fullContent += delta.content
              this.send('agent-stream-token', { token: delta.content, fullContent })
            }

            // Tool call deltas
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.id) {
                  // New tool call starting
                  toolCalls.push({ id: tc.id, name: tc.function?.name || '', arguments: tc.function?.arguments || '' })
                  inToolCall = true
                } else if (tc.function?.arguments && toolCalls.length > 0) {
                  // Continuing arguments
                  toolCalls[toolCalls.length - 1].arguments += tc.function.arguments
                }
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }

      // Stream finished — emit complete event
      this.send('agent-stream-done', { fullContent, toolCalls })

      // If tool calls were made, execute them and do follow-up
      if (toolCalls.length > 0) {
        const results = []
        for (const tc of toolCalls) {
          let toolArgs: Record<string, unknown>
          try {
            toolArgs = JSON.parse(tc.arguments)
          } catch {
            toolArgs = {}
          }
          const result = await this.executeTool(tc.name, toolArgs)
          results.push({ toolCallId: tc.id, toolName: tc.name, result })
        }

        this.send('agent-tool-results', { toolCalls: results })

        // Multi-turn: send tool results back and continue the conversation
        await this.handleMultiTurn(messages, fullContent, results)
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.send('agent-stream-done', { fullContent: '', toolCalls: [] })
        return
      }
      this.send('agent-stream-error', { error: `Connection failed: ${(err as Error).message}. Make sure the AI endpoint is running at ${this.config.endpoint}` })
    } finally {
      this.abortController = null
    }
  }

  // ─── Multi-turn Tool Chains ───

  private async handleMultiTurn(
    originalMessages: Array<{ role: string; content: string }>,
    assistantContent: string,
    toolResults: Array<{ toolCallId: string; toolName: string; result: unknown }>
  ): Promise<void> {
    const MAX_TURNS = 5
    let messages = [...originalMessages]
    let currentAssistantContent = assistantContent
    let currentToolResults = toolResults

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Build follow-up messages with tool results
      const toolMessages = currentToolResults.map((tr) => ({
        role: 'tool' as const,
        content: JSON.stringify(tr.result),
        tool_call_id: tr.toolCallId
      }))

      const followUpMessages = [
        ...messages,
        { role: 'assistant' as const, content: currentAssistantContent || '', tool_calls: currentToolResults.map((tr) => ({
          id: tr.toolCallId,
          type: 'function',
          function: { name: tr.toolName, arguments: JSON.stringify(tr.result) }
        }))},
        ...toolMessages
      ]

      const toolDefs = this.listTools()
      const payload = {
        model: this.config.model,
        messages: followUpMessages,
        tools: toolDefs.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters }
        })),
        tool_choice: 'auto',
        stream: true
      }

      try {
        const response = await fetch(`${this.config.endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
          },
          body: JSON.stringify(payload)
        })

        if (!response.ok) break

        // Parse as non-streaming for follow-up (simpler)
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
            const toolArgs = JSON.parse(tc.function.arguments)
            const result = await this.executeTool(tc.function.name, toolArgs)
            results.push({ toolCallId: tc.id, toolName: tc.function.name, result })
          }
          this.send('agent-tool-results', { toolCalls: results, turn: turn + 1 })

          // Continue the chain
          messages = [...messages, { role: 'user', content: '' }]
          currentAssistantContent = followUpContent
          currentToolResults = results
        } else {
          // No more tool calls — chain complete
          this.send('agent-stream-done', { fullContent: followUpContent, toolCalls: [], chainComplete: true })
          break
        }
      } catch {
        break
      }
    }

    this.send('agent-chain-complete', { turns: MAX_TURNS })
  }

  // ─── Abort ───

  abortStream(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  // ─── Presets ───

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

  // ─── Scratchpad ───

  getScratchpad(): string {
    return this.scratchpad
  }

  setScratchpad(content: string): void {
    this.scratchpad = content
  }

  // ─── Non-streaming chat (fallback) ───

  async handleChat(messages: Array<{ role: string; content: string }>): Promise<unknown> {
    const toolDefs = this.listTools()

    const payload = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: `You are a document editing assistant integrated into Agentic Word. You can edit the document using the tools provided. Available tools: ${toolDefs.map((t) => t.name).join(', ')}. Always use tools to make changes rather than describing them. When the user asks you to edit the document, call the appropriate tool.`
        },
        ...messages
      ],
      tools: toolDefs.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })),
      tool_choice: 'auto'
    }

    try {
      const response = await fetch(`${this.config.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const text = await response.text()
        return { error: `API request failed (${response.status}): ${text}` }
      }

      const data = await response.json()
      const choice = data.choices?.[0]

      if (choice?.message?.tool_calls) {
        const results = []
        for (const toolCall of choice.message.tool_calls) {
          const toolName = toolCall.function.name
          const toolArgs = JSON.parse(toolCall.function.arguments)
          const result = await this.executeTool(toolName, toolArgs)
          results.push({ toolCallId: toolCall.id, toolName, result })
        }

        return {
          role: 'assistant',
          content: choice.message.content || null,
          toolCalls: results,
          needsFollowUp: true
        }
      }

      return {
        role: 'assistant',
        content: choice?.message?.content || 'No response generated.',
        toolCalls: [],
        needsFollowUp: false
      }
    } catch (err) {
      return { error: `Connection failed: ${(err as Error).message}. Make sure the AI endpoint is running at ${this.config.endpoint}` }
    }
  }

  // ─── Tool Registry ───

  private registerBuiltinTools(): void {
    this.registerTool({
      name: 'document_read',
      description: 'Read the current document content as HTML',
      parameters: {}
    }, async () => {
      return { content: 'Current document content would be sent from renderer' }
    })

    this.registerTool({
      name: 'document_replace',
      description: 'Replace text in the document. Supports find/replace with optional regex.',
      parameters: {
        search: { type: 'string', description: 'Text to search for', required: true },
        replace: { type: 'string', description: 'Replacement text', required: true },
        useRegex: { type: 'boolean', description: 'Use regex for search', required: false },
       replaceAll: { type: 'boolean', description: 'Replace all occurrences', required: false }
      }
    }, async (args) => {
      return { success: true, operation: 'document_replace', args }
    })

    this.registerTool({
      name: 'document_insert',
      description: 'Insert content at a specific position in the document',
      parameters: {
        content: { type: 'string', description: 'HTML content to insert', required: true },
        position: { type: 'string', description: 'Where to insert: "end", "start", or "cursor"', required: true, enum: ['end', 'start', 'cursor'] }
      }
    }, async (args) => {
      return { success: true, operation: 'document_insert', args }
    })

    this.registerTool({
      name: 'document_format',
      description: 'Apply formatting to selected text or the whole document',
      parameters: {
        type: { type: 'string', description: 'Format type to apply', required: true, enum: ['bold', 'italic', 'underline', 'heading1', 'heading2', 'heading3', 'bulletList', 'orderedList'] },
        selection: { type: 'string', description: 'Text to format (finds and formats it)', required: false }
      }
    }, async (args) => {
      return { success: true, operation: 'document_format', args }
    })

    this.registerTool({
      name: 'document_delete',
      description: 'Delete a range of text from the document',
      parameters: {
        search: { type: 'string', description: 'Text to find and delete', required: true },
        occurrence: { type: 'number', description: 'Which occurrence to delete (1-based), 0 = all', required: false }
      }
    }, async (args) => {
      return { success: true, operation: 'document_delete', args }
    })

    // Scratchpad tool
    this.registerTool({
      name: 'scratchpad_write',
      description: 'Write notes to your private scratchpad. These notes persist across conversations and are included in your context for future responses.',
      parameters: {
        content: { type: 'string', description: 'Content to write to the scratchpad', required: true },
        append: { type: 'boolean', description: 'Append to existing content instead of replacing', required: false }
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
      parameters: {}
    }, async () => {
      return { content: this.scratchpad || '(empty)' }
    })

    // VCS tools
    this.registerTool({
      name: 'vcs_commit',
      description: 'Create a version control commit with the current document state',
      parameters: {
        message: { type: 'string', description: 'Commit message', required: true }
      }
    }, async (args) => {
      const message = args.message as string
      return { success: true, operation: 'vcs_commit', message }
    })

    this.registerTool({
      name: 'vcs_log',
      description: 'Show version control commit history',
      parameters: {}
    }, async () => {
      return this.vcs.log()
    })

    this.registerTool({
      name: 'vcs_diff',
      description: 'Show differences between document versions',
      parameters: {
        fromId: { type: 'string', description: 'Source commit ID (omit for previous)', required: false },
        toId: { type: 'string', description: 'Target commit ID (omit for current)', required: false }
      }
    }, async (args) => {
      return this.vcs.diff(args.fromId as string | undefined, args.toId as string | undefined)
    })

    this.registerTool({
      name: 'vcs_revert',
      description: 'Revert document to a previous commit',
      parameters: {
        commitId: { type: 'string', description: 'Commit ID to revert to', required: true }
      }
    }, async (args) => {
      const content = this.vcs.revert(args.commitId as string)
      return { success: !!content, content, commitId: args.commitId }
    })

    this.registerTool({
      name: 'vcs_branch_create',
      description: 'Create a new branch for parallel editing',
      parameters: {
        name: { type: 'string', description: 'Branch name', required: true }
      }
    }, async (args) => {
      const branch = await this.vcs.createBranch(args.name as string)
      return { success: true, branch }
    })

    this.registerTool({
      name: 'vcs_branch_switch',
      description: 'Switch to a different branch',
      parameters: {
        name: { type: 'string', description: 'Branch name to switch to', required: true }
      }
    }, async (args) => {
      const success = await this.vcs.switchBranch(args.name as string)
      return { success, branch: args.name }
    })

    this.registerTool({
      name: 'vcs_branch_list',
      description: 'List all branches',
      parameters: {}
    }, async () => {
      return this.vcs.listBranches()
    })
  }

  registerTool(definition: ToolDefinition, handler: (args: Record<string, unknown>) => Promise<unknown>): void {
    this.tools.set(definition.name, { definition, handler })
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
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
    return this.config
  }

  getConfig(): AgentConfig {
    return { ...this.config }
  }

  getAcpManifest(): object {
    return {
      name: 'wordapp',
      version: '0.2.2',
      description: 'Agentic Word DOCX Editor with version control',
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

  private send(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}
