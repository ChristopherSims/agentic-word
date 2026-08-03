/// <reference path="../window.d.ts" />
import React, { useEffect, useState, useRef, type FC } from 'react'
import { Box, Paper, Typography, IconButton, TextField, Button, Chip, Tabs, Tab, List, ListItem, ListItemText, Divider, Tooltip, Select, MenuItem, Menu, FormControl, Switch, FormControlLabel, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Avatar, Fab, Card, CardContent, CardActions, Alert } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import PersonIcon from '@mui/icons-material/Person'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import TranslateIcon from '@mui/icons-material/Translate'
import SummarizeIcon from '@mui/icons-material/Summarize'
import StopIcon from '@mui/icons-material/Stop'
import ScheduleIcon from '@mui/icons-material/Schedule'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { useAppStore } from '../store/app-store'
import { formatTime, validateInput } from '../utils'
import type { AgentSession, AgentProfile, AgentMultiRunResult, AgentTask } from '../types'
import { TaskGraphPanel } from './TaskGraphPanel'
import { MemoryPanel } from './MemoryPanel'

type TabVal = 'chat' | 'sessions' | 'multi' | 'tools' | 'memory'

// ─── Typing indicator dots ───
const TypingDots: FC = () => (
  <Box sx={{ display: 'flex', gap: 0.5, py: 0.5 }}>
    {[0, 1, 2].map(i => (
      <Box key={i} sx={{
        width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main',
        animation: 'typingBounce 1.4s ease-in-out infinite',
        animationDelay: `${i * 0.2}s`,
        '@keyframes typingBounce': { '0%, 80%, 100%': { opacity: 0.3, transform: 'scale(0.8)' }, '40%': { opacity: 1, transform: 'scale(1)' } }
      }} />
    ))}
  </Box>
)

// ─── Relative time formatter ───
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Date separator ───
function dateLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const AgentWorkspacePanel: FC = () => {
  // P1-P3: Selective subscriptions via individual selectors (avoids full-store re-renders)
  const chatSidebarOpen = useAppStore(s => s.chatSidebarOpen)
  const chatMessages = useAppStore(s => s.chatMessages)
  const chatLoading = useAppStore(s => s.chatLoading)
  const chatStreamingId = useAppStore(s => s.chatStreamingId)
  const addChatMessage = useAppStore(s => s.addChatMessage)
  const setChatLoading = useAppStore(s => s.setChatLoading)
  const setChatStreamingId = useAppStore(s => s.setChatStreamingId)
  const appendChatStreamToken = useAppStore(s => s.appendChatStreamToken)
  const finalizeStreamingMessage = useAppStore(s => s.finalizeStreamingMessage)
  const addChatErrorMessage = useAppStore(s => s.addChatErrorMessage)
  const documentContent = useAppStore(s => s.documentContent)
  const currentBranch = useAppStore(s => s.currentBranch)
  const currentFilePath = useAppStore(s => s.currentFilePath)
  const agentStatus = useAppStore(s => s.agentStatus)
  const setAgentStatus = useAppStore(s => s.setAgentStatus)
  const pendingAgentReviews = useAppStore(s => s.pendingAgentReviews)
  const acceptAgentReview = useAppStore(s => s.acceptAgentReview)
  const rejectAgentReview = useAppStore(s => s.rejectAgentReview)
  const acceptAllAgentReviews = useAppStore(s => s.acceptAllAgentReviews)
  const backgroundTasks = useAppStore(s => s.backgroundTasks)
  const addBackgroundTask = useAppStore(s => s.addBackgroundTask)
  const updateBackgroundTask = useAppStore(s => s.updateBackgroundTask)
  const agentSessions = useAppStore(s => s.agentSessions)
  const agentActiveSessionId = useAppStore(s => s.agentActiveSessionId)
  const agentProfiles = useAppStore(s => s.agentProfiles)
  const multiAgentMode = useAppStore(s => s.multiAgentMode)
  const multiAgentActiveNames = useAppStore(s => s.multiAgentActiveNames)
  const multiAgentResults = useAppStore(s => s.multiAgentResults)
  const setAgentSessions = useAppStore(s => s.setAgentSessions)
  const setAgentActiveSessionId = useAppStore(s => s.setAgentActiveSessionId)
  const setAgentProfiles = useAppStore(s => s.setAgentProfiles)
  const setMultiAgentMode = useAppStore(s => s.setMultiAgentMode)
  const setMultiAgentActiveNames = useAppStore(s => s.setMultiAgentActiveNames)
  const setMultiAgentResults = useAppStore(s => s.setMultiAgentResults)
  const orchestrationMode = useAppStore(s => s.orchestrationMode)
  const activeTaskGraph = useAppStore(s => s.activeTaskGraph)
  const activeGraphId = useAppStore(s => s.activeGraphId)
  const setActiveTaskGraph = useAppStore(s => s.setActiveTaskGraph)
  const setActiveGraphId = useAppStore(s => s.setActiveGraphId)
  const setOrchestrationMode = useAppStore(s => s.setOrchestrationMode)
  const updateTaskInGraph = useAppStore(s => s.updateTaskInGraph)
  const setChatSidebarOpen = useAppStore(s => s.setChatSidebarOpen)
  const addToast = useAppStore(s => s.addToast)

  const [tab, setTab] = useState<TabVal>('chat')
  const [input, setInput] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>(multiAgentActiveNames)
  const [summaryStyle, setSummaryStyle] = useState('executive')
  const [translateLang, setTranslateLang] = useState('Spanish')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msgId: string; content: string } | null>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const [pendingApproval, setPendingApproval] = useState<{ toolName: string; args: Record<string, unknown>; category: string } | null>(null)
    const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
    const [thinkingElapsed, setThinkingElapsed] = useState(0) // ms since last token during long thinking
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // Init speech recognition
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { addToast('warning', 'Speech recognition not available'); return }
    const rec = new SpeechRecognition()
    rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US'
    rec.onresult = (e: any) => { setInput((prev) => prev + e.results[0][0].transcript); setListening(false) }
    rec.onerror = () => { setListening(false); addToast('error', 'Speech recognition failed') }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start(); setListening(true)
  }

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false) }

  const handleMessageContext = (e: React.MouseEvent, msgId: string, content: string) => {
    e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, msgId, content })
  }

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {})
    addToast('success', 'Copied to clipboard'); setCtxMenu(null)
  }

  const handleInsertMessage = (content: string) => {
    useAppStore.getState().setPendingEditorOperation({ type: 'insert', content, position: 'cursor' })
    addToast('success', 'Inserted into document'); setCtxMenu(null)
  }

  const handleRetryMessage = (msgId: string) => {
    setCtxMenu(null)
    const msgIndex = chatMessages.findIndex(m => m.id === msgId)
    if (msgIndex > 0) {
      const prevMsg = chatMessages[msgIndex - 1]
      if (prevMsg.role === 'user') setInput(prevMsg.content)
    }
  }

  const handleDeleteMessage = (msgId: string) => {
    setCtxMenu(null)
    // Remove from local state via store
    const state = useAppStore.getState()
    const filtered = state.chatMessages.filter(m => m.id !== msgId)
    // Rebuild chat messages — use clear + re-add pattern
    state.clearChat()
    filtered.forEach(m => state.addChatMessage(m))
  }

  // Scroll detection
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const check = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100)
    }
    container.addEventListener('scroll', check)
    return () => container.removeEventListener('scroll', check)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load sessions on mount
  useEffect(() => {
    window.wordapp?.agent.sessionList().then((sessions: AgentSession[] | undefined) => {
      if (sessions) setAgentSessions(sessions as AgentSession[])
    }).catch((err: unknown) => addToast('warning', `Failed to load sessions: ${(err as Error).message}`))
    window.wordapp?.agent.profiles().then((profiles: AgentProfile[] | undefined) => {
      if (profiles) setAgentProfiles(profiles as AgentProfile[])
    }).catch((err: unknown) => addToast('warning', `Failed to load agent profiles: ${(err as Error).message}`))
  }, [])

  // ─── Stream event listeners ───
  useEffect(() => {
    const unsubToken = window.wordapp?.on('agent-stream-token', (data: { token: string; fullContent: string; isFollowUp?: boolean }) => {
      const state = useAppStore.getState()
      if (state.chatStreamingId) state.appendChatStreamToken(state.chatStreamingId, data.token)
    })
    const unsubDone = window.wordapp?.on('agent-stream-done', (data: { fullContent: string; toolCalls: any[] }) => {
          const state = useAppStore.getState()
          if (state.chatStreamingId) state.finalizeStreamingMessage(state.chatStreamingId, data.fullContent)
          state.setChatLoading(false); state.setAgentStatus(''); setThinkingElapsed(0)
        })
        const unsubError = window.wordapp?.on('agent-stream-error', (data: { error: string }) => {
          const state = useAppStore.getState()
          state.addChatErrorMessage(data.error); state.setChatLoading(false); state.setAgentStatus(''); setThinkingElapsed(0)
        })
    const unsubToolResults = window.wordapp?.on('agent-tool-results', () => {
      useAppStore.getState().setAgentStatus('Editing document...')
    })
    const unsubChainTurn = window.wordapp?.on('agent-chain-turn', (data: { turn: number; maxTurns: number }) => {
          useAppStore.getState().setAgentStatus(`Working... (step ${data.turn}/${data.maxTurns})`)
        })
        const unsubThinkingPulse = window.wordapp?.on('agent-thinking-pulse', (data: { elapsed: number }) => {
          setThinkingElapsed(data.elapsed)
        })
        const unsubToolApply = window.wordapp?.on('agent-tool-apply', (data: { tool: string; args: Record<string, unknown> }) => {
              const state = useAppStore.getState()
              const threshold = state.agentAutoApplyThreshold

              if (data.tool === 'document_replace') {
                if (threshold >= 100) {
                  // Auto-apply: skip review, directly set pending operation
                  state.setPendingEditorOperation({
                    type: 'replace',
                    search: data.args.search as string,
                    replace: data.args.replace as string,
                    replaceAll: data.args.replaceAll as boolean | undefined,
                  })
                } else {
                  state.addAgentReview({ type: 'replace', search: data.args.search as string, replace: data.args.replace as string, replaceAll: data.args.replaceAll as boolean | undefined })
                }
              } else if (data.tool === 'document_insert' || data.tool === 'document_insert_stream_end') {
                const cleaned = cleanAgentHtml(data.args.content as string)
                if (threshold >= 100) {
                  // Auto-apply: skip review, directly set pending operation
                  state.setPendingEditorOperation({
                    type: 'insert',
                    content: cleaned,
                    position: (data.args.position as 'end' | 'start' | 'cursor') || 'cursor',
                  })
                } else {
                  state.addAgentReview({ type: 'insert', content: cleaned, position: (data.args.position as 'end' | 'start' | 'cursor') || 'cursor' })
                }
              }
            })
    return () => { unsubToken?.(); unsubDone?.(); unsubError?.(); unsubToolApply?.(); unsubToolResults?.(); unsubChainTurn?.(); unsubThinkingPulse?.() }
  }, [])

  useEffect(() => {
      const unsub = window.wordapp?.on('agent:tool-approval-request', (data: { toolName: string; args: Record<string, unknown>; category: string }) => {
        setPendingApproval(data)
      })
      const unsubHint = window.wordapp?.on('agent-permission-hint', (data: { category: string; toolName: string }) => {
        addToast('info', `Agent tried to use "${data.toolName}" but needs approval. Enable auto-approve for "${data.category}" in Settings → Agent → Permissions.`)
      })
      return () => { unsub?.(); unsubHint?.() }
    }, [addToast])

  // Task graph live updates
  useEffect(() => {
    const unsubGraphCreated = window.wordapp?.on('agent-task-graph-created', (data: { graphId: string; tasks: AgentTask[] }) => {
      setActiveGraphId(data.graphId)
      setActiveTaskGraph(data.tasks)
    })
    const unsubTaskUpdated = window.wordapp?.on('agent-task-updated', (data: { graphId: string; task: AgentTask }) => {
      updateTaskInGraph(data.task)
    })
    return () => { unsubGraphCreated?.(); unsubTaskUpdated?.() }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [chatMessages, multiAgentResults])

  // ─── Handlers (same as before) ───
  const handleSend = async () => {
    if (!validateInput(input) || chatLoading) return
    const userMsg = input.trim(); setInput('')
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: userMsg, timestamp: Date.now() })
    if (agentActiveSessionId) window.wordapp?.agent.sessionAddMessage(agentActiveSessionId, 'user', userMsg)
    const assistantId = crypto.randomUUID()
    addChatMessage({ id: assistantId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now() })
    setChatStreamingId(assistantId); setChatLoading(true)
    try {
      let storyboardContent = ''
      if (currentFilePath) {
        try { const result = await window.wordapp?.storyboard.read(currentFilePath); storyboardContent = (result as any)?.content || '' } catch {}
      }
      await window.wordapp?.agent.chatStream(
        [...chatMessages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg }],
        { documentContent: documentContent.slice(0, 4000), currentBranch, storyboardContent, currentFilePath }
      )
      console.log('[SB DEBUG RENDERER] Sent chatStream with context:', {
        currentFilePath: currentFilePath || '(none)',
        hasStoryboardContent: !!storyboardContent,
        storyboardLen: storyboardContent.length,
      })
    } catch (err) { addChatErrorMessage(`Agent error: ${(err as Error).message}`); setChatLoading(false) }
  }

  const handleMultiRun = async () => {
    if (!validateInput(input)) return
    const userMsg = input.trim(); setInput(''); setMultiAgentResults([]); setChatLoading(true)
    try {
      const docId = useAppStore.getState().currentFilePath || useAppStore.getState().activeTabId
      const results = await window.wordapp?.agent.multiRun(docId, userMsg, selectedAgents, { documentContent: documentContent.slice(0, 4000), currentBranch })
      if (results) setMultiAgentResults(results as AgentMultiRunResult[])
    } catch (err) { addToast('error', `Multi-agent error: ${(err as Error).message}`) }
    setChatLoading(false)
  }

  const handleOrchestrate = async () => {
    if (!validateInput(input)) return
    const userMsg = input.trim(); setInput(''); setChatLoading(true); setActiveTaskGraph([] as AgentTask[])
    try {
      const docId = useAppStore.getState().currentFilePath || useAppStore.getState().activeTabId
      const results = await window.wordapp?.agent.orchestrate(docId, userMsg, {
        documentContent: documentContent.slice(0, 4000), currentBranch,
        currentFilePath: useAppStore.getState().currentFilePath || undefined
      })
      if (results) {
        setActiveTaskGraph(results as AgentTask[])
        const done = (results as AgentTask[]).filter(t => t.status === 'done')
        if (done.length > 0) {
          const summary = done.map(t => `**${t.agentName}** — ${t.title}:\n${t.result || '(no output)'}`).join('\n\n')
          addChatMessage({ id: crypto.randomUUID(), role: 'assistant' as const, content: summary, timestamp: Date.now() })
        }
      }
    } catch (err) { addToast('error', `Orchestration error: ${(err as Error).message}`) }
    setChatLoading(false)
  }

  const handleSummarize = async () => {
    setChatLoading(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Summarize this document (${summaryStyle} style)`, timestamp: Date.now() })
    try {
      const result = await window.wordapp?.agent.summarize(documentContent, summaryStyle, 200)
      if (result) addChatMessage({ id: crypto.randomUUID(), role: 'assistant' as const, content: result as string, timestamp: Date.now() })
    } catch (err) { addToast('error', `Summarize failed: ${(err as Error).message}`) }
    setChatLoading(false)
  }

  const handleTranslate = async () => {
    const selection = window.getSelection()?.toString() || ''
    if (!selection) { addToast('warning', 'Select text to translate'); return }
    setChatLoading(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Translate selection to ${translateLang}`, timestamp: Date.now() })
    const assistantId = crypto.randomUUID()
    addChatMessage({ id: assistantId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now() })
    setChatStreamingId(assistantId)
    try {
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: `Translate the following text to ${translateLang}. Return ONLY the translation:\n\n${selection}` }],
        { documentContent: documentContent.slice(0, 4000), currentBranch, selection, currentFilePath }
      )
    } catch (err) { addChatErrorMessage(`Translate failed: ${(err as Error).message}`); setChatLoading(false) }
  }

  const handleOutlineGenerate = async () => {
    if (!validateInput(input)) return
    const topic = input.trim(); setInput('')
    const assistantId = crypto.randomUUID()
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Generate outline for: ${topic}`, timestamp: Date.now() })
    addChatMessage({ id: assistantId, role: 'assistant' as const, content: '', streaming: true, timestamp: Date.now() })
    setChatStreamingId(assistantId); setChatLoading(true)
    try {
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: `Use the outline_generate tool to generate a 2-level outline for the topic: ${topic}` }],
        { documentContent: documentContent.slice(0, 4000), currentBranch, currentFilePath }
      )
    } catch (err) { addChatErrorMessage(`Outline generation failed: ${(err as Error).message}`); setChatLoading(false) }
  }

  const handleNewSession = async (agentName: string) => {
    const docId = useAppStore.getState().currentFilePath || useAppStore.getState().activeTabId
    const session = await window.wordapp?.agent.sessionGetOrCreate(docId, agentName)
    if (session) {
      setAgentActiveSessionId((session as AgentSession).id)
      const sessions = await window.wordapp?.agent.sessionList(docId)
      if (sessions) setAgentSessions(sessions as AgentSession[])
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    await window.wordapp?.agent.sessionDelete(sessionId)
    if (agentActiveSessionId === sessionId) setAgentActiveSessionId(null)
    const sessions = await window.wordapp?.agent.sessionList()
    if (sessions) setAgentSessions(sessions as AgentSession[])
  }

  const handleLoadSession = async (sessionId: string) => {
    setAgentActiveSessionId(sessionId)
    const messages = await window.wordapp?.agent.sessionMessages(sessionId)
    if (messages) {
      const chatMsgs = (messages as Array<{ role: string; content: string }>).map((m) => ({
        id: crypto.randomUUID(), role: (m.role as 'user' | 'assistant' | 'system' | 'error') || 'assistant',
        content: m.content, streaming: false, timestamp: Date.now()
      }))
      useAppStore.getState().clearChat()
      for (const msg of chatMsgs) addChatMessage(msg)
    }
  }

  if (!chatSidebarOpen) return null

  // ─── Empty state ───
  const showEmptyState = tab === 'chat' && chatMessages.length === 0 && !chatLoading

  return (
    <>
      <Paper sx={{ width: 360, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0 }}>
        {/* Header with tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
              <Typography variant="subtitle2">Agent Workspace</Typography>
              {pendingAgentReviews.length > 0 && (
                <Chip label={pendingAgentReviews.length} size="small" color="warning" sx={{ height: 18, fontSize: 10, minWidth: 18 }} />
              )}
            </Box>
            <IconButton size="small" onClick={() => setChatSidebarOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
          </Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 28, '& .MuiTab-root': { minHeight: 28, px: 1, fontSize: 10 } }}>
            <Tab label="Chat" value="chat" />
            <Tab label="Sessions" value="sessions" />
            <Tab icon={<GroupWorkIcon sx={{ fontSize: 14 }} />} value="multi" />
            <Tab label="Tools" value="tools" />
            <Tab label="Memory" value="memory" />
          </Tabs>
        </Box>

        <Box ref={messagesContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1.5, position: 'relative' }}>
          {tab === 'chat' && (
            <>
              {agentActiveSessionId && (
                <Chip label={`Session: ${agentActiveSessionId.split(':')[1]}`} size="small" variant="outlined" onDelete={() => setAgentActiveSessionId(null)} sx={{ mb: 1, fontSize: 9, height: 18 }} />
              )}

              {/* Empty state */}
              {showEmptyState && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, pt: 4 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 260 }}>
                    Ask the AI to write, edit, summarize, or translate your document
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                    <Chip label="Summarize this document" size="small" onClick={() => { setTab('tools'); handleSummarize() }} sx={{ fontSize: 10 }} />
                    <Chip label="Generate outline" size="small" onClick={() => { setTab('tools'); setInput(''); setTimeout(() => setTab('tools'), 0) }} sx={{ fontSize: 10 }} />
                    <Chip label="Translate selection" size="small" onClick={() => { setTab('tools') }} sx={{ fontSize: 10 }} />
                  </Box>
                </Box>
              )}

              {/* Messages */}
              {chatMessages.map((msg, idx) => {
                const isUser = msg.role === 'user'
                const isError = msg.role === 'error'
                const prevMsg = idx > 0 ? chatMessages[idx - 1] : null
                const sameSender = prevMsg && prevMsg.role === msg.role
                const showDateSep = !prevMsg || dateLabel(msg.timestamp || Date.now()) !== dateLabel(prevMsg.timestamp || Date.now())

                return (
                  <React.Fragment key={msg.id}>
                    {showDateSep && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1.5 }}>
                        <Divider sx={{ flex: 1 }} />
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>
                          {dateLabel(msg.timestamp || Date.now())}
                        </Typography>
                        <Divider sx={{ flex: 1 }} />
                      </Box>
                    )}
                    <Box
                      sx={{ mb: sameSender ? 0.25 : 1, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 1 }}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                    >
                      {/* Agent avatar */}
                      {!isUser && !sameSender && (
                        <Avatar sx={{ width: 24, height: 24, bgcolor: 'primary.main', fontSize: 11, flexShrink: 0 }}>A</Avatar>
                      )}
                      {!isUser && sameSender && <Box sx={{ width: 24, flexShrink: 0 }} />}

                      <Box sx={{ maxWidth: '80%' }}>
                        {/* Sender label */}
                        {!sameSender && (
                          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 9, color: isUser ? 'primary.light' : 'primary.main', mb: 0.25, display: 'block', textAlign: isUser ? 'right' : 'left' }}>
                            {isUser ? 'You' : isError ? 'Error' : 'Agent'}
                          </Typography>
                        )}

                        {/* Message bubble */}
                        <Box
                          onContextMenu={(e) => handleMessageContext(e, msg.id, msg.content)}
                          sx={{
                            p: 1.25, borderRadius: 2,
                            bgcolor: isUser ? 'primary.dark' : isError ? 'error.dark' : 'background.paper',
                            border: isUser ? 'none' : '1px solid',
                            borderColor: 'divider',
                            fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            cursor: 'context-menu',
                          }}
                        >
                          {msg.streaming && !msg.content && <TypingDots />}
                          {msg.content}
                          {msg.streaming && msg.content && (
                            <Box component="span" sx={{ display: 'inline-block', width: 8, height: 14, bgcolor: 'primary.main', ml: 0.25, animation: 'cursorBlink 1s step-end infinite', '@keyframes cursorBlink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } }, verticalAlign: 'text-bottom' }} />
                          )}
                        </Box>

                        {/* Timestamp */}
                        {!msg.streaming && (
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, mt: 0.25, display: 'block', textAlign: isUser ? 'right' : 'left' }}>
                            {relativeTime(msg.timestamp || Date.now())}
                          </Typography>
                        )}
                      </Box>

                      {/* User avatar */}
                      {isUser && !sameSender && (
                        <Avatar sx={{ width: 24, height: 24, bgcolor: 'secondary.main', fontSize: 11, flexShrink: 0 }}>U</Avatar>
                      )}
                      {isUser && sameSender && <Box sx={{ width: 24, flexShrink: 0 }} />}

                      {/* Hover actions */}
                      {hoveredMsgId === msg.id && !msg.streaming && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0 }}>
                          <Tooltip title="Copy" placement="top">
                            <IconButton size="small" onClick={() => handleCopyMessage(msg.content)} sx={{ p: 0.25 }}>
                              <ContentCopyIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                          </Tooltip>
                          {msg.role === 'assistant' && (
                            <Tooltip title="Insert into document" placement="top">
                              <IconButton size="small" onClick={() => handleInsertMessage(msg.content)} sx={{ p: 0.25 }}>
                                <SendIcon sx={{ fontSize: 12, transform: 'rotate(-90deg)' }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      )}
                    </Box>
                  </React.Fragment>
                )
              })}
              <div ref={messagesEndRef} />

              {/* Scroll-to-bottom FAB */}
              {showScrollBtn && (
                <Fab
                  size="small"
                  onClick={scrollToBottom}
                  sx={{ position: 'sticky', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, boxShadow: 3 }}
                >
                  <KeyboardArrowDownIcon />
                </Fab>
              )}
            </>
          )}

          {tab === 'sessions' && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Persistent agent sessions per document</Typography>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => handleNewSession('Default')} sx={{ mb: 1 }}>New Session</Button>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {agentSessions.length === 0 && (
                  <Typography variant="caption" color="text.secondary">No sessions yet</Typography>
                )}
                {agentSessions.map((s) => (
                  <Card key={s.id} variant="outlined" sx={{ bgcolor: agentActiveSessionId === s.id ? 'action.selected' : 'transparent' }}>
                    <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                        <PersonIcon sx={{ fontSize: 12 }} />
                        <Typography variant="caption" fontWeight={600}>{s.agentName}</Typography>
                        {agentActiveSessionId === s.id && <Chip label="Active" size="small" color="primary" sx={{ height: 16, fontSize: 9 }} />}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                        {s.messages.length} msgs · {formatTime(s.updatedAt)}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ p: 0.5, pt: 0 }}>
                      <Button size="small" onClick={() => handleLoadSession(s.id)} sx={{ fontSize: 9 }}>Load</Button>
                      <IconButton size="small" color="error" onClick={() => handleDeleteSession(s.id)}><DeleteIcon sx={{ fontSize: 12 }} /></IconButton>
                    </CardActions>
                  </Card>
                ))}
              </Box>
            </>
          )}

          {tab === 'multi' && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                <FormControlLabel control={<Switch checked={multiAgentMode} onChange={(e) => setMultiAgentMode(e.target.checked)} />} label={<Typography variant="caption">Multi-Agent Mode</Typography>} />
                <FormControlLabel control={<Switch checked={orchestrationMode} onChange={(e) => setOrchestrationMode(e.target.checked)} />} label={<Typography variant="caption">Orchestration</Typography>} />
              </Box>
              {orchestrationMode && <TaskGraphPanel />}
              {!orchestrationMode && <>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Select agents to run in parallel:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                {agentProfiles.map((p) => (
                  <Chip key={p.id} label={p.name} size="small"
                    variant={selectedAgents.includes(p.name) ? 'filled' : 'outlined'}
                    onClick={() => setSelectedAgents((prev) => prev.includes(p.name) ? prev.filter((n) => n !== p.name) : [...prev, p.name])}
                    sx={{ fontSize: 10, height: 22, borderColor: p.color, ...(selectedAgents.includes(p.name) ? { bgcolor: p.color, color: '#fff' } : {}) }}
                  />
                ))}
              </Box>
              {multiAgentResults.map((r, i) => (
                <Card key={i} variant="outlined" sx={{ mb: 1, borderLeft: 3, borderColor: agentProfiles.find((p) => p.name === r.agentName)?.color || 'primary.main' }}>
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Avatar sx={{ width: 18, height: 18, fontSize: 9, bgcolor: agentProfiles.find((p) => p.name === r.agentName)?.color || 'primary.main' }}>
                        {r.agentName[0]}
                      </Avatar>
                      <Typography variant="caption" fontWeight={600}>{r.agentName}</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.content}</Typography>
                  </CardContent>
                </Card>
              ))}
              {multiAgentResults.length === 0 && !chatLoading && (
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 2 }}>
                  Select agents and send a message to run them in parallel.
                </Typography>
              )}
              </>}
            </>
          )}

          {tab === 'memory' && <MemoryPanel />}

          {tab === 'tools' && (
            <>
              <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Agent Tools</Typography>
              {/* Summarize */}
              <Card variant="outlined" sx={{ mb: 1.5 }}>
                <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <SummarizeIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" fontWeight={600}>Summarize</Typography>
                  </Box>
                  <FormControl size="small" fullWidth sx={{ mb: 0.5 }}>
                    <Select value={summaryStyle} onChange={(e) => setSummaryStyle(e.target.value)} sx={{ fontSize: 11, height: 28 }}>
                      <MenuItem value="executive" sx={{ fontSize: 11 }}>Executive Summary</MenuItem>
                      <MenuItem value="abstract" sx={{ fontSize: 11 }}>Academic Abstract</MenuItem>
                      <MenuItem value="tldr" sx={{ fontSize: 11 }}>TL;DR</MenuItem>
                      <MenuItem value="bullets" sx={{ fontSize: 11 }}>Bullet Points</MenuItem>
                    </Select>
                  </FormControl>
                </CardContent>
                <CardActions sx={{ p: 1, pt: 0 }}>
                  <Button size="small" variant="contained" fullWidth onClick={handleSummarize} disabled={chatLoading}>Generate Summary</Button>
                </CardActions>
              </Card>
              {/* Translate */}
              <Card variant="outlined" sx={{ mb: 1.5 }}>
                <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <TranslateIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" fontWeight={600}>Translate</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Select text in editor first</Typography>
                  <FormControl size="small" fullWidth sx={{ mb: 0.5 }}>
                    <Select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)} sx={{ fontSize: 11, height: 28 }}>
                      {['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Greek', 'Polish', 'Czech', 'Romanian', 'Hungarian', 'Turkish', 'Russian', 'Arabic', 'Chinese', 'Japanese', 'Korean', 'Scottish Gaelic'].map((l) => (
                        <MenuItem key={l} value={l} sx={{ fontSize: 11 }}>{l}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </CardContent>
                <CardActions sx={{ p: 1, pt: 0 }}>
                  <Button size="small" variant="contained" fullWidth onClick={handleTranslate} disabled={chatLoading}>Translate Selection</Button>
                </CardActions>
              </Card>
              {/* Outline Generate */}
              <Card variant="outlined" sx={{ mb: 1.5 }}>
                <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <AutoAwesomeIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" fontWeight={600}>Generate Outline</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Enter a topic to generate a document outline</Typography>
                </CardContent>
                <CardActions sx={{ p: 1, pt: 0 }}>
                  <Box sx={{ display: 'flex', gap: 0.5, width: '100%' }}>
                    <TextField size="small" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Topic..." sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }} onKeyDown={(e) => { if (e.key === 'Enter') handleOutlineGenerate() }} />
                    <Button size="small" variant="contained" onClick={handleOutlineGenerate} disabled={chatLoading || !input.trim()}>Generate</Button>
                  </Box>
                </CardActions>
              </Card>
            </>
          )}
        </Box>

        {/* Agent review queue */}
        {pendingAgentReviews.length > 0 && (
          <Alert
            severity="warning"
            action={
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button size="small" color="success" variant="contained" onClick={acceptAllAgentReviews} sx={{ fontSize: 10 }}>Accept All</Button>
                <Button size="small" color="error" variant="outlined" onClick={() => {
                  const ids = pendingAgentReviews.map(r => r.id)
                  ids.forEach(id => rejectAgentReview(id))
                }} sx={{ fontSize: 10 }}>Reject All</Button>
              </Box>
            }
            sx={{ borderRadius: 0, '& .MuiAlert-message': { fontSize: 11 } }}
          >
            {pendingAgentReviews.length} change{pendingAgentReviews.length > 1 ? 's' : ''} to review
            {pendingAgentReviews.map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <Typography variant="caption" sx={{ flex: 1, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.type === 'replace'
                    ? `Replace "${(r.search || '').slice(0, 30)}" → "${(r.replace || '').slice(0, 30)}"`
                    : `Insert "${(r.content || '').slice(0, 40)}${(r.content || '').length > 40 ? '...' : ''}"`}
                </Typography>
                <IconButton size="small" color="success" onClick={() => acceptAgentReview(r.id)} sx={{ p: 0.25 }}>✓</IconButton>
                <IconButton size="small" color="error" onClick={() => rejectAgentReview(r.id)} sx={{ p: 0.25 }}>✕</IconButton>
              </Box>
            ))}
          </Alert>
        )}

        {/* Background tasks */}
        {backgroundTasks.filter(t => t.status === 'running').map(t => (
          <Box key={t.id} sx={{ px: 1.5, py: 0.5, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={12} />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontSize: 10 }}>
              Background: {t.prompt.slice(0, 50)}{t.prompt.length > 50 ? '...' : ''}
            </Typography>
          </Box>
        ))}

        {/* Agent status indicator */}
                {chatLoading && agentStatus && (
                  <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      {agentStatus}
                    </Typography>
                    <TypingDots />
                  </Box>
                )}

                {/* Thinking animation — shows during long model pauses so user knows it hasn't crashed */}
                {thinkingElapsed > 2000 && (
                  <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      Thinking… {(thinkingElapsed / 1000).toFixed(0)}s
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, fontFamily: 'monospace', fontSize: 14 }}>
                      {['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'].map((c, i) => (
                        <Box key={i} component="span" sx={{
                          opacity: Math.abs((Math.floor(Date.now() / 120) % 10) - i) <= 1 ? 1 : 0.2,
                          color: 'var(--accent)',
                          transition: 'opacity 80ms',
                        }}>{c}</Box>
                      ))}
                    </Box>
                  </Box>
                )}

        {/* ─── Input bar ─── */}
        <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
          <TextField
            fullWidth size="small" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (orchestrationMode && tab === 'multi') handleOrchestrate()
                else if (multiAgentMode && tab !== 'tools') handleMultiRun()
                else handleSend()
              }
            }}
            placeholder={chatLoading ? 'Agent is responding...' : orchestrationMode && tab === 'multi' ? 'Orchestrate a task...' : multiAgentMode && tab !== 'tools' ? `Ask ${selectedAgents.join(' + ')}...` : 'Ask the AI...'}
            disabled={chatLoading}
            multiline maxRows={6}
            sx={{ '& .MuiInputBase-input': { fontSize: 12 } }}
          />
          <Tooltip title={listening ? 'Stop listening' : 'Voice input'}>
            <IconButton size="small" onClick={listening ? stopListening : startListening} color={listening ? 'error' : 'default'}>
              {listening ? <MicOffIcon sx={{ fontSize: 16 }} /> : <MicIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          {(orchestrationMode && tab === 'multi') ? (
            <IconButton size="small" color="primary" onClick={handleOrchestrate} disabled={chatLoading || !input.trim()}>
              <GroupWorkIcon sx={{ fontSize: 18 }} />
            </IconButton>
          ) : (multiAgentMode && tab !== 'tools') ? (
            <IconButton size="small" color="primary" onClick={handleMultiRun} disabled={chatLoading || !input.trim()}>
              <GroupWorkIcon sx={{ fontSize: 18 }} />
            </IconButton>
          ) : (
            <IconButton size="small" color="primary" onClick={handleSend} disabled={chatLoading || !input.trim()}>
              <SendIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          {!multiAgentMode && !orchestrationMode && tab === 'chat' && input.trim() && !chatLoading && (
            <Tooltip title="Run in background">
              <IconButton size="small" onClick={async () => {
                const prompt = input.trim(); setInput('')
                const taskId = addBackgroundTask(prompt)
                addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: prompt, timestamp: Date.now() })
                try {
                  await window.wordapp?.agent.chatStream(
                    [{ role: 'user', content: prompt }],
                    { documentContent: documentContent.slice(0, 4000), currentBranch, currentFilePath }
                  )
                  updateBackgroundTask(taskId, { status: 'done', result: 'Completed' })
                  addToast('success', `Background task completed: ${prompt.slice(0, 40)}`)
                } catch (err) {
                  updateBackgroundTask(taskId, { status: 'error', error: (err as Error).message })
                  addToast('error', `Background task failed: ${(err as Error).message}`)
                }
              }}>
                <ScheduleIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {chatLoading && (
            <IconButton size="small" onClick={() => window.wordapp?.agent.abort()}>
              <StopIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
        {/* Token count footer */}
        {chatMessages.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.25, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9 }}>
              ~{Math.round(chatMessages.reduce((sum, m) => sum + m.content.length, 0) / 4)} tokens
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Context menu */}
      <Menu open={!!ctxMenu} onClose={() => setCtxMenu(null)} anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.y, left: ctxMenu.x } : undefined}>
        <MenuItem onClick={() => handleInsertMessage(ctxMenu?.content || '')} sx={{ fontSize: 12 }}>📄 Insert into document</MenuItem>
        <MenuItem onClick={() => handleCopyMessage(ctxMenu?.content || '')} sx={{ fontSize: 12 }}>📋 Copy</MenuItem>
        <MenuItem onClick={() => handleRetryMessage(ctxMenu?.msgId || '')} sx={{ fontSize: 12 }}>🔄 Edit prompt & retry</MenuItem>
        <MenuItem onClick={() => handleDeleteMessage(ctxMenu?.msgId || '')} sx={{ fontSize: 12 }}>🗑 Delete</MenuItem>
      </Menu>

      {/* Tool approval dialog */}
      <Dialog open={!!pendingApproval} onClose={() => { window.wordapp?.agent.confirmToolApproval(false); setPendingApproval(null) }}>
        <DialogTitle>Agent Approval Required</DialogTitle>
        <DialogContent>
          <Typography>The agent wants to execute: <strong>{pendingApproval?.toolName}</strong></Typography>
          <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>Category: {pendingApproval?.category}</Typography>
          <Box sx={{ mt: 2, p: 1, bgcolor: 'var(--bg-secondary)', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
            <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace' }}>{JSON.stringify(pendingApproval?.args, null, 2)}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { window.wordapp?.agent.confirmToolApproval(false); setPendingApproval(null) }}>Deny</Button>
          <Button variant="contained" onClick={() => { window.wordapp?.agent.confirmToolApproval(true); setPendingApproval(null) }}>Approve</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
