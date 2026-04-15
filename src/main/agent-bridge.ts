import { VcsEngine } from './vcs-engine'
import { DocumentStore } from './document-store'

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

export class AgentBridge {
  private vcs: VcsEngine
  private docStore: DocumentStore
  private config: AgentConfig = {
    endpoint: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'hermes3'
  }

  // Tool registry — Hermes ACP-compatible definitions
  private tools: Map<string, { definition: ToolDefinition; handler: (args: Record<string, unknown>) => Promise<unknown> }> = new Map()

  constructor(vcs: VcsEngine, docStore: DocumentStore) {
    this.vcs = vcs
    this.docStore = docStore
    this.registerBuiltinTools()
  }

  private registerBuiltinTools(): void {
    // Document tools
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

    // VCS tools
    this.registerTool({
      name: 'vcs_commit',
      description: 'Create a version control commit with the current document state',
      parameters: {
        message: { type: 'string', description: 'Commit message', required: true }
      }
    }, async (args) => {
      const message = args.message as string
      // Content comes from renderer via IPC
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

  async handleChat(messages: Array<{ role: string; content: string }>): Promise<unknown> {
    const toolDefs = this.listTools()

    // Build the request in Hermes/OpenAI-compatible format with tool definitions
    const payload = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: `You are a document editing assistant integrated into WordApp. You can edit the document using the tools provided. Available tools: ${toolDefs.map((t) => t.name).join(', ')}. Always use tools to make changes rather than describing them. When the user asks you to edit the document, call the appropriate tool.`
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

      // If the model wants to call tools, execute them
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

  configure(config: Partial<AgentConfig>): AgentConfig {
    this.config = { ...this.config, ...config }
    return this.config
  }

  getConfig(): AgentConfig {
    return { ...this.config }
  }

  // Generate ACP manifest for Hermes Agent discovery
  getAcpManifest(): object {
    return {
      name: 'wordapp',
      version: '0.1.0',
      description: 'WordApp DOCX Editor with version control',
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
}
