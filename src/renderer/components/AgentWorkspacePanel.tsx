/// <reference path="../window.d.ts" />
import React, { useEffect, useState, type FC } from 'react'
import { Box, Paper, Typography, IconButton, TextField, Button, Chip, Tabs, Tab, List, ListItem, ListItemText, Divider, Tooltip, Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel } from '@mui/material'
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
import { useAppStore } from '../store/app-store'
import { formatTime, validateInput } from '../utils'
import type { AgentSession, AgentProfile, AgentMultiRunResult } from '../types'

type TabVal = 'chat' | 'sessions' | 'multi' | 'tools'

export const AgentWorkspacePanel: FC = () => {
  const {
    chatSidebarOpen, chatMessages, chatLoading, chatStreamingId,
    addChatMessage, setChatLoading, setChatStreamingId, setChatStreamContent,
    updateStreamingMessage, documentContent, currentBranch,
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

  // Debug: Log whenever messages change
  useEffect(() => {
    console.log('[AgentWorkspacePanel] chatMessages updated:', chatMessages.length, 'messages')
    if (chatMessages.length > 0) {
      console.log('[AgentWorkspacePanel] Last message:', chatMessages[chatMessages.length - 1])
    }
  }, [chatMessages])

  // Debug: Log streaming state
  useEffect(() => {
    console.log('[AgentWorkspacePanel] chatLoading:', chatLoading, 'chatStreamingId:', chatStreamingId)
  }, [chatLoading, chatStreamingId])

  // Debug: Check window.wordapp availability
  useEffect(() => {
    console.log('[AgentWorkspacePanel] window.wordapp available:', !!window.wordapp)
    if (window.wordapp) {
      console.log('[AgentWorkspacePanel] window.wordapp.agent available:', !!window.wordapp.agent)
      console.log('[AgentWorkspacePanel] window.wordapp.agent.chatStream:', typeof window.wordapp.agent.chatStream)
    }
  }, [])

  // Load sessions on mount
  useEffect(() => {
    console.log('[AgentWorkspacePanel] Mounting - loading sessions and profiles')
    window.wordapp?.agent.sessionList().then((sessions: AgentSession[] | undefined) => {
      console.log('[AgentWorkspacePanel] Sessions loaded:', sessions?.length || 0)
      if (sessions) setAgentSessions(sessions as AgentSession[])
    }).catch((err: unknown) => {
      console.error('[AgentWorkspacePanel] Failed to load sessions:', err)
      addToast('warning', `Failed to load sessions: ${(err as Error).message}`)
    })
    window.wordapp?.agent.profiles().then((profiles: AgentProfile[] | undefined) => {
      console.log('[AgentWorkspacePanel] Profiles loaded:', profiles?.length || 0)
      if (profiles) setAgentProfiles(profiles as AgentProfile[])
    }).catch((err: unknown) => {
      console.error('[AgentWorkspacePanel] Failed to load profiles:', err)
      addToast('warning', `Failed to load agent profiles: ${(err as Error).message}`)
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, multiAgentResults])

  // ─── Setup listeners for agent streaming responses ───
  useEffect(() => {
    console.log('[AgentWorkspacePanel] Setting up agent streaming listeners')
    
    const handleToken = (data: unknown) => {
      console.log('[AgentWorkspacePanel] Received agent-stream-token:', data)
      const tokenData = data as { token?: string; fullContent?: string }
      if (tokenData.token) {
        // Update store with new token
        setChatStreamContent(tokenData.token)
      }
    }

    const handleDone = (data: unknown) => {
      console.log('[AgentWorkspacePanel] Received agent-stream-done:', data)
      const doneData = data as { fullContent?: string; toolCalls?: unknown[] }
      // Finalize the message
      if (doneData.fullContent) {
        // Get current streaming ID from store
        const currentStreamId = useAppStore.getState().chatStreamingId
        if (currentStreamId) {
          useAppStore.getState().updateStreamingMessage(currentStreamId, doneData.fullContent)
        }
      }
      useAppStore.getState().setChatStreamingId(null)
      useAppStore.getState().setChatStreamContent('')
    }

    const handleError = (data: unknown) => {
      console.error('[AgentWorkspacePanel] Received agent-stream-error:', data)
      const errorData = data as { error?: string }
      useAppStore.getState().addToast('error', `Agent stream error: ${errorData.error || 'Unknown error'}`)
      useAppStore.getState().setChatStreamingId(null)
      useAppStore.getState().setChatStreamContent('')
    }

    const unsubToken = window.wordapp?.on('agent-stream-token', handleToken as any) as (() => void) | undefined
    const unsubDone = window.wordapp?.on('agent-stream-done', handleDone as any) as (() => void) | undefined
    const unsubError = window.wordapp?.on('agent-stream-error', handleError as any) as (() => void) | undefined

    const handleToolApply = (data: unknown) => {
      console.log('[AgentWorkspacePanel] Received agent-tool-apply:', data)
      const toolData = data as { tool?: string; args?: Record<string, unknown> }
      
      // Dispatch tool actions to editor
      if (toolData.tool === 'document_insert') {
        const args = toolData.args as { content?: string; position?: string }
        console.log('[AgentWorkspacePanel] Applying document_insert:', args)
        window.wordapp?.editor.insertContent(args.content || '', (args.position || 'end') as 'end' | 'start' | 'cursor')
        useAppStore.getState().addToast('info', `Inserted content at ${args.position}`)
      } else if (toolData.tool === 'document_replace') {
        const args = toolData.args as { search?: string; replace?: string; replaceAll?: boolean }
        console.log('[AgentWorkspacePanel] Applying document_replace:', args)
        window.wordapp?.editor.replaceText(args.search || '', args.replace || '', args.replaceAll !== false)
        useAppStore.getState().addToast('info', `Replaced "${args.search}" with "${args.replace}"`)
      }
    }

    const unsubToolApply = window.wordapp?.on('agent-tool-apply', handleToolApply as any) as (() => void) | undefined

    return () => {
      console.log('[AgentWorkspacePanel] Cleaning up streaming listeners')
      // Properly unsubscribe from listeners
      unsubToken?.()
      unsubDone?.()
      unsubError?.()
      unsubToolApply?.()
    }
  }, []) // Empty dependency array - only set up once on mount

  // ─── Single-agent chat (with session persistence) ───
  const handleSend = async () => {
    if (!validateInput(input) || chatLoading) return
    const userMsg = input.trim()
    console.log('[AgentWorkspacePanel] handleSend - userMsg:', userMsg)
    setInput('')
    const userMsgId = crypto.randomUUID()
    addChatMessage({ id: userMsgId, role: 'user' as const, content: userMsg })

    // Create placeholder for assistant message
    const assistantMsgId = crypto.randomUUID()
    addChatMessage({ id: assistantMsgId, role: 'assistant' as const, content: '', streaming: true })
    setChatStreamingId(assistantMsgId)

    // Persist to session
    if (agentActiveSessionId) {
      console.log('[AgentWorkspacePanel] Saving message to session:', agentActiveSessionId)
      window.wordapp?.agent.sessionAddMessage(agentActiveSessionId, 'user', userMsg)
    }

    setChatLoading(true)
    try {
      console.log('[AgentWorkspacePanel] Calling chatStream with', chatMessages.length + 1, 'messages')
      const messagesPayload = [...chatMessages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg }]
      console.log('[AgentWorkspacePanel] Messages payload:', messagesPayload)
      console.log('[AgentWorkspacePanel] Document content length:', documentContent.length, 'Branch:', currentBranch)
      console.log('[AgentWorkspacePanel] window.wordapp.agent.chatStream:', window.wordapp?.agent.chatStream)
      
      const result = await window.wordapp?.agent.chatStream(
        messagesPayload,
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
      console.log('[AgentWorkspacePanel] chatStream completed successfully, result:', result)
    } catch (err) {
      console.error('[AgentWorkspacePanel] Agent error caught:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[AgentWorkspacePanel] Error details:', { name: (err as Error).name, message: (err as Error).message, stack: (err as Error).stack })
      addToast('error', `Agent error: ${errorMsg}`)
      // Clean up the streaming state on error
      setChatStreamingId(null)
      setChatStreamContent('')
    }
    setChatLoading(false)
  }

  // ─── Multi-agent run ───
  const handleMultiRun = async () => {
    if (!validateInput(input)) return
    const userMsg = input.trim()
    console.log('[AgentWorkspacePanel] handleMultiRun - userMsg:', userMsg, 'agents:', selectedAgents)
    setInput('')
    setMultiAgentResults([])
    setChatLoading(true)

    try {
      const docId = useAppStore.getState().currentFilePath || useAppStore.getState().activeTabId
      console.log('[AgentWorkspacePanel] MultiRun - docId:', docId, 'agents:', selectedAgents)
      const results = await window.wordapp?.agent.multiRun(
        docId, userMsg, selectedAgents,
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
      console.log('[AgentWorkspacePanel] MultiRun results:', results)
      if (results) setMultiAgentResults(results as AgentMultiRunResult[])
    } catch (err) {
      console.error('[AgentWorkspacePanel] Multi-agent error:', err)
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
    try {
      // Use the agent chat with translate instruction
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: `Translate the following text to ${translateLang}. Return ONLY the translation:\n\n${selection}` }],
        { documentContent: documentContent.slice(0, 4000), currentBranch, selection }
      )
    } catch (err) {
      addToast('error', `Translate failed: ${(err as Error).message}`)
    }
    setChatLoading(false)
  }

  // ─── Outline generate tool ───
  const handleOutlineGenerate = async () => {
    if (!validateInput(input)) return
    const topic = input.trim()
    setInput('')
    setChatLoading(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: `Generate outline for: ${topic}` })
    try {
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: `Use the outline_generate tool to generate a 2-level outline for the topic: ${topic}` }],
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
    } catch (err) {
      addToast('error', `Outline generation failed: ${(err as Error).message}`)
    }
    setChatLoading(false)
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

  if (!chatSidebarOpen) {
    console.log('[AgentWorkspacePanel] Not rendering - chatSidebarOpen is false')
    return null
  }

  console.log('[AgentWorkspacePanel] Rendering with', chatMessages.length, 'messages, loading:', chatLoading)



  return (
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
                <Box sx={{ maxWidth: '85%', p: 1, borderRadius: 1.5, bgcolor: msg.role === 'user' ? 'primary.dark' : msg.role === 'assistant' ? 'action.hover' : msg.role === 'error' ? 'error.dark' : 'transparent', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 9, color: msg.role === 'user' ? 'primary.contrastText' : msg.role === 'assistant' ? 'primary.main' : 'error.main', display: 'block', mb: 0.25 }}>
                    {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Agent' : msg.role}
                  </Typography>
                  {msg.content}
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
                  {['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'Russian'].map((l) => (
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
        {(multiAgentMode && tab !== 'tools') ? (
          <IconButton size="small" color="primary" onClick={handleMultiRun} disabled={chatLoading || !input.trim()}>
            <GroupWorkIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : (
          <IconButton size="small" color="primary" onClick={handleSend} disabled={chatLoading || !input.trim()}>
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
        {chatLoading && (
          <IconButton size="small" onClick={() => window.wordapp?.agent.abort()}>
            <StopIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>
    </Paper>
  )
}
