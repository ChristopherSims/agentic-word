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

interface StreamingSession {
  id: string
  buffer: string
  position: 'start' | 'end' | 'cursor' | 'after-element'
  createdAt: number
  lastChunkAt: number
  format?: { bold?: boolean; italic?: boolean; heading?: 1 | 2 | 3 }
  searchText?: string // For replace_stream mode
  elementSearchText?: string // For after-element positioning
  chunks: number
  validationResults?: Array<{ type: string; message: string }>
}

interface LastStreamOperation {
  sessionId: string
  content: string
  position: string
  appliedAt: number
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
    name: 'document_insert_stream_start',
    description: 'Start a streaming insertion session for real-time text insertion',
    inputSchema: {
      type: 'object',
      properties: {
        position: { type: 'string', enum: ['end', 'start', 'cursor'], description: 'Where to insert' }
      },
      required: ['position']
    }
  },
  {
    name: 'document_insert_stream_chunk',
    description: 'Send a chunk of text during streaming insertion',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Stream session ID from document_insert_stream_start' },
        chunk: { type: 'string', description: 'Text chunk to append to stream' }
      },
      required: ['sessionId', 'chunk']
    }
  },
  {
    name: 'document_insert_stream_end',
    description: 'Finalize a streaming insertion session and apply all accumulated text',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Stream session ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'document_insert_stream_cancel',
    description: 'Cancel an ongoing streaming insertion session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Stream session ID' }
      },
      required: ['sessionId']
    }
  },
  // v0.5.3: Advanced streaming tools
  {
    name: 'document_insert_stream_with_format',
    description: 'Send a text chunk with inline formatting during streaming insertion',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Stream session ID' },
        chunk: { type: 'string', description: 'Text to insert' },
        format: {
          type: 'object',
          properties: {
            bold: { type: 'boolean' },
            italic: { type: 'boolean' },
            heading: { type: 'number', enum: [1, 2, 3] }
          }
        }
      },
      required: ['sessionId', 'chunk']
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
    name: 'document_insert_stream_status',
    description: 'Get the current status of an active streaming session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Stream session ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'document_replace_stream',
    description: 'Start a streaming replacement session (finds and replaces with streamed text)',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Text to find and replace' }
      },
      required: ['search']
    }
  },
  {
    name: 'document_insert_stream_preview',
    description: 'Preview the accumulated buffer of an active stream without finalizing',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Stream session ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'document_undo_last_stream',
    description: 'Undo the last finalized stream insertion',
    inputSchema: {
      type: 'object',
      properties: {}
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
  {
    name: 'content_validate_stream',
    description: 'Validate streaming content against quality criteria',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Stream session ID' },
        checks: {
          type: 'array',
          items: { type: 'string', enum: ['grammar', 'tone', 'length', 'plagiarism'] },
          description: 'Validation checks to run'
        }
      },
      required: ['sessionId']
    }
  },
  // v0.5.3: Document intelligence tools
  {
    name: 'document_get_structure',
    description: 'Extract document outline/table of contents with heading hierarchy',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'document_get_section',
    description: 'Get all content within a specific heading section',
    inputSchema: {
      type: 'object',
      properties: {
        headingText: { type: 'string', description: 'Heading text to find' },
        includeSubsections: { type: 'boolean', description: 'Include nested subsections' }
      },
      required: ['headingText']
    }
  },
  {
    name: 'document_search',
    description: 'Search document with surrounding context',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query/pattern' },
        contextLines: { type: 'number', description: 'Lines before/after match (default 2)' },
        caseSensitive: { type: 'boolean', description: 'Case sensitive search' }
      },
      required: ['query']
    }
  },
  {
    name: 'document_get_metadata',
    description: 'Get document statistics and metadata',
    inputSchema: { type: 'object', properties: {} }
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
const streamingSessions = new Map<string, StreamingSession>()
let lastStreamOperation: LastStreamOperation | null = null

const rl = readline.createInterface({ input: process.stdin, terminal: false })

function generateSessionId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

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

    case 'document_insert_stream_start': {
      const position = args.position as string
      const sessionId = generateSessionId()
      streamingSessions.set(sessionId, {
        id: sessionId,
        buffer: '',
        position: position as 'start' | 'end' | 'cursor',
        createdAt: Date.now(),
        lastChunkAt: Date.now()
      })
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Streaming session started: ${sessionId}` }], sessionId } })
      break
    }

    case 'document_insert_stream_chunk': {
      const sessionId = args.sessionId as string
      const chunk = args.chunk as string
      const session = streamingSessions.get(sessionId)
      if (!session) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session ID: ${sessionId}` } })
        break
      }
      session.buffer += chunk
      session.lastChunkAt = Date.now()
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Chunk received (${chunk.length} bytes, total: ${session.buffer.length} bytes)` }], chunkSize: chunk.length, totalSize: session.buffer.length } })
      break
    }

    case 'document_insert_stream_end': {
      const sessionId = args.sessionId as string
      const session = streamingSessions.get(sessionId)
      if (!session) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session ID: ${sessionId}` } })
        break
      }
      const content = session.buffer
      if (session.position === 'start') {
        documentContent = content + documentContent
      } else {
        documentContent += content
      }
      streamingSessions.delete(sessionId)
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Stream completed and applied (${content.length} bytes inserted)` }], totalInserted: content.length } })
      break
    }

    case 'document_insert_stream_cancel': {
      const sessionId = args.sessionId as string
      const session = streamingSessions.get(sessionId)
      if (!session) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session ID: ${sessionId}` } })
        break
      }
      streamingSessions.delete(sessionId)
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Stream cancelled (${session.buffer.length} bytes discarded)` }] } })
      break
    }

    // v0.5.3: Advanced streaming tools
    case 'document_insert_stream_with_format': {
      const sessionId = args.sessionId as string
      const chunk = args.chunk as string
      const format = args.format as any
      const session = streamingSessions.get(sessionId)
      if (!session) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session ID: ${sessionId}` } })
        break
      }
      let formattedChunk = chunk
      if (format?.bold) formattedChunk = `<strong>${formattedChunk}</strong>`
      if (format?.italic) formattedChunk = `<em>${formattedChunk}</em>`
      if (format?.heading) formattedChunk = `<h${format.heading}>${formattedChunk}</h${format.heading}>`
      session.buffer += formattedChunk
      session.format = format
      session.chunks += 1
      session.lastChunkAt = Date.now()
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Formatted chunk received (${chunk.length} bytes)` }] } })
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

    case 'document_insert_stream_status': {
      const sessionId = args.sessionId as string
      const session = streamingSessions.get(sessionId)
      if (!session) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session ID: ${sessionId}` } })
        break
      }
      const wordCount = session.buffer.split(/\s+/).filter(w => w.length > 0).length
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{
            type: 'text',
            text: `Stream status: ${session.chunks} chunks, ${session.buffer.length} bytes, ${wordCount} words, position: ${session.position}`
          }],
          sessionStatus: {
            bufferedBytes: session.buffer.length,
            chunksReceived: session.chunks,
            wordCount,
            elapsedMs: Date.now() - session.createdAt,
            position: session.position,
            lastChunkAt: session.lastChunkAt
          }
        }
      })
      break
    }

    case 'document_replace_stream': {
      const search = args.search as string
      const sessionId = generateSessionId()
      streamingSessions.set(sessionId, {
        id: sessionId,
        buffer: '',
        position: 'start',
        createdAt: Date.now(),
        lastChunkAt: Date.now(),
        chunks: 0,
        searchText: search
      })
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Replace stream created for "${search}"` }], sessionId } })
      break
    }

    case 'document_insert_stream_preview': {
      const sessionId = args.sessionId as string
      const session = streamingSessions.get(sessionId)
      if (!session) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session ID: ${sessionId}` } })
        break
      }
      const preview = session.buffer.substring(0, 200) + (session.buffer.length > 200 ? '...' : '')
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Preview: ${preview}` }],
          preview: session.buffer,
          byteCount: session.buffer.length,
          wordCount: session.buffer.split(/\s+/).filter(w => w.length > 0).length
        }
      })
      break
    }

    case 'document_undo_last_stream': {
      if (!lastStreamOperation) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'No stream operation to undo' }] } })
        break
      }
      documentContent = documentContent.replace(lastStreamOperation.content, '')
      const undoneContent = lastStreamOperation.content
      lastStreamOperation = null
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Undone: removed ${undoneContent.length} bytes` }] } })
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

    case 'content_validate_stream': {
      const sessionId = args.sessionId as string
      const checks = (args.checks as string[]) || ['grammar', 'tone']
      const session = streamingSessions.get(sessionId)
      if (!session) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid session ID: ${sessionId}` } })
        break
      }
      const warnings: Array<{ type: string; message: string }> = []
      if (checks.includes('length') && session.buffer.length > 5000) {
        warnings.push({ type: 'length', message: 'Content exceeds 5000 bytes' })
      }
      if (checks.includes('tone') && session.buffer.match(/!!!|???/g)) {
        warnings.push({ type: 'tone', message: 'Multiple exclamation or question marks detected' })
      }
      const wordCount = session.buffer.split(/\s+/).filter(w => w.length > 0).length
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Validation complete: ${warnings.length} warnings` }],
          valid: warnings.length === 0,
          warnings,
          stats: { wordCount, characterCount: session.buffer.length, readingLevel: 'N/A' }
        }
      })
      break
    }

    // v0.5.3: Document intelligence tools
    case 'document_get_structure': {
      const headings: Array<{ level: number; heading: string; position: number }> = []
      const headingRegex = /<h([1-6])>([^<]+)<\/h\1>/gi
      let match
      while ((match = headingRegex.exec(documentContent))) {
        headings.push({
          level: parseInt(match[1]),
          heading: match[2],
          position: match.index
        })
      }
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Document structure: ${headings.length} headings` }],
          structure: headings
        }
      })
      break
    }

    case 'document_get_section': {
      const headingText = args.headingText as string
      const includeSubsections = args.includeSubsections as boolean
      const regex = new RegExp(`<h([1-6])>\\s*${headingText}\\s*<\/h\\1>([\\s\\S]*?)(?=<h[1-${includeSubsections ? '6' : '1'}]>|$)`, 'i')
      const match = regex.exec(documentContent)
      if (match) {
        const content = match[2]
        send({
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: `Section "${headingText}": ${content.length} bytes` }],
            section: {
              heading: headingText,
              content: content.substring(0, 5000),
              position: match.index,
              length: content.length
            }
          }
        })
      } else {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Section "${headingText}" not found` }] } })
      }
      break
    }

    case 'document_search': {
      const query = args.query as string
      const contextLines = (args.contextLines as number) || 2
      const caseSensitive = args.caseSensitive as boolean
      const regex = new RegExp(query, caseSensitive ? 'g' : 'gi')
      const results: Array<{ position: number; match: string; before: string; after: string }> = []
      
      const lines = documentContent.split('\n')
      let lineIndex = 0
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const beforeLines = lines.slice(Math.max(0, i - contextLines), i).join('\n')
          const afterLines = lines.slice(i + 1, Math.min(lines.length, i + contextLines + 1)).join('\n')
          results.push({
            position: lineIndex,
            match: lines[i],
            before: beforeLines,
            after: afterLines
          })
        }
        lineIndex += lines[i].length + 1
      }
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Found ${results.length} matches` }],
          results
        }
      })
      break
    }

    case 'document_get_metadata': {
      const text = documentContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      const words = text.split(/\s+/).filter(w => w.length > 0)
      const wordCount = words.length
      const charCount = text.length
      const lineCount = documentContent.split('\n').length
      const headingCount = (documentContent.match(/<h[1-6]>/gi) || []).length
      const readingTime = Math.ceil(wordCount / 200)
      
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Document: ${wordCount} words, ${charCount} chars, ${lineCount} lines` }],
          metadata: {
            wordCount,
            charCount,
            lineCount,
            headingCount,
            readingTimeMinutes: readingTime,
            lastModified: Date.now()
          }
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
