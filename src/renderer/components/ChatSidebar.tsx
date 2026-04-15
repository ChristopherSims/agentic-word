import React, { useState, useRef, useEffect, type FC } from 'react'
import { Box, Paper, Typography, IconButton, TextField, Button, Chip, Tooltip, List, ListItem, ListItemText, Divider } from '@mui/material'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import RefreshIcon from '@mui/icons-material/Refresh'
import CloseIcon from '@mui/icons-material/Close'
import UndoIcon from '@mui/icons-material/Undo'
import StickyNote2Icon from '@mui/icons-material/StickyNote2'
import StopIcon from '@mui/icons-material/Stop'
import SendIcon from '@mui/icons-material/Send'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useAppStore } from '../store/app-store'

export const ChatSidebar: FC = () => {
  const {
    chatSidebarOpen, chatMessages, chatLoading, chatStreamingId, chatStreamContent,
    addChatMessage, setChatLoading, setChatStreamingId, setChatStreamContent,
    updateStreamingMessage, documentContent, currentBranch,
    scratchpadContent, setScratchpadContent, collabCursors, setChatSidebarOpen
  } = useAppStore()
  const [input, setInput] = useState('')
  const [scratchpadOpen, setScratchpadOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages, chatStreamContent])

  useEffect(() => {
    if (!window.wordapp) return
    const unsubToken = () => window.wordapp?.on('agent-stream-token', (data: unknown) => {
      const { fullContent } = data as { token: string; fullContent: string }
      setChatStreamContent(fullContent)
      const streamId = useAppStore.getState().chatStreamingId
      if (streamId) useAppStore.getState().updateStreamingMessage(streamId, fullContent)
    })
    const unsubDone = () => window.wordapp?.on('agent-stream-done', (data: unknown) => {
      const { fullContent } = data as { fullContent: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }
      const streamId = useAppStore.getState().chatStreamingId
      if (streamId && fullContent) useAppStore.getState().updateStreamingMessage(streamId, fullContent)
      setChatLoading(false); setChatStreamingId(null); setChatStreamContent('')
    })
    const unsubError = () => window.wordapp?.on('agent-stream-error', (data: unknown) => {
      const { error } = data as { error: string }
      addChatMessage({ id: crypto.randomUUID(), role: 'error', content: error })
      setChatLoading(false); setChatStreamingId(null)
    })
    const unsubToolResults = () => window.wordapp?.on('agent-tool-results', (data: unknown) => {
      const { toolCalls } = data as { toolCalls: Array<{ toolCallId: string; toolName: string; result: unknown }> }
      if (toolCalls && toolCalls.length > 0) {
        let pendingCount = 0
        for (const tc of toolCalls) {
          const toolArgs = tc.result as Record<string, unknown>
          const isDocEdit = ['document_replace', 'document_insert', 'document_delete', 'document_format'].includes(tc.toolName)
          const isVcsWrite = ['vcs_commit', 'vcs_revert'].includes(tc.toolName)
          if (isDocEdit || isVcsWrite) { queuePendingChange(tc.toolName, toolArgs); pendingCount++ }
          else { executeReadOnlyTool(tc.toolName, toolArgs).then((result) => { if (result) addChatMessage({ id: crypto.randomUUID(), role: 'system', content: `${tc.toolName}: ${JSON.stringify(result).slice(0, 200)}` }) }) }
        }
        if (pendingCount > 0) addChatMessage({ id: crypto.randomUUID(), role: 'assistant', content: `I've proposed ${pendingCount} change(s). Review them in the diff panel — accept or reject each one.` })
      }
    })
    const unsubCursor = () => window.wordapp?.on('collab-cursor-update', (data: unknown) => {
      const cursor = data as { id: string; name: string; color: string; position: number }
      const current = useAppStore.getState().collabCursors
      const updated = current.filter((c) => c.id !== cursor.id)
      updated.push({ ...cursor, lastSeen: Date.now() })
      useAppStore.getState().setCollabCursors(updated.slice(0, 5))
    })
    return () => {}
  }, [])

  const handleSend = async () => {
    if (!input.trim() || chatLoading) return
    const userMessage = input.trim()
    setInput('')
    addChatMessage({ id: crypto.randomUUID(), role: 'user', content: userMessage })
    setChatLoading(true)
    try {
      const messages = chatMessages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }))
      messages.push({ role: 'user', content: userMessage })
      const context = { documentContent: documentContent.slice(0, 4000), currentBranch, selection: '' }
      const streamId = crypto.randomUUID()
      addChatMessage({ id: streamId, role: 'assistant', content: '', streaming: true })
      setChatStreamingId(streamId)
      await window.wordapp?.agent.chatStream(messages, context)
    } catch (err) {
      addChatMessage({ id: crypto.randomUUID(), role: 'error', content: `Failed: ${(err as Error).message}` })
      setChatLoading(false); setChatStreamingId(null)
    }
  }

  const handleAbort = () => {
    window.wordapp?.agent.abort()
    const streamId = useAppStore.getState().chatStreamingId
    if (streamId) updateStreamingMessage(streamId, chatStreamContent || 'Response aborted.')
    setChatLoading(false)
  }

  if (!chatSidebarOpen) return null

  return (
    <Paper sx={{ width: 340, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0, position: 'relative', zIndex: 50 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, zIndex: 150, bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2">AI Assistant</Typography>
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          <Tooltip title="Scratchpad"><IconButton size="small" onClick={() => setScratchpadOpen(!scratchpadOpen)}><StickyNote2Icon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Tooltip title="Undo last agent action"><IconButton size="small" onClick={() => useAppStore.getState().undoLastAcceptedChange()}><UndoIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Tooltip title="Clear chat"><IconButton size="small" onClick={() => useAppStore.getState().clearChat()}><CloseIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Tooltip title="Close sidebar"><IconButton size="small" onClick={() => useAppStore.getState().setChatSidebarOpen(false)}><ChevronRightIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        </Box>
      </Box>

      {/* Collab cursors */}
      {collabCursors.length > 0 && (
        <Box sx={{ px: 1.5, py: 0.5, display: 'flex', gap: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          {collabCursors.map((c) => <Chip key={c.id} label={c.name} size="small" sx={{ fontSize: 10, height: 20, '& .MuiChip-avatar': { bgcolor: c.color, width: 8, height: 8 } }} avatar={<div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />} />)}
        </Box>
      )}

      {/* Scratchpad */}
      {scratchpadOpen && (
        <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Agent Scratchpad</Typography>
          <TextField multiline minRows={3} maxRows={5} fullWidth value={scratchpadContent} onChange={(e) => { setScratchpadContent(e.target.value); window.wordapp?.agent.setScratchpad(e.target.value) }} placeholder="Notes for the agent..." sx={{ '& .MuiInputBase-input': { fontSize: 11 } }} />
        </Box>
      )}

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {chatMessages.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 2 }}>
            Chat with an AI agent to edit your document. Changes appear as diffs for review.
          </Typography>
        )}
        {chatMessages.map((msg) => (
          <Box key={msg.id} sx={{
            maxWidth: '95%', p: 1, borderRadius: 1, fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
            bgcolor: msg.role === 'user' ? 'primary.main' : msg.role === 'assistant' ? 'action.hover' : msg.role === 'error' ? 'error.dark' : 'background.default',
            color: msg.role === 'user' ? 'primary.contrastText' : msg.role === 'error' ? 'error.contrastText' : 'text.primary',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            {msg.streaming ? <span>{msg.content || chatStreamContent || 'Thinking...'}<span className="streaming-cursor">▌</span></span> : msg.content}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <Box sx={{ mt: 0.5, fontSize: 11, opacity: 0.7 }}>Tools: {msg.toolCalls.map((tc) => tc.toolName).join(', ')}</Box>
            )}
          </Box>
        ))}
        {chatLoading && !chatStreamingId && <Typography variant="caption" color="text.secondary">Thinking...</Typography>}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box sx={{ display: 'flex', gap: 0.5, p: 1, borderTop: 1, borderColor: 'divider' }}>
        <TextField fullWidth size="small" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} placeholder="Ask the AI to edit your document..." disabled={chatLoading && !chatStreamingId} sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
        {chatLoading ? (
          <Button size="small" color="error" variant="contained" onClick={handleAbort} sx={{ minWidth: 0, px: 1 }}><StopIcon sx={{ fontSize: 16 }} /></Button>
        ) : (
          <Button size="small" variant="contained" onClick={handleSend} disabled={!input.trim()} sx={{ minWidth: 0, px: 1 }}><SendIcon sx={{ fontSize: 16 }} /></Button>
        )}
      </Box>

      <SmartSuggestions />
    </Paper>
  )
}

// --- Smart Suggestions ---
const SmartSuggestions: FC = () => {
  const { smartSuggestions, smartSuggestionsLoading, setSmartSuggestions, setSmartSuggestionsLoading, clearSmartSuggestions, documentContent, addToast } = useAppStore()
  const [expanded, setExpanded] = useState(false)

  const handleSuggest = async () => {
    if (!documentContent) return
    setSmartSuggestionsLoading(true)
    try {
      const results = await window.wordapp?.agent.suggest(documentContent)
      if (results && Array.isArray(results)) {
        setSmartSuggestions(results.map((r: { type: string; message: string; context: string }, i: number) => ({ id: `sug-${i}`, type: r.type as 'grammar' | 'style' | 'structure', message: r.message, context: r.context, timestamp: Date.now() })))
        setExpanded(true)
      }
    } catch { addToast('error', 'Smart suggestions failed') } finally { setSmartSuggestionsLoading(false) }
  }

  if (!expanded && smartSuggestions.length === 0) {
    return (<Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}><Button fullWidth size="small" startIcon={<LightbulbIcon />} onClick={handleSuggest} disabled={smartSuggestionsLoading}>{smartSuggestionsLoading ? 'Analyzing...' : 'Smart Suggestions'}</Button></Box>)
  }

  return (
    <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', maxHeight: 200, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600}>💡 Suggestions</Typography>
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          <IconButton size="small" onClick={handleSuggest} disabled={smartSuggestionsLoading}><RefreshIcon sx={{ fontSize: 12 }} /></IconButton>
          <IconButton size="small" onClick={() => { clearSmartSuggestions(); setExpanded(false) }}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>
        </Box>
      </Box>
      {smartSuggestions.map((s) => (
        <Box key={s.id} sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
          <Chip label={s.type} size="small" color={s.type === 'grammar' ? 'error' : s.type === 'style' ? 'success' : 'primary'} sx={{ fontSize: 9, height: 16, mr: 0.5 }} />
          <Typography variant="caption">{s.message}</Typography>
          {s.context && <Typography variant="caption" color="text.secondary" display="block">&ldquo;{s.context.slice(0, 60)}&rdquo;</Typography>}
        </Box>
      ))}
    </Box>
  )
}

// --- Pending change helpers (same logic, preserved) ---
function queuePendingChange(toolName: string, args: Record<string, unknown>): string {
  const { addPendingChange } = useAppStore.getState()
  const content = useAppStore.getState().documentContent
  const contentAfter = computeContentAfter(toolName, args, content)
  return addPendingChange({ toolName, args, contentBefore: content, contentAfter, description: describeChange(toolName, args) })
}

function computeContentAfter(toolName: string, args: Record<string, unknown>, content: string): string {
  switch (toolName) {
    case 'document_replace': { const s = args.search as string, r = args.replace as string; if (args.useRegex) return content.replace(new RegExp(s, args.replaceAll ? 'g' : ''), r); return args.replaceAll ? content.split(s).join(r) : content.replace(s, r) }
    case 'document_insert': { const c = args.content as string, p = args.position as string; return p === 'start' ? c + content : content + c }
    case 'document_delete': { const s = args.search as string; return content.split(s).join('') }
    case 'document_format': { const fmt = args.type as string, sel = args.selection as string | undefined; if (sel) { const tags: Record<string, [string, string]> = { bold: ['<strong>', '</strong>'], italic: ['<em>', '</em>'], underline: ['<u>', '</u>'], heading1: ['<h1>', '</h1>'], heading2: ['<h2>', '</h2>'], heading3: ['<h3>', '</h3>'] }; const [o, c] = tags[fmt] || ['', '']; return o ? content.replace(sel, `${o}${sel}${c}`) : content; } return content }
    default: return content
  }
}

function describeChange(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'document_replace': return `Replace "${(args.search as string).slice(0, 40)}" → "${(args.replace as string).slice(0, 40)}"`
    case 'document_insert': return `Insert at ${args.position}`
    case 'document_delete': return `Delete "${(args.search as string).slice(0, 40)}"`
    case 'document_format': return `Apply ${args.type} formatting`
    default: return `Execute ${toolName}`
  }
}

async function executeReadOnlyTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'vcs_log': return await window.wordapp?.vcs.log()
    case 'vcs_branch_list': return await window.wordapp?.vcs.listBranches()
    case 'vcs_diff': return await window.wordapp?.vcs.diff(args.fromId as string | undefined, args.toId as string | undefined)
    case 'vcs_branch_create': return await window.wordapp?.vcs.createBranch(args.name as string)
    case 'vcs_branch_switch': { const s = await window.wordapp?.vcs.switchBranch(args.name as string); if (s) useAppStore.getState().setCurrentBranch(args.name as string); return { switched: s } }
    default: return await window.wordapp?.agent.executeTool(toolName, args)
  }
}
