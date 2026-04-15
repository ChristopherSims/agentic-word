import React, { useState, useRef, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const ChatSidebar: FC = () => {
  const {
    chatSidebarOpen, chatMessages, chatLoading, chatStreamingId, chatStreamContent,
    addChatMessage, setChatLoading, setChatStreamingId, setChatStreamContent,
    updateStreamingMessage, documentContent, currentBranch,
    scratchpadContent, setScratchpadContent, collabCursors
  } = useAppStore()
  const [input, setInput] = useState('')
  const [scratchpadOpen, setScratchpadOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatStreamContent])

  // Listen for streaming events from main process
  useEffect(() => {
    if (!window.wordapp) return

    const unsubToken = () => window.wordapp?.on('agent-stream-token', (data: unknown) => {
      const { token, fullContent } = data as { token: string; fullContent: string }
      setChatStreamContent(fullContent)
      // Update the streaming message in place
      const streamId = useAppStore.getState().chatStreamingId
      if (streamId) {
        useAppStore.getState().updateStreamingMessage(streamId, fullContent)
      }
    })

    const unsubDone = () => window.wordapp?.on('agent-stream-done', (data: unknown) => {
      const { fullContent, toolCalls } = data as { fullContent: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }
      const streamId = useAppStore.getState().chatStreamingId
      if (streamId && fullContent) {
        useAppStore.getState().updateStreamingMessage(streamId, fullContent)
      }
      setChatLoading(false)
      setChatStreamingId(null)
      setChatStreamContent('')
    })

    const unsubError = () => window.wordapp?.on('agent-stream-error', (data: unknown) => {
      const { error } = data as { error: string }
      addChatMessage({ id: crypto.randomUUID(), role: 'error', content: error })
      setChatLoading(false)
      setChatStreamingId(null)
    })

    const unsubToolResults = () => window.wordapp?.on('agent-tool-results', (data: unknown) => {
      const { toolCalls } = data as { toolCalls: Array<{ toolCallId: string; toolName: string; result: unknown }> }
      if (toolCalls && toolCalls.length > 0) {
        let pendingCount = 0
        for (const tc of toolCalls) {
          const toolArgs = tc.result as Record<string, unknown>
          const isDocEdit = ['document_replace', 'document_insert', 'document_delete', 'document_format'].includes(tc.toolName)
          const isVcsWrite = ['vcs_commit', 'vcs_revert'].includes(tc.toolName)

          if (isDocEdit || isVcsWrite) {
            queuePendingChange(tc.toolName, toolArgs)
            pendingCount++
          } else {
            executeReadOnlyTool(tc.toolName, toolArgs).then((result) => {
              if (result) {
                addChatMessage({
                  id: crypto.randomUUID(),
                  role: 'system',
                  content: `${tc.toolName}: ${JSON.stringify(result).slice(0, 200)}`
                })
              }
            })
          }
        }

        if (pendingCount > 0) {
          addChatMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `I've proposed ${pendingCount} change(s). Review them in the diff panel — accept or reject each one.`
          })
        }
      }
    })

    // Collab cursor mock — simulates other users' cursors
    const unsubCursor = () => window.wordapp?.on('collab-cursor-update', (data: unknown) => {
      const cursor = data as { id: string; name: string; color: string; position: number }
      const current = useAppStore.getState().collabCursors
      const updated = current.filter((c) => c.id !== cursor.id)
      updated.push({ ...cursor, lastSeen: Date.now() })
      useAppStore.getState().setCollabCursors(updated.slice(0, 5))
    })

    return () => { /* Listeners auto-cleaned via ipcRenderer */ }
  }, [])

  const handleSend = async () => {
    if (!input.trim() || chatLoading) return

    const userMessage = input.trim()
    setInput('')
    addChatMessage({ id: crypto.randomUUID(), role: 'user', content: userMessage })
    setChatLoading(true)

    try {
      const messages = chatMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))

      messages.push({ role: 'user', content: userMessage })

      // Build context for context-aware agent
      const context = {
        documentContent: documentContent.slice(0, 4000),
        currentBranch,
        selection: '' // Could be populated from editor selection
      }

      // Create a placeholder streaming message
      const streamId = crypto.randomUUID()
      addChatMessage({ id: streamId, role: 'assistant', content: '', streaming: true })
      setChatStreamingId(streamId)

      // Use streaming endpoint
      await window.wordapp?.agent.chatStream(messages, context)
    } catch (err) {
      addChatMessage({ id: crypto.randomUUID(), role: 'error', content: `Failed: ${(err as Error).message}` })
      setChatLoading(false)
      setChatStreamingId(null)
    }
  }

  const handleAbort = () => {
    window.wordapp?.agent.abort()
    const streamId = useAppStore.getState().chatStreamingId
    if (streamId) {
      updateStreamingMessage(streamId, chatStreamContent || 'Response aborted.')
    }
    setChatLoading(false)
  }

  const handleUndoAgent = () => {
    useAppStore.getState().undoLastAcceptedChange()
  }

  return (
    <div className={`chat-sidebar${chatSidebarOpen ? '' : ' collapsed'}`}>
      <div className="chat-header">
        <h3>AI Assistant</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="toolbar-btn"
            style={{ width: 24, height: 24, fontSize: 11 }}
            onClick={() => setScratchpadOpen(!scratchpadOpen)}
            title="Scratchpad"
          >📝</button>
          <button
            className="toolbar-btn"
            style={{ width: 24, height: 24, fontSize: 11 }}
            onClick={handleUndoAgent}
            title="Undo last agent action"
          >↩</button>
          <button
            className="toolbar-btn"
            style={{ width: 24, height: 24, fontSize: 11 }}
            onClick={() => useAppStore.getState().clearChat()}
            title="Clear chat"
          >✕</button>
        </div>
      </div>

      {/* Collab cursors indicator */}
      {collabCursors.length > 0 && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
          {collabCursors.map((c) => (
            <span key={c.id} style={{ marginRight: 8 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c.color, marginRight: 4 }} />
              {c.name}
            </span>
          ))}
        </div>
      )}

      {/* Scratchpad panel */}
      {scratchpadOpen && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Agent Scratchpad</div>
          <textarea
            style={{
              width: '100%', height: 80, fontSize: 11, padding: 6,
              background: 'var(--bg-primary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical',
              fontFamily: 'inherit'
            }}
            value={scratchpadContent}
            onChange={(e) => {
              setScratchpadContent(e.target.value)
              window.wordapp?.agent.setScratchpad(e.target.value)
            }}
            placeholder="Notes for the agent..."
          />
        </div>
      )}

      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <div className="chat-msg system">
            Chat with an AI agent to edit your document. Changes appear as diffs for review. Use 📝 for scratchpad, ↩ to undo agent actions.
          </div>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`chat-msg ${msg.role}`}>
            {msg.streaming ? (
              <span>
                {msg.content || chatStreamContent || 'Thinking...'}
                <span className="streaming-cursor">▌</span>
              </span>
            ) : (
              msg.content
            )}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                Tools: {msg.toolCalls.map((tc) => tc.toolName).join(', ')}
              </div>
            )}
          </div>
        ))}
        {chatLoading && !chatStreamingId && (
          <div className="chat-msg system">Thinking...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Ask the AI to edit your document..."
          disabled={chatLoading && !chatStreamingId}
        />
        {chatLoading ? (
          <button className="chat-send-btn" onClick={handleAbort} style={{ background: 'var(--danger)' }}>
            Stop
          </button>
        ) : (
          <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
            Send
          </button>
        )}
      </div>
      <SmartSuggestions />
    </div>
  )
}

/**
 * Queue a document-modifying tool call as a pending diff change.
 * The user must accept/reject it before it's applied.
 */
function queuePendingChange(toolName: string, args: Record<string, unknown>): string {
  const { addPendingChange } = useAppStore.getState()
  const content = useAppStore.getState().documentContent
  const contentAfter = computeContentAfter(toolName, args, content)
  const description = describeChange(toolName, args)

  return addPendingChange({
    toolName,
    args,
    contentBefore: content,
    contentAfter,
    description
  })
}

function computeContentAfter(toolName: string, args: Record<string, unknown>, content: string): string {
  switch (toolName) {
    case 'document_replace': {
      const search = args.search as string
      const replace = args.replace as string
      const useRegex = args.useRegex as boolean
      const replaceAll = args.replaceAll as boolean

      if (useRegex) {
        const regex = new RegExp(search, replaceAll ? 'g' : '')
        return content.replace(regex, replace)
      }
      if (replaceAll) return content.split(search).join(replace)
      return content.replace(search, replace)
    }

    case 'document_insert': {
      const insertContent = args.content as string
      const position = args.position as string
      if (position === 'end') return content + insertContent
      if (position === 'start') return insertContent + content
      return content + insertContent
    }

    case 'document_delete': {
      const search = args.search as string
      const occurrence = (args.occurrence as number) || 0
      if (occurrence === 0) return content.split(search).join('')
      let count = 0
      return content.replace(new RegExp(escapeRegex(search), 'g'), (match) => {
        count++
        return count === occurrence ? '' : match
      })
    }

    case 'document_format': {
      const formatType = args.type as string
      const selection = args.selection as string | undefined
      if (selection) {
        const tags: Record<string, [string, string]> = {
          bold: ['<strong>', '</strong>'],
          italic: ['<em>', '</em>'],
          underline: ['<u>', '</u>'],
          heading1: ['<h1>', '</h1>'],
          heading2: ['<h2>', '</h2>'],
          heading3: ['<h3>', '</h3>'],
        }
        const [open, close] = tags[formatType] || ['', '']
        if (open) return content.replace(selection, `${open}${selection}${close}`)
      }
      return content
    }

    case 'vcs_commit': return content // no content change
    case 'vcs_revert': return content // handled separately
    default: return content
  }
}

function describeChange(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'document_replace': {
      const search = args.search as string
      const replace = args.replace as string
      return `Replace "${search.length > 60 ? search.slice(0, 60) + '…' : search}" → "${replace.length > 60 ? replace.slice(0, 60) + '…' : replace}"`
    }
    case 'document_insert': {
      const c = args.content as string
      return `Insert "${c.length > 80 ? c.slice(0, 80) + '…' : c}" at ${args.position}`
    }
    case 'document_delete': {
      const search = args.search as string
      return `Delete "${search.length > 60 ? search.slice(0, 60) + '…' : search}"`
    }
    case 'document_format': {
      return `Apply ${args.type} formatting${args.selection ? ` to "${(args.selection as string).slice(0, 40)}"` : ''}`
    }
    case 'vcs_commit': return `Commit: ${args.message}`
    case 'vcs_revert': return `Revert to commit ${args.commitId}`
    default: return `Execute ${toolName}`
  }
}

async function executeReadOnlyTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const store = useAppStore.getState()

  switch (toolName) {
    case 'vcs_log': return await window.wordapp?.vcs.log()
    case 'vcs_branch_list': return await window.wordapp?.vcs.listBranches()
    case 'vcs_diff': return await window.wordapp?.vcs.diff(args.fromId as string | undefined, args.toId as string | undefined)
    case 'vcs_branch_create': {
      const name = args.name as string
      return await window.wordapp?.vcs.createBranch(name)
    }
    case 'vcs_branch_switch': {
      const name = args.name as string
      const success = await window.wordapp?.vcs.switchBranch(name)
      if (success) store.setCurrentBranch(name)
      return { switched: success }
    }
    default: return await window.wordapp?.agent.executeTool(toolName, args)
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Smart Suggestions Section ───
const SmartSuggestions: FC = () => {
  const { smartSuggestions, smartSuggestionsLoading, setSmartSuggestions, setSmartSuggestionsLoading, clearSmartSuggestions, documentContent, addToast } = useAppStore()
  const [expanded, setExpanded] = useState(false)

  const handleSuggest = async () => {
    if (!documentContent) return
    setSmartSuggestionsLoading(true)
    try {
      const results = await window.wordapp?.agent.suggest(documentContent)
      if (results && Array.isArray(results)) {
        setSmartSuggestions(results.map((r: { type: string; message: string; context: string }, i: number) => ({
          id: `sug-${i}`,
          type: r.type as 'grammar' | 'style' | 'structure',
          message: r.message,
          context: r.context,
          timestamp: Date.now()
        })))
        setExpanded(true)
      }
    } catch {
      addToast('error', 'Smart suggestions failed — check agent endpoint')
    } finally {
      setSmartSuggestionsLoading(false)
    }
  }

  if (!expanded && smartSuggestions.length === 0) {
    return (
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', fontSize: 11, padding: '4px 8px' }}
          onClick={handleSuggest}
          disabled={smartSuggestionsLoading}
        >
          {smartSuggestionsLoading ? 'Analyzing...' : '💡 Smart Suggestions'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', maxHeight: 200, overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>💡 Suggestions</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 4px' }} onClick={handleSuggest} disabled={smartSuggestionsLoading}>⟳</button>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 4px' }} onClick={() => { clearSmartSuggestions(); setExpanded(false) }}>✕</button>
        </div>
      </div>
      {smartSuggestions.map((s) => (
        <div key={s.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--bg-surface)' }}>
          <span style={{
            fontSize: 9,
            padding: '1px 4px',
            borderRadius: 3,
            marginRight: 4,
            background: s.type === 'grammar' ? 'rgba(243,139,168,0.2)' : s.type === 'style' ? 'rgba(166,227,161,0.2)' : 'rgba(137,180,250,0.2)',
            color: s.type === 'grammar' ? '#f38ba8' : s.type === 'style' ? '#a6e3a1' : '#89b4fa'
          }}>
            {s.type}
          </span>
          {s.message}
          {s.context && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>&ldquo;{s.context.slice(0, 60)}&rdquo;</div>}
        </div>
      ))}
    </div>
  )
}
