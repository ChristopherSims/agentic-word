#!/usr/bin/env node
// Lexicon MCP Server — stdio JSON-RPC 2.0
// Exposes document and VCS tools via Model Context Protocol
// Usage: node mcp-server.ts [--doc path/to/document.docx]

import * as readline from 'readline'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// Tool definitions matching MCP schema
const TOOLS = [
  {
    name: 'document_read',
    description: 'Read the current document content as HTML',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'document_replace',
    description: 'Replace text in the document',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Text to search for' },
        replace: { type: 'string', description: 'Replacement text' },
        useRegex: { type: 'boolean', description: 'Use regex for search' },
        replaceAll: { type: 'boolean', description: 'Replace all occurrences' }
      },
      required: ['search', 'replace']
    }
  },
  {
    name: 'document_insert',
    description: 'Insert content at a specific position',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'HTML content to insert' },
        position: { type: 'string', enum: ['end', 'start', 'cursor'], description: 'Where to insert' }
      },
      required: ['content', 'position']
    }
  },
  {
    name: 'document_format',
    description: 'Apply formatting to text',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bold', 'italic', 'underline', 'heading1', 'heading2', 'heading3', 'bulletList', 'orderedList'] },
        selection: { type: 'string', description: 'Text to format' }
      },
      required: ['type']
    }
  },
  {
    name: 'document_delete',
    description: 'Delete text from the document',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Text to find and delete' },
        occurrence: { type: 'number', description: 'Which occurrence (1-based), 0 = all' }
      },
      required: ['search']
    }
  },
  {
    name: 'vcs_commit',
    description: 'Create a VCS commit',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Commit message' } },
      required: ['message']
    }
  },
  {
    name: 'vcs_log',
    description: 'Show VCS commit history',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'vcs_diff',
    description: 'Show diff between versions',
    inputSchema: {
      type: 'object',
      properties: {
        fromId: { type: 'string', description: 'Source commit ID' },
        toId: { type: 'string', description: 'Target commit ID' }
      }
    }
  },
  {
    name: 'vcs_branch_list',
    description: 'List all branches',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'vcs_branch_create',
    description: 'Create a new branch',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Branch name' } },
      required: ['name']
    }
  },
  {
    name: 'scratchpad_write',
    description: 'Write to agent scratchpad',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to write' },
        append: { type: 'boolean', description: 'Append instead of replace' }
      },
      required: ['content']
    }
  },
  {
    name: 'scratchpad_read',
    description: 'Read agent scratchpad',
    inputSchema: { type: 'object', properties: {} }
  }
]

// In-memory state for the MCP server (standalone mode, no Electron)
let documentContent = ''
let scratchpadContent = ''
let vcsPath = ''

const rl = readline.createInterface({ input: process.stdin, terminal: false })

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function handleRequest(req: JsonRpcRequest): void {
  const id = req.id ?? null

  // MCP protocol methods
  if (req.method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'agentic-word-mcp', version: '0.2.3' }
      }
    })
    return
  }

  if (req.method === 'notifications/initialized') {
    // No response needed for notifications
    return
  }

  if (req.method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    return
  }

  if (req.method === 'tools/call') {
    const toolName = req.params?.name as string
    const args = (req.params?.arguments || {}) as Record<string, unknown>
    handleToolCall(id, toolName, args)
    return
  }

  if (req.method === 'resources/list') {
    send({ jsonrpc: '2.0', id, result: { resources: [] } })
    return
  }

  if (req.method === 'prompts/list') {
    send({ jsonrpc: '2.0', id, result: { prompts: [] } })
    return
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${req.method}` } })
}

function handleToolCall(id: string | number | null, name: string, args: Record<string, unknown>): void {
  switch (name) {
    case 'document_read':
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: documentContent || '(empty document)' }] } })
      break

    case 'document_replace': {
      const search = args.search as string
      const replace = args.replace as string
      const useRegex = args.useRegex as boolean
      const replaceAll = args.replaceAll as boolean
      if (useRegex) {
        const regex = new RegExp(search, replaceAll ? 'g' : '')
        documentContent = documentContent.replace(regex, replace)
      } else if (replaceAll) {
        documentContent = documentContent.split(search).join(replace)
      } else {
        documentContent = documentContent.replace(search, replace)
      }
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Replaced successfully' }] } })
      break
    }

    case 'document_insert': {
      const content = args.content as string
      const position = args.position as string
      if (position === 'start') documentContent = content + documentContent
      else documentContent += content
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Inserted successfully' }] } })
      break
    }

    case 'document_format': {
      const formatType = args.type as string
      const selection = args.selection as string | undefined
      const tags: Record<string, [string, string]> = {
        bold: ['<strong>', '</strong>'],
        italic: ['<em>', '</em>'],
        underline: ['<u>', '</u>'],
        heading1: ['<h1>', '</h1>'],
        heading2: ['<h2>', '</h2>'],
        heading3: ['<h3>', '</h3>']
      }
      const [open, close] = tags[formatType] || ['', '']
      if (open && selection) {
        documentContent = documentContent.replace(selection, `${open}${selection}${close}`)
      }
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Formatted successfully' }] } })
      break
    }

    case 'document_delete': {
      const search = args.search as string
      documentContent = documentContent.split(search).join('')
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Deleted successfully' }] } })
      break
    }

    case 'scratchpad_write': {
      const content = args.content as string
      const append = args.append as boolean
      if (append) scratchpadContent += '\n' + content
      else scratchpadContent = content
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Scratchpad updated' }] } })
      break
    }

    case 'scratchpad_read':
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: scratchpadContent || '(empty)' }] } })
      break

    case 'vcs_commit':
    case 'vcs_log':
    case 'vcs_diff':
    case 'vcs_branch_list':
    case 'vcs_branch_create':
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `${name} requires running within the Agentic Word Electron app. In MCP standalone mode, VCS operations are not available.` }] } })
      break

    default:
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } })
  }
}

rl.on('line', (line: string) => {
  try {
    const req = JSON.parse(line.trim())
    if (req.method) handleRequest(req)
  } catch { /* ignore malformed input */ }
})

rl.on('close', () => {
  process.exit(0)
})
