import { VcsEngine } from './vcs-engine'
import { DocumentStore } from './document-store'
import { BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

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
    endpoint: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'hermes3'
  }
  private presets: AgentPreset[] = []
  private scratchpad: string = ''
  private maxToolTurns: number = 5
  private temperature: number = 0.7
  private abortController: AbortController | null = null

  private sessions: Map<string, AgentSession> = new Map()
  private profiles: AgentProfile[] = [
    { id: 'writer', name: 'Writer', role: 'writer', systemPrompt: 'You are a creative writing assistant. Focus on improving prose, expanding ideas, and generating content. Be expressive and help the user develop their document.', color: '#89b4fa' },
    { id: 'reviewer', name: 'Reviewer', role: 'reviewer', systemPrompt: 'You are a critical reviewer and editor. Focus on clarity, grammar, consistency, and logic. Point out issues and suggest improvements. Be constructive but thorough.', color: '#f38ba8' }
  ]
  private sessionsPath: string

  // Tool registry — Hermes ACP-compatible definitions
  private tools: Map<string, { definition: ToolDefinition; handler: (args: Record<string, unknown>) => Promise<ToolExecutionResult> }> = new Map()

  constructor(vcs: VcsEngine, docStore: DocumentStore) {
    this.vcs = vcs
    this.docStore = docStore
    this.sessionsPath = path.join(app.getPath('userData'), 'agent-sessions.json')
    this.loadSessions()
    this.registerBuiltinTools()
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

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
      temperature: this.temperature,
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

      // SSE: each line is "data: {json}" or "data: [DONE]"
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

          // SSE stream chunks may be partial/malformed — skip unparseable lines
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
            // AI model may return malformed JSON for tool arguments — log and use empty args
            console.warn(`Malformed tool arguments for ${tc.name}: ${tc.arguments.slice(0, 100)}`)
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

  // Implements the OpenAI tool-use loop: after the model calls a tool, its result
  // is fed back so the model can decide whether to call another tool or respond.
  private async handleMultiTurn(
    originalMessages: Array<{ role: string; content: string }>,
    assistantContent: string,
    toolResults: Array<{ toolCallId: string; toolName: string; result: ToolExecutionResult }>
  ): Promise<void> {
    const MAX_TURNS = this.maxToolTurns
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
        temperature: this.temperature,
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
      } catch (err) {
        // Network or parsing error in multi-turn chain — stop the chain and report
        console.warn(`Multi-turn chain error at turn ${turn + 1}: ${(err as Error).message}`)
        break
      }
    }

    this.send('agent-chain-complete', { turns: MAX_TURNS })
  }

  abortStream(): void {
    this.abortController?.abort()
    this.abortController = null
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

    this.registerTool({
      name: 'web_search',
      description: 'Search the web for information. Returns search results with titles, URLs, and snippets that can be cited in the document.',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        maxResults: { type: 'number', description: 'Maximum number of results (default 5)', required: false }
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
      name: 'outline_generate',
      description: 'Generate a document outline/structure from a topic. Returns a hierarchical outline with headings and subheadings.',
      parameters: {
        topic: { type: 'string', description: 'Topic or subject for the outline', required: true },
        depth: { type: 'number', description: 'Outline depth: 1=main headings only, 2=subheadings, 3=sub-subheadings (default 2)', required: false }
      }
    }, async (args) => {
      const topic = args.topic as string
      const depth = (args.depth as number) || 2
      try {
        const payload = {
          model: this.config.model,
          messages: [
            { role: 'system', content: `Generate a document outline for the given topic. Return a JSON array of objects, each with "level" (1-3), "title" (string), and "children" (array of same objects, can be empty). Return ONLY the JSON array, no other text.` },
            { role: 'user', content: `Generate a ${depth}-level outline for: ${topic}` }
          ],
          temperature: 0.5,
          stream: false
        }
        const response = await fetch(`${this.config.endpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
          body: JSON.stringify(payload)
        })
        if (!response.ok) return { error: 'Outline generation failed' }
        const data = await response.json() as ChatCompletionResponse
        const content = data.choices?.[0]?.message?.content || '[]'
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
        style: { type: 'string', description: 'Summary style', required: true, enum: ['executive', 'abstract', 'tldr', 'bullets'] },
        maxLength: { type: 'number', description: 'Maximum length in words (default 200)', required: false }
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
        text: { type: 'string', description: 'Text to translate', required: true },
        targetLanguage: { type: 'string', description: 'Target language (e.g. "Spanish", "French", "Japanese")', required: true }
      }
    }, async (args) => {
      const text = args.text as string
      const targetLanguage = args.targetLanguage as string
      try {
        const payload = {
          model: this.config.model,
          messages: [
            { role: 'system', content: `You are a professional translator. Translate the following text to ${targetLanguage}. Return ONLY the translated text, nothing else. Preserve the original formatting and tone.` },
            { role: 'user', content: text }
          ],
          temperature: 0.3,
          stream: false
        }
        const response = await fetch(`${this.config.endpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
          body: JSON.stringify(payload)
        })
        if (!response.ok) return { error: 'Translation failed' }
        const data = await response.json() as ChatCompletionResponse
        const translated = data.choices?.[0]?.message?.content || ''
        return { original: text, translated, targetLanguage }
      } catch (err) {
        return { error: `Translation failed: ${(err as Error).message}` }
      }
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

    for (const agentName of agentNames) {
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
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemParts.join('\n') },
          ...session.messages.slice(-20) // Last 20 messages for context window
        ],
        tools: toolDefs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
        temperature: this.temperature,
        stream: false
      }

      try {
        const response = await fetch(`${this.config.endpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          results.push({ agentName, content: `Error: HTTP ${response.status}`, toolCalls: [] })
          continue
        }

        const data = await response.json() as ChatCompletionResponse
        const choice = data.choices?.[0]
        const content = choice?.message?.content || 'No response'
        const toolCalls = choice?.message?.tool_calls || []

        // Save to session
        session.messages.push({ role: 'assistant', content })
        this.saveSessions()

        results.push({ agentName, content, toolCalls })
      } catch (err) {
        results.push({ agentName, content: `Error: ${(err as Error).message}`, toolCalls: [] })
      }
    }

    return results
  }

  async getInlineSuggestion(documentContent: string, cursorPosition: number, contextBefore: string): Promise<string | null> {
    const snippet = contextBefore.length > 500 ? contextBefore.slice(-500) : contextBefore
    try {
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: 'You are an autocomplete assistant for a document editor. Given the text before the cursor, suggest what comes next. Return ONLY the suggested continuation text, nothing else. Keep it concise (1-2 sentences max). Do not repeat existing text.' },
          { role: 'user', content: snippet }
        ],
        temperature: 0.3,
        max_tokens: 80,
        stream: false
      }
      const response = await fetch(`${this.config.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify(payload)
      })
      if (!response.ok) return null
      const data = await response.json() as ChatCompletionResponse
      const suggestion = data.choices?.[0]?.message?.content?.trim()
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
      const payload = {
        model: this.config.model,
        messages: [
          { role: 'system', content: `${styleDescriptions[style] || styleDescriptions.executive}. Maximum ${maxLength} words. Return ONLY the summary.` },
          { role: 'user', content: snippet }
        ],
        temperature: 0.3,
        stream: false
      }
      const response = await fetch(`${this.config.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify(payload)
      })
      if (!response.ok) return 'Summary generation failed.'
      const data = await response.json() as ChatCompletionResponse
      return data.choices?.[0]?.message?.content || 'No summary generated.'
    } catch (err) {
      return `Summary failed: ${(err as Error).message}`
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
    return this.config
  }

  configureAdvanced(opts: { maxToolTurns?: number; temperature?: number }): void {
    if (opts.maxToolTurns !== undefined) this.maxToolTurns = opts.maxToolTurns
    if (opts.temperature !== undefined) this.temperature = opts.temperature
  }

  getMaxToolTurns(): number { return this.maxToolTurns }
  getTemperature(): number { return this.temperature }

  getConfig(): AgentConfig {
    return { ...this.config }
  }

  getAcpManifest(): { name: string; version: string; description: string; capabilities: { tools: ToolDefinition[] }; protocol: string } {
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
      const response = await fetch(`${this.config.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) return []
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '[]'
      // Parse JSON from response (may be wrapped in markdown code block)
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []
      return JSON.parse(jsonMatch[0])
    } catch {
      return []
    }
  }
}
