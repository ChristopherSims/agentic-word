import React, { useState, useRef, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const ChatSidebar: FC = () => {
  const { chatSidebarOpen, chatMessages, chatLoading, addChatMessage, setChatLoading, documentContent } = useAppStore()
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

      // If the agent made tool calls, execute them in the renderer
      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
          // Execute document-modifying tools locally
          const toolResult = await executeToolLocally(tc.toolName, tc.result as Record<string, unknown>)
          if (toolResult) {
            addChatMessage({
              id: crypto.randomUUID(),
              role: 'system',
              content: `Tool ${tc.toolName} executed: ${JSON.stringify(toolResult).slice(0, 200)}`
            })
          }
        }
      }

      if (result.content) {
        addChatMessage({ id: crypto.randomUUID(), role: 'assistant', content: result.content, toolCalls: result.toolCalls })
      } else if (result.toolCalls && result.toolCalls.length > 0) {
        addChatMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Applied ${result.toolCalls.length} change(s) to the document.`
        })
      }

      // If the model needs a follow-up (tool results), send them back
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
        >
          ✕
        </button>
      </div>

      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <div className="chat-msg system">
            Chat with an AI agent to edit your document. Configure the agent endpoint in Settings (⚙).
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

// Execute tool operations that modify the editor locally
async function executeToolLocally(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const { setDocumentContent } = useAppStore.getState()
  const content = useAppStore.getState().documentContent

  switch (toolName) {
    case 'document_replace': {
      const search = args.search as string
      const replace = args.replace as string
      const useRegex = args.useRegex as boolean
      const replaceAll = args.replaceAll as boolean

      if (useRegex) {
        const regex = new RegExp(search, replaceAll ? 'g' : '')
        const newContent = content.replace(regex, replace)
        setDocumentContent(newContent)
      } else {
        if (replaceAll) {
          setDocumentContent(content.split(search).join(replace))
        } else {
          setDocumentContent(content.replace(search, replace))
        }
      }
      return { replaced: true }
    }

    case 'document_insert': {
      const insertContent = args.content as string
      const position = args.position as string

      if (position === 'end') {
        setDocumentContent(content + insertContent)
      } else if (position === 'start') {
        setDocumentContent(insertContent + content)
      } else {
        // Insert before closing body tag or at end
        setDocumentContent(content + insertContent)
      }
      return { inserted: true }
    }

    case 'document_delete': {
      const search = args.search as string
      const occurrence = (args.occurrence as number) || 0

      if (occurrence === 0) {
        setDocumentContent(content.split(search).join(''))
      } else {
        let count = 0
        const newContent = content.replace(new RegExp(escapeRegex(search), 'g'), (match) => {
          count++
          return count === occurrence ? '' : match
        })
        setDocumentContent(newContent)
      }
      return { deleted: true }
    }

    case 'document_format': {
      // Formatting is best handled by the TipTap editor
      // We do a simple HTML tag wrapping here as a fallback
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
        if (open) {
          setDocumentContent(content.replace(selection, `${open}${selection}${close}`))
        }
      }
      return { formatted: true }
    }

    case 'vcs_commit': {
      const message = args.message as string
      const commit = await window.wordapp?.vcs.commit(message, content)
      return commit
    }

    case 'vcs_revert': {
      const commitId = args.commitId as string
      const revertedContent = await window.wordapp?.vcs.revert(commitId)
      if (revertedContent) {
        setDocumentContent(revertedContent)
      }
      return { reverted: !!revertedContent }
    }

    case 'vcs_branch_create': {
      const name = args.name as string
      const branch = await window.wordapp?.vcs.createBranch(name)
      return branch
    }

    case 'vcs_branch_switch': {
      const name = args.name as string
      const success = await window.wordapp?.vcs.switchBranch(name)
      if (success) {
        useAppStore.getState().setCurrentBranch(name)
      }
      return { switched: success }
    }

    default:
      // For VCS read-only tools, delegate to main process
      return await window.wordapp?.agent.executeTool(toolName, args)
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
