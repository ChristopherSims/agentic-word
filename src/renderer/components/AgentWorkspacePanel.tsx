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

  // Load sessions on mount
  useEffect(() => {
    window.wordapp?.agent.sessionList().then((sessions) => {
      if (sessions) setAgentSessions(sessions as any)
    }).catch(() => {})
    window.wordapp?.agent.profiles().then((profiles) => {
      if (profiles) setAgentProfiles(profiles as any)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, multiAgentResults])

  // ─── Single-agent chat (with session persistence) ───
  const handleSend = async () => {
    if (!input.trim() || chatLoading) return
    const userMsg = input.trim()
    setInput('')
    addChatMessage({ id: crypto.randomUUID(), role: 'user', content: userMsg })

    // Persist to session
    if (agentActiveSessionId) {
      window.wordapp?.agent.sessionAddMessage(agentActiveSessionId, 'user', userMsg)
    }

    setChatLoading(true)
    try {
      await window.wordapp?.agent.chatStream(
        [...chatMessages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg }],
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
    } catch (err) {
      addToast('error', `Agent error: ${(err as Error).message}`)
    }
    setChatLoading(false)
  }

  // ─── Multi-agent run ───
  const handleMultiRun = async () => {
    if (!input.trim()) return
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
      if (results) setMultiAgentResults(results as any)
    } catch (err) {
      addToast('error', `Multi-agent error: ${(err as Error).message}`)
    }
    setChatLoading(false)
  }

  // ─── Summarize tool ───
  const handleSummarize = async () => {
    setChatLoading(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user', content: `Summarize this document (${summaryStyle} style)` })
    try {
      const result = await window.wordapp?.agent.summarize(documentContent, summaryStyle, 200)
      if (result) addChatMessage({ id: crypto.randomUUID(), role: 'assistant', content: result as string })
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
    addChatMessage({ id: crypto.randomUUID(), role: 'user', content: `Translate selection to ${translateLang}` })
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
    if (!input.trim()) return
    const topic = input.trim()
    setInput('')
    setChatLoading(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user', content: `Generate outline for: ${topic}` })
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
      setAgentActiveSessionId((session as any).id)
      // Refresh sessions
      const sessions = await window.wordapp?.agent.sessionList(docId)
      if (sessions) setAgentSessions(sessions as any)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    await window.wordapp?.agent.sessionDelete(sessionId)
    if (agentActiveSessionId === sessionId) setAgentActiveSessionId(null)
    const sessions = await window.wordapp?.agent.sessionList()
    if (sessions) setAgentSessions(sessions as any)
  }

  const handleLoadSession = async (sessionId: string) => {
    setAgentActiveSessionId(sessionId)
    const messages = await window.wordapp?.agent.sessionMessages(sessionId)
    if (messages) {
      // Load session messages into chat
      const chatMsgs = (messages as any).map((m: any) => ({
        id: crypto.randomUUID(),
        role: m.role,
        content: m.content,
        streaming: false
      }))
      // Clear and reload
      useAppStore.getState().clearChat()
      for (const msg of chatMsgs) addChatMessage(msg)
    }
  }

  if (!chatSidebarOpen) return null

  const formatTime = (ts: number) => new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString().slice(0, 5)

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
        {/* ─── Chat Tab ─── */}
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
                  <Typography variant="caption" fontWeight={600} sx={{ fontSize: 9, color: msg.role === 'user' ? 'primary.contrastText' : msg.role === 'assistant' ? 'primary.main' : 'error.main', display: 'block', mb: 0.25 }}>
                    {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Agent' : msg.role}
                  </Typography>
                  {msg.content}
                </Box>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}

        {/* ─── Sessions Tab ─── */}
        {tab === 'sessions' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Persistent agent sessions per document</Typography>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => handleNewSession('Default')} sx={{ mb: 1 }}>New Session</Button>

            <List dense>
              {agentSessions.length === 0 && (
                <ListItem><ListItemText primary="No sessions yet" primaryTypographyProps={{ fontSize: 11, color: 'text.secondary' }} /></ListItem>
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
                    primaryTypographyProps={{ fontSize: 11 }}
                    secondaryTypographyProps={{ fontSize: 9 }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {/* ─── Multi-Agent Tab ─── */}
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

        {/* ─── Tools Tab ─── */}
        {tab === 'tools' && (
          <>
            <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>Agent Tools</Typography>

            {/* Summarize */}
            <Box sx={{ mb: 2, p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
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
              <Button size="small" variant="contained" fullWidth onClick={handleSummarize} disabled={chatLoading}>Generate Summary</Button>
            </Box>

            {/* Translate */}
            <Box sx={{ mb: 2, p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <TranslateIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption" fontWeight={600}>Translate</Typography>
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
                <Typography variant="caption" fontWeight={600}>Generate Outline</Typography>
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
