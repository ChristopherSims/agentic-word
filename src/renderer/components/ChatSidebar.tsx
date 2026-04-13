import React, { useState, useRef, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const ChatSidebar: FC = () => {
  const { chatSidebarOpen, chatMessages, chatLoading, addChatMessage, setChatLoading } = useAppStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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

      const result = await window.wordapp?.agent.chat(messages) as {
        role?: string
        content?: string | null
        toolCalls?: Array<{ toolName: string; result: unknown }>
        error?: string
        needsFollowUp?: boolean
      } | null

      if (!result) {
        addChatMessage({ id: crypto.randomUUID(), role: 'error', content: 'No response from agent' })
        return
      }

      if (result.error) {
        addChatMessage({ id: crypto.randomUUID(), role: 'error', content: result.error })
        return
      }

      // If the agent made tool calls, queue them as pending diffs for user approval
      if (result.toolCalls && result.toolCalls.length > 0) {
        let pendingCount = 0
        for (const tc of result.toolCalls) {
          const toolArgs = tc.result as Record<string, unknown>
          const isDocEdit = ['document_replace', 'document_insert', 'document_delete', 'document_format'].includes(tc.toolName)
          const isVcsWrite = ['vcs_commit', 'vcs_revert'].includes(tc.toolName)

          if (isDocEdit) {
            // Queue as pending diff — user must approve/reject
            const changeId = queuePendingChange(tc.toolName, toolArgs)
            pendingCount++
          } else if (isVcsWrite) {
            // VCS writes also need approval
            queuePendingChange(tc.toolName, toolArgs)
            pendingCount++
          } else {
            // Read-only tools execute immediately
            const toolResult = await executeReadOnlyTool(tc.toolName, toolArgs)
            if (toolResult) {
              addChatMessage({
                id: crypto.randomUUID(),
                role: 'system',
                content: `${tc.toolName}: ${JSON.stringify(toolResult).slice(0, 200)}`
              })
            }
          }
        }

        if (pendingCount > 0) {
          addChatMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `I've proposed ${pendingCount} change(s). Review them in the diff panel above the editor — accept or reject each one.`
          })
        }
      }

      if (result.content && !(result.toolCalls && result.toolCalls.length > 0)) {
        addChatMessage({ id: crypto.randomUUID(), role: 'assistant', content: result.content })
      }

      // Follow-up with tool results for read-only tools
      if (result.needsFollowUp && result.toolCalls) {
        const toolResults = result.toolCalls.map((tc) => ({
          role: 'tool' as const,
          content: JSON.stringify(tc.result)
        }))

        const followUp = await window.wordapp?.agent.chat([
          ...messages,
          { role: 'assistant', content: result.content || '' },
          ...toolResults
        ]) as { content?: string; error?: string } | null

        if (followUp?.content) {
          addChatMessage({ id: crypto.randomUUID(), role: 'assistant', content: followUp.content })
        }
      }
    } catch (err) {
      addChatMessage({ id: crypto.randomUUID(), role: 'error', content: `Failed: ${(err as Error).message}` })
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className={`chat-sidebar${chatSidebarOpen ? '' : ' collapsed'}`}>
      <div className="chat-header">
        <h3>AI Assistant</h3>
        <button
          className="toolbar-btn"
          style={{ width: 24, height: 24, fontSize: 11 }}
          onClick={() => useAppStore.getState().clearChat()}
          title="Clear chat"
        >✕</button>
      </div>

      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <div className="chat-msg system">
            Chat with an AI agent to edit your document. Changes will appear as diffs for you to accept or reject. Configure the agent endpoint in Settings (⚙).
          </div>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`chat-msg ${msg.role}`}>
            {msg.content}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                Tools: {msg.toolCalls.map((tc) => tc.toolName).join(', ')}
              </div>
            )}
          </div>
        ))}
        {chatLoading && (
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
          disabled={chatLoading}
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={chatLoading || !input.trim()}>
          Send
        </button>
      </div>
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
