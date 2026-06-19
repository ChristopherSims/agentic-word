/// <reference path="../window.d.ts" />
import React, { useEffect, useState, type FC } from 'react'
import { Box, Paper, Typography, IconButton, TextField, Button, Chip, Tabs, Tab, List, ListItem, ListItemText, Divider, Tooltip, Select, MenuItem, Menu, FormControl, InputLabel, Switch, FormControlLabel, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
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
import { useAppStore } from '../store/app-store'
import { formatTime, validateInput } from '../utils'
import type { AgentSession, AgentProfile, AgentMultiRunResult } from '../types'

type TabVal = 'chat' | 'sessions' | 'multi' | 'tools'

export const AgentWorkspacePanel: FC = () => {
  const {
    chatSidebarOpen, chatMessages, chatLoading, chatStreamingId,
    addChatMessage, setChatLoading, setChatStreamingId, setChatStreamContent,
    updateStreamingMessage, appendChatStreamToken, finalizeStreamingMessage, addChatErrorMessage,
    documentContent, currentBranch, currentFilePath,
    agentStatus, setAgentStatus,
    pendingAgentReviews, addAgentReview, removeAgentReview, acceptAgentReview, rejectAgentReview, acceptAllAgentReviews,
    backgroundTasks, addBackgroundTask, updateBackgroundTask,
    agentSessions, agentActiveSessionId, agentProfiles,
    multiAgentMode, multiAgentActiveNames, multiAgentResults,
    setAgentSessions, setAgentActiveSessionId, setAgentProfiles,
    setMultiAgentMode, setMultiAgentActiveNames, setMultiAgentResults,
    setChatSidebarOpen, addToast
  } = useAppStore()

  const [tab, setTab] = useState<TabVal>('chat')
  const [input, setInput] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>(multiAgentActiveNames)
  const [summaryStyle, setSummaryStyle] = useState('executive')
  const [translateLang, setTranslateLang] = useState('Spanish')
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msgId: string; content: string } | null>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = React.useRef<any>(null)
  const [pendingApproval, setPendingApproval] = useState<{ toolName: string; args: Record<string, unknown>; category: string } | null>(null)

  // Init speech recognition
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { addToast('warning', 'Speech recognition not available'); return }
    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      setInput((prev) => prev + transcript)
      setListening(false)
    }
    rec.onerror = () => { setListening(false); addToast('error', 'Speech recognition failed') }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  const handleMessageContext = (e: React.MouseEvent, msgId: string, content: string) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, msgId, content })
  }

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {})
    addToast('success', 'Copied to clipboard')
    setCtxMenu(null)
  }

  const handleInsertMessage = (content: string) => {
    useAppStore.getState().setPendingEditorOperation({ type: 'insert', content, position: 'cursor' })
    addToast('success', 'Inserted into document')
    setCtxMenu(null)
  }

  const handleRetryMessage = (msgId: string) => {
    setCtxMenu(null)
    const msgIndex = chatMessages.findIndex(m => m.id === msgId)
    if (msgIndex > 0) {
      const prevMsg = chatMessages[msgIndex - 1]
      if (prevMsg.role === 'user') {
        setInput(prevMsg.content)
      }
    }
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
      const streamingId = state.chatStreamingId
      if (!streamingId) return
      state.appendChatStreamToken(streamingId, data.token)
    })

    const unsubDone = window.wordapp?.on('agent-stream-done', (data: { fullContent: string; toolCalls: any[] }) => {
      const state = useAppStore.getState()
      if (state.chatStreamingId) {
        state.finalizeStreamingMessage(state.chatStreamingId, data.fullContent)
      }
      state.setChatLoading(false)
      state.setAgentStatus('')
    })

    const unsubError = window.wordapp?.on('agent-stream-error', (data: { error: string }) => {
      const state = useAppStore.getState()
      state.addChatErrorMessage(data.error)
      state.setChatLoading(false)
      state.setAgentStatus('')
    })

    // Typing indicator: track tool execution and multi-turn progress
    const unsubToolResults = window.wordapp?.on('agent-tool-results', () => {
      useAppStore.getState().setAgentStatus('Editing document...')
    })
    const unsubChainTurn = window.wordapp?.on('agent-chain-turn', (data: { turn: number; maxTurns: number }) => {
      useAppStore.getState().setAgentStatus(`Working... (step ${data.turn}/${data.maxTurns})`)
    })

    // Apply tool operations to the editor via store
    const unsubToolApply = window.wordapp?.on('agent-tool-apply', (data: { tool: string; args: Record<string, unknown> }) => {
      const state = useAppStore.getState()
      if (data.tool === 'document_replace') {
        state.addAgentReview({
          type: 'replace',
          search: data.args.search as string,
          replace: data.args.replace as string,
          replaceAll: data.args.replaceAll as boolean | undefined,
        })
      } else if (data.tool === 'document_insert' || data.tool === 'document_insert_stream_end') {
        state.addAgentReview({
          type: 'insert',
          content: data.args.content as string,
          position: (data.args.position as 'end' | 'start' | 'cursor') || 'cursor',
        })
      }
    })

    return () => {
          unsubToken?.()
          unsubDone?.()
          unsubError?.()
          unsubToolApply?.()
          unsubToolResults?.()
          unsubChainTurn?.()
        }
  }, [])

  // ─── Tool approval requests ───
  useEffect(() => {
    const unsub = window.wordapp?.on('agent:tool-approval-request', (data: { toolName: string; args: Record<string, unknown>; category: string }) => {
      setPendingApproval(data)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [chatMessages, multiAgentResults])

  // ─── Single-agent chat (with session persistence) ───
  const handleSend = async () => {
    if (!validateInput(input) || chatLoading) return
    const userMsg = input.trim()
    setInput('')
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: userMsg })

    // Persist to session
    if (agentActiveSessionId) {
      window.wordapp?.agent.sessionAddMessage(agentActiveSessionId, 'user', userMsg)
    }

    const assistantId = crypto.randomUUID()
    addChatMessage({ id: assistantId, role: 'assistant' as const, content: '', streaming: true })
    setChatStreamingId(assistantId)
    setChatLoading(true)

    try {
          // Load storyboard content if available
          let storyboardContent = ''
          if (currentFilePath) {
            try {
              const result = await window.wordapp?.storyboard.read(currentFilePath)
              storyboardContent = (result as any)?.content || ''
            } catch { /* no storyboard */ }
          }

          await window.wordapp?.agent.chatStream(
            [...chatMessages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg }],
            { documentContent: documentContent.slice(0, 4000), currentBranch, storyboardContent, currentFilePath }
          )
    } catch (err) {
      addChatErrorMessage(`Agent error: ${(err as Error).message}`)
      setChatLoading(false)
    }
  }

  // ─── Multi-agent run ───
  const handleMultiRun = async () => {
    if (!validateInput(input)) return
    const userMsg = input.trim()
    setInput('')
    setMultiAgentResults([])
    setChatLoading(true)

    try {
      const docId = useAppStore.getState().currentFilePath || useAppStore.getState().activeTabId
      const results = await window.wordapp?.agent.multiRun(
        docId, userMsg, selectedAgents,
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
      if (results) setMultiAgentResults(results as AgentMultiRunResult[])
    } catch (err) {
      addToast('error', `Multi-agent error: ${(err as Error).message}`)
    }
    setChatLoading(false)
  }

  // ─── Summarize tool ───
  const handleSummarize = async () => {
    setChatLoading(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Summarize this document (${summaryStyle} style)` })
    try {
      const result = await window.wordapp?.agent.summarize(documentContent, summaryStyle, 200)
      if (result) addChatMessage({ id: crypto.randomUUID(), role: 'assistant' as const, content: result as string })
    } catch (err) {
      addToast('error', `Summarize failed: ${(err as Error).message}`)
    }
    setChatLoading(false)
  }

  // ─── Translate tool ───
  const handleTranslate = async () => {
    const selection = window.getSelection()?.toString() || ''
    if (!selection) { addToast('warning', 'Select text to translate'); return }

    setChatLoading(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Translate selection to ${translateLang}` })

    const assistantId = crypto.randomUUID()
    addChatMessage({ id: assistantId, role: 'assistant' as const, content: '', streaming: true })
    setChatStreamingId(assistantId)

    try {
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: `Translate the following text to ${translateLang}. Return ONLY the translation:\n\n${selection}` }],
        { documentContent: documentContent.slice(0, 4000), currentBranch, selection }
      )
    } catch (err) {
      addChatErrorMessage(`Translate failed: ${(err as Error).message}`)
      setChatLoading(false)
    }
  }

  // ─── Outline generate tool ───
  const handleOutlineGenerate = async () => {
    if (!validateInput(input)) return
    const topic = input.trim()
    setInput('')

    const assistantId = crypto.randomUUID()
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Generate outline for: ${topic}` })
    addChatMessage({ id: assistantId, role: 'assistant' as const, content: '', streaming: true })
    setChatStreamingId(assistantId)
    setChatLoading(true)

    try {
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: `Use the outline_generate tool to generate a 2-level outline for the topic: ${topic}` }],
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
    } catch (err) {
      addChatErrorMessage(`Outline generation failed: ${(err as Error).message}`)
      setChatLoading(false)
    }
  }

  // ─── Session management ───
  const handleNewSession = async (agentName: string) => {
    const docId = useAppStore.getState().currentFilePath || useAppStore.getState().activeTabId
    const session = await window.wordapp?.agent.sessionGetOrCreate(docId, agentName)
    if (session) {
      setAgentActiveSessionId((session as AgentSession).id)
      // Refresh sessions
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
      // Load session messages into chat
      const chatMsgs = (messages as Array<{ role: string; content: string }>).map((m) => ({
        id: crypto.randomUUID(),
        role: (m.role as 'user' | 'assistant' | 'system' | 'error') || 'assistant',
        content: m.content,
        streaming: false
      }))
      // Clear and reload
      useAppStore.getState().clearChat()
      for (const msg of chatMsgs) addChatMessage(msg)
    }
  }

  if (!chatSidebarOpen) return null



  return (
    <>
      <Paper sx={{ width: 360, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0 }}>
      {/* Header with tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="subtitle2">Agent Workspace</Typography>
          </Box>
          <IconButton size="small" onClick={() => setChatSidebarOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 28, '& .MuiTab-root': { minHeight: 28, px: 1, fontSize: 10 } }}>
          <Tab label="Chat" value="chat" />
          <Tab label="Sessions" value="sessions" />
          <Tab icon={<GroupWorkIcon sx={{ fontSize: 14 }} />} value="multi" />
          <Tab label="Tools" value="tools" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {tab === 'chat' && (
          <>
            {/* Active session indicator */}
            {agentActiveSessionId && (
              <Chip label={`Session: ${agentActiveSessionId.split(':')[1]}`} size="small" variant="outlined" onDelete={() => setAgentActiveSessionId(null)} sx={{ mb: 1, fontSize: 9, height: 18 }} />
            )}

            {/* Messages */}
            {chatMessages.map((msg) => (
              <Box key={msg.id} sx={{ mb: 1, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <Box
                  onContextMenu={(e) => handleMessageContext(e, msg.id, msg.content)}
                  sx={{ maxWidth: '85%', p: 1, borderRadius: 1.5, bgcolor: msg.role === 'user' ? 'primary.dark' : msg.role === 'assistant' ? 'action.hover' : msg.role === 'error' ? 'error.dark' : 'transparent', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'context-menu' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 9, color: msg.role === 'user' ? 'primary.contrastText' : msg.role === 'assistant' ? 'primary.main' : 'error.main' }}>
                      {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Agent' : msg.role}
                    </Typography>
                    {msg.streaming && (
                      <CircularProgress size={8} thickness={6} sx={{ color: msg.role === 'user' ? 'primary.contrastText' : 'primary.main' }} />
                    )}
                  </Box>
                  {msg.content}
                  {/* Detect and render JSON outlines as interactive checklist */}
                  {(() => {
                    if (msg.role !== 'assistant') return null
                    try {
                      const trimmed = msg.content.trim()
                      // Check if content is a JSON array (outline)
                      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                        const outline = JSON.parse(trimmed)
                        if (Array.isArray(outline) && outline.length > 0 && outline[0].title) {
                          return (
                            <Box sx={{ mt: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                              <Typography variant="caption" sx={{ mb: 0.5, display: 'block', fontWeight: 600 }}>📋 Outline</Typography>
                              {outline.map((item: any, i: number) => (
                                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                  <Typography variant="caption" sx={{ fontSize: 10, flex: 1 }}>
                                    {item.level === 1 ? '📘' : item.level === 2 ? '📄' : '•'} {item.title}
                                  </Typography>
                                </Box>
                              ))}
                              <Button
                                size="small" variant="contained" sx={{ mt: 0.5, fontSize: 10 }}
                                onClick={async () => {
                                  addToast('info', `Writing ${outline.length} sections...`)
                                  for (const item of outline) {
                                    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Write the section: ${item.title}` })
                                    try {
                                      await window.wordapp?.agent.chatStream(
                                        [{ role: 'user', content: `Write a detailed section titled "${item.title}". ${item.children?.length ? `Include subsections for: ${item.children.map((c: any) => c.title).join(', ')}.` : ''}` }],
                                        { documentContent: documentContent.slice(0, 4000), currentBranch }
                                      )
                                    } catch (err) {
                                      addToast('error', `Failed writing "${item.title}": ${(err as Error).message}`)
                                    }
                                    await new Promise(r => setTimeout(r, 500)) // brief pause between sections
                                  }
                                  addToast('success', `Wrote ${outline.length} sections`)
                                }}
                              >
                                Write All Sections
                              </Button>
                            </Box>
                          )
                        }
                      }
                    } catch { /* not valid JSON outline */ }
                    return null
                  })()}
                </Box>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}

        {tab === 'sessions' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Persistent agent sessions per document</Typography>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => handleNewSession('Default')} sx={{ mb: 1 }}>New Session</Button>

            <List dense>
              {agentSessions.length === 0 && (
                <ListItem><ListItemText primary="No sessions yet" slotProps={{ primary: { sx: { fontSize: 11, color: 'text.secondary' } } }} /></ListItem>
              )}
              {agentSessions.map((s) => (
                <ListItem key={s.id} secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0.25 }}>
                    <Button size="small" onClick={() => handleLoadSession(s.id)} sx={{ fontSize: 9 }}>Load</Button>
                    <IconButton size="small" color="error" onClick={() => handleDeleteSession(s.id)}><DeleteIcon sx={{ fontSize: 12 }} /></IconButton>
                  </Box>
                }>
                  <ListItemText
                    primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><PersonIcon sx={{ fontSize: 12 }} />{s.agentName}</Box>}
                    secondary={`${s.messages.length} msgs · ${formatTime(s.updatedAt)}`}
                    slotProps={{ primary: { sx: { fontSize: 11 } }, secondary: { sx: { fontSize: 9 } } }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {tab === 'multi' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <FormControlLabel control={<Switch checked={multiAgentMode} onChange={(e) => setMultiAgentMode(e.target.checked)} />} label={<Typography variant="caption">Multi-Agent Mode</Typography>} />
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Select agents to run in parallel:</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
              {agentProfiles.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  size="small"
                  variant={selectedAgents.includes(p.name) ? 'filled' : 'outlined'}
                  onClick={() => setSelectedAgents((prev) => prev.includes(p.name) ? prev.filter((n) => n !== p.name) : [...prev, p.name])}
                  sx={{ fontSize: 10, height: 22, borderColor: p.color, ...(selectedAgents.includes(p.name) ? { bgcolor: p.color, color: '#fff' } : {}) }}
                />
              ))}
            </Box>

            {/* Multi-agent results */}
            {multiAgentResults.map((r, i) => (
              <Box key={i} sx={{ mb: 1.5, p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Chip label={r.agentName} size="small" sx={{ fontSize: 9, height: 16, bgcolor: agentProfiles.find((p) => p.name === r.agentName)?.color || 'primary.main', color: '#fff' }} />
                </Box>
                <Typography variant="caption" sx={{ fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.content}</Typography>
              </Box>
            ))}

            {multiAgentResults.length === 0 && !chatLoading && (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 2 }}>
                Select agents and send a message to run them in parallel.
              </Typography>
            )}
          </>
        )}

        {tab === 'tools' && (
          <>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Agent Tools</Typography>

            {/* Summarize */}
            <Box sx={{ mb: 2, p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <SummarizeIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>Summarize</Typography>
              </Box>
              <FormControl size="small" fullWidth sx={{ mb: 0.5 }}>
                <Select value={summaryStyle} onChange={(e) => setSummaryStyle(e.target.value)} sx={{ fontSize: 11, height: 28 }}>
                  <MenuItem value="executive" sx={{ fontSize: 11 }}>Executive Summary</MenuItem>
                  <MenuItem value="abstract" sx={{ fontSize: 11 }}>Academic Abstract</MenuItem>
                  <MenuItem value="tldr" sx={{ fontSize: 11 }}>TL;DR</MenuItem>
                  <MenuItem value="bullets" sx={{ fontSize: 11 }}>Bullet Points</MenuItem>
                </Select>
              </FormControl>
              <Button size="small" variant="contained" fullWidth onClick={handleSummarize} disabled={chatLoading}>Generate Summary</Button>
            </Box>

            {/* Translate */}
            <Box sx={{ mb: 2, p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <TranslateIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>Translate</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Select text in editor first</Typography>
              <FormControl size="small" fullWidth sx={{ mb: 0.5 }}>
                <Select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)} sx={{ fontSize: 11, height: 28 }}>
                  {['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Greek', 'Polish', 'Czech', 'Romanian', 'Hungarian', 'Turkish', 'Russian', 'Arabic', 'Chinese', 'Japanese', 'Korean', 'Scottish Gaelic'].map((l) => (
                    <MenuItem key={l} value={l} sx={{ fontSize: 11 }}>{l}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button size="small" variant="contained" fullWidth onClick={handleTranslate} disabled={chatLoading}>Translate Selection</Button>
            </Box>

            {/* Outline Generate */}
            <Box sx={{ mb: 2, p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <AutoAwesomeIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>Generate Outline</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Enter a topic to generate a document outline</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <TextField size="small" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Topic..." sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }} onKeyDown={(e) => { if (e.key === 'Enter') handleOutlineGenerate() }} />
                <Button size="small" variant="contained" onClick={handleOutlineGenerate} disabled={chatLoading || !input.trim()}>Generate</Button>
              </Box>
            </Box>
          </>
        )}
      </Box>

      {/* Agent review queue */}
      {pendingAgentReviews.length > 0 && (
        <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'warning.main', bgcolor: 'rgba(251, 191, 36, 0.05)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: pendingAgentReviews.length > 1 ? 0.5 : 0 }}>
            <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
              📝 {pendingAgentReviews.length} change{pendingAgentReviews.length > 1 ? 's' : ''} to review
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
              <Button size="small" variant="contained" color="success" onClick={acceptAllAgentReviews} sx={{ fontSize: 10, py: 0.25, minWidth: 0 }}>Accept All</Button>
              <Button size="small" variant="outlined" color="error" onClick={() => { while (pendingAgentReviews.length > 0) rejectAgentReview(pendingAgentReviews[0].id) }} sx={{ fontSize: 10, py: 0.25, minWidth: 0 }}>Reject All</Button>
            </Box>
          </Box>
          {pendingAgentReviews.map((r) => (
            <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.type === 'replace'
                  ? `Replace "${(r.search || '').slice(0, 30)}" → "${(r.replace || '').slice(0, 30)}"`
                  : `Insert "${(r.content || '').slice(0, 40)}${(r.content || '').length > 40 ? '...' : ''}"`}
              </Typography>
              <IconButton size="small" color="success" onClick={() => acceptAgentReview(r.id)} sx={{ p: 0.25 }}><Typography sx={{ fontSize: 14 }}>✓</Typography></IconButton>
              <IconButton size="small" color="error" onClick={() => rejectAgentReview(r.id)} sx={{ p: 0.25 }}><Typography sx={{ fontSize: 14 }}>✕</Typography></IconButton>
            </Box>
          ))}
        </Box>
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
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            {[0, 1, 2].map(i => (
              <Box key={i} sx={{
                width: 4, height: 4, borderRadius: '50%', bgcolor: 'var(--accent)',
                animation: 'pulse 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
                '@keyframes pulse': { '0%, 80%, 100%': { opacity: 0.3 }, '40%': { opacity: 1 } }
              }} />
            ))}
          </Box>
        </Box>
      )}

      {/* ─── Input bar ─── */}
      <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 0.5 }}>
        <TextField
          fullWidth size="small" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (multiAgentMode && tab !== 'tools') handleMultiRun()
              else handleSend()
            }
          }}
          placeholder={multiAgentMode && tab !== 'tools' ? `Ask ${selectedAgents.join(' + ')}...` : 'Ask the AI...'}
          disabled={chatLoading}
          sx={{ '& .MuiInputBase-input': { fontSize: 12 } }}
        />
        <Tooltip title={listening ? 'Stop listening' : 'Voice input'}>
          <IconButton size="small" onClick={listening ? stopListening : startListening} color={listening ? 'error' : 'default'}>
            {listening ? <MicOffIcon sx={{ fontSize: 16 }} /> : <MicIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
        {(multiAgentMode && tab !== 'tools') ? (
          <IconButton size="small" color="primary" onClick={handleMultiRun} disabled={chatLoading || !input.trim()}>
            <GroupWorkIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : (
          <IconButton size="small" color="primary" onClick={handleSend} disabled={chatLoading || !input.trim()}>
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
        {!multiAgentMode && tab === 'chat' && input.trim() && !chatLoading && (
          <Tooltip title="Run in background">
            <IconButton size="small" onClick={async () => {
              const prompt = input.trim()
              setInput('')
              const taskId = addBackgroundTask(prompt)
              addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: prompt })
              try {
                await window.wordapp?.agent.chatStream(
                  [{ role: 'user', content: prompt }],
                  { documentContent: documentContent.slice(0, 4000), currentBranch }
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
    <Menu
      open={!!ctxMenu}
      onClose={() => setCtxMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={ctxMenu ? { top: ctxMenu.y, left: ctxMenu.x } : undefined}
    >
      <MenuItem onClick={() => handleInsertMessage(ctxMenu?.content || '')} sx={{ fontSize: 12 }}>
        📄 Insert into document
      </MenuItem>
      <MenuItem onClick={() => handleCopyMessage(ctxMenu?.content || '')} sx={{ fontSize: 12 }}>
        📋 Copy
      </MenuItem>
      <MenuItem onClick={() => handleRetryMessage(ctxMenu?.msgId || '')} sx={{ fontSize: 12 }}>
        🔄 Edit prompt & retry
      </MenuItem>
    </Menu>
    <Dialog
      open={!!pendingApproval}
      onClose={() => { window.wordapp?.agent.confirmToolApproval(false); setPendingApproval(null) }}
    >
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
