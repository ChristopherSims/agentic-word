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
    name: 'document_insert_after_element',
    description: 'Insert content after a specific heading or paragraph',
    inputSchema: {
      type: 'object',
      properties: {
        searchText: { type: 'string', description: 'Heading or paragraph text to find' },
        content: { type: 'string', description: 'HTML content to insert' },
        elementType: { type: 'string', enum: ['paragraph', 'heading', 'bullet'], description: 'Type of element to find' }
      },
      required: ['searchText', 'content']
    }
  },
  {
    name: 'document_insert_multiple_locations',
    description: 'Atomically insert content at multiple document locations',
    inputSchema: {
      type: 'object',
      properties: {
        insertions: {
          type: 'array',
          description: 'Array of insertion objects',
          items: {
            type: 'object',
            properties: {
              position: { type: 'string', enum: ['end', 'start', 'cursor'], description: 'Position type' },
              content: { type: 'string', description: 'Content to insert' },
              afterElement: { type: 'string', description: 'Optional: insert after this element' }
            }
          }
        }
      },
      required: ['insertions']
    }
  },
  // v0.5.3: Document intelligence tools
  {
    name: 'document_search',
    description: 'Search the document text. Supports plain text or regex queries and returns matching lines with surrounding context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query or regex pattern' },
        contextLines: { type: 'number', description: 'Lines before/after match (default 2)' },
        caseSensitive: { type: 'boolean', description: 'Case sensitive search' }
      },
      required: ['query']
    }
  },
  {
    name: 'document_find_and_format',
    description: 'Atomically find text and apply formatting',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Text to find' },
        format: {
          type: 'object',
          properties: {
            bold: { type: 'boolean' },
            italic: { type: 'boolean' },
            heading: { type: 'number', enum: [1, 2, 3] },
            color: { type: 'string' }
          }
        },
        occurrence: { type: 'number', description: '1-based index, 0 = all' }
      },
      required: ['search', 'format']
    }
  },
  {
    name: 'document_batch_replace',
    description: 'Perform multiple find/replace operations atomically',
    inputSchema: {
      type: 'object',
      properties: {
        replacements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              search: { type: 'string' },
              replace: { type: 'string' }
            }
          },
          description: 'Array of find/replace pairs'
        },
        useRegex: { type: 'boolean', description: 'Use regex patterns' }
      },
      required: ['replacements']
    }
  },
  {
    name: 'document_create_list',
    description: 'Create a bullet or numbered list',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'List items' },
        type: { type: 'string', enum: ['bullet', 'ordered'], description: 'List type' },
        position: { type: 'string', enum: ['end', 'start'], description: 'Where to insert' }
      },
      required: ['items', 'type']
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

    case 'document_insert_after_element': {
      const searchText = args.searchText as string
      const content = args.content as string
      const elementType = (args.elementType as string) || 'paragraph'
      const regex = new RegExp(`(<(?:${elementType === 'heading' ? 'h[1-6]' : 'p|li'}>.*?<\\/(?:${elementType === 'heading' ? 'h[1-6]' : 'p|li'}>).*?${searchText}.*?(?:<\\/(?:${elementType === 'heading' ? 'h[1-6]' : 'p|li'}>))`,'i')
      if (regex.test(documentContent)) {
        documentContent = documentContent.replace(regex, `$&${content}`)
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Inserted after "${searchText}"` }] } })
      } else {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Element "${searchText}" not found, appending to end` }] } })
        documentContent += content
      }
      break
    }

    case 'document_insert_multiple_locations': {
      const insertions = args.insertions as Array<{ position?: string; content: string; afterElement?: string }>
      let inserted = 0
      for (const insertion of insertions) {
        const content = insertion.content
        if (insertion.afterElement) {
          const regex = new RegExp(`(<[^>]*>${insertion.afterElement}<\\/[^>]*>)`, 'i')
          if (regex.test(documentContent)) {
            documentContent = documentContent.replace(regex, `$1${content}`)
            inserted++
          }
        } else if (insertion.position === 'start') {
          documentContent = content + documentContent
          inserted++
        } else {
          documentContent += content
          inserted++
        }
      }
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Inserted at ${inserted} locations` }] } })
      break
    }

    // v0.5.3: Document intelligence tools
    case 'document_search': {
      const query = args.query as string
      const contextLines = typeof args.contextLines === 'number' ? Math.max(0, args.contextLines as number) : 2
      const caseSensitive = args.caseSensitive === true

      // Aligned with the in-app agent tool: regex with literal fallback, capped results
      let regex: RegExp
      try {
        regex = new RegExp(query, caseSensitive ? '' : 'i')
      } catch {
        regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i')
      }

      const lines = documentContent.split('\n')
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
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: results.length > 0 ? `Found ${results.length} matching line${results.length !== 1 ? 's' : ''}` : 'No matches found' }],
          matchCount: results.length,
          truncated: results.length >= MAX_RESULTS,
          results
        }
      })
      break
    }

    case 'document_find_and_format': {
      const search = args.search as string
      const format = args.format as any
      const occurrence = (args.occurrence as number) || 0
      let occurrenceCount = 0
      
      let formattedText = ''
      if (format?.bold) formattedText = `<strong>${search}</strong>`
      else if (format?.italic) formattedText = `<em>${search}</em>`
      else if (format?.heading) formattedText = `<h${format.heading}>${search}</h${format.heading}>`
      else formattedText = search
      
      if (occurrence === 0) {
        documentContent = documentContent.split(search).join(formattedText)
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Formatted all occurrences' }] } })
      } else {
        const parts = documentContent.split(search)
        if (occurrence > parts.length) {
          send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Occurrence ${occurrence} not found` } })
        } else {
          documentContent = parts.slice(0, occurrence).join(search) + formattedText + parts.slice(occurrence).join(search)
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Formatted occurrence ${occurrence}` }] } })
        }
      }
      break
    }

    case 'document_batch_replace': {
      const replacements = args.replacements as Array<{ search: string; replace: string }>
      const useRegex = args.useRegex as boolean
      let count = 0
      
      for (const { search, replace } of replacements) {
        if (useRegex) {
          const regex = new RegExp(search, 'g')
          const matches = documentContent.match(regex)
          documentContent = documentContent.replace(regex, replace)
          count += matches ? matches.length : 0
        } else {
          const occurrences = (documentContent.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
          documentContent = documentContent.split(search).join(replace)
          count += occurrences
        }
      }
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Batch replaced: ${count} total occurrences` }],
          replacementsCount: count
        }
      })
      break
    }

    case 'document_create_list': {
      const items = args.items as string[]
      const type = args.type as string
      const position = args.position as string
      
      const listHtml = type === 'bullet'
        ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`
        : `<ol>${items.map(item => `<li>${item}</li>`).join('')}</ol>`
      
      if (position === 'start') {
        documentContent = listHtml + documentContent
      } else {
        documentContent += listHtml
      }
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Created ${type} list with ${items.length} items` }],
          itemCount: items.length,
          type
        }
      })
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
