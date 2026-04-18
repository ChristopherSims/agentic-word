import React, { useState, useEffect, type FC } from 'react'
import { Box, Paper, Typography, IconButton, TextField, Button, Chip, List, ListItem, ListItemAvatar, ListItemText, Avatar, Divider, Dialog, DialogTitle, DialogContent, DialogActions, Alert } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import LinkIcon from '@mui/icons-material/Link'
import StopIcon from '@mui/icons-material/Stop'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { useAppStore } from '../store/app-store'
import type { CollabStartResult, CollabStatusResult, CollabGenerateCodeResult } from '../types'
import { connectCollab, disconnectCollab } from '../collab-client'
import { validateInput } from '../utils'

export const CollabPanel: FC = () => {
  const { collabConnected, collabRoomCode, collabUsers, collabCursors, collabMcpPort, collabDisplayName, collabCursorColor, setCollabMcpPort } = useAppStore()
  const [joinCode, setJoinCode] = useState('')
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')
  const [portInput, setPortInput] = useState(String(collabMcpPort || 12345))

  const serverUrl = `ws://localhost:${collabMcpPort || 12345}`

  const handleStartServer = async () => {
    const result = await window.wordapp?.collab.start(collabMcpPort || 12345) as CollabStartResult | undefined
    if (result?.success) {
      useAppStore.getState().addToast('success', `Collab server started on port ${collabMcpPort || 12345}`)
    } else {
      useAppStore.getState().addToast('error', `Failed to start server: ${result?.error || 'unknown error'}`)
    }
  }

  const handleStopServer = async () => {
    if (collabConnected) disconnectCollab()
    await window.wordapp?.collab.stop()
    useAppStore.getState().addToast('info', 'Collab server stopped')
  }

  const handleShare = async () => {
    // Ensure server is running
    const status = await window.wordapp?.collab.status() as CollabStatusResult | undefined
    if (!status?.running) {
      await handleStartServer()
    }
    const result = await window.wordapp?.collab.generateCode() as CollabGenerateCodeResult | undefined
    const code = result?.code
    if (code) {
      setGeneratedCode(code)
      setShareDialogOpen(true)
      // Auto-connect as host — Y.Doc will be used by EditorPanel's Collaboration extension
      const ydoc = connectCollab(code, collabDisplayName, collabCursorColor, serverUrl)
      if (ydoc) {
        useAppStore.getState().addToast('success', `Connected to room ${code}`)
      }
    }
  }

  const handleJoin = () => {
    if (!validateInput(joinCode)) return
    const ydoc = connectCollab(joinCode.trim(), collabDisplayName, collabCursorColor, serverUrl)
    if (ydoc) {
      useAppStore.getState().addToast('success', `Connected to room ${joinCode}`)
    } else {
      useAppStore.getState().addToast('error', 'Failed to connect — check server URL and room code')
    }
  }

  const handleDisconnect = () => {
    disconnectCollab()
    useAppStore.getState().addToast('info', 'Disconnected from collab session')
  }

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode)
    useAppStore.getState().addToast('success', 'Room code copied to clipboard')
  }

  const handleSavePort = () => {
    const port = parseInt(portInput)
    if (isNaN(port) || port < 1 || port > 65535) {
      useAppStore.getState().addToast('error', 'Invalid port number (1-65535)')
      return
    }
    setCollabMcpPort(port)
    useAppStore.getState().addToast('success', `Collab server port set to ${port}`)
  }

  return (
    <>
      <Paper sx={{ width: 280, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2">Collaboration</Typography>
          <IconButton size="small" onClick={() => useAppStore.getState().setCollabPanelOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>

        <Box sx={{ p: 1.5, overflow: 'auto', flex: 1 }}>
          {/* Server Configuration */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Server Endpoint</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
            <TextField
              size="small"
              type="number"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              placeholder="Port"
              inputProps={{ min: 1, max: 65535 }}
              sx={{ flex: 1 }}
            />
            <Button size="small" variant="outlined" onClick={handleSavePort}>Set</Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            ws://localhost:{collabMcpPort || 12345}
          </Typography>

          {/* Connection controls */}
          {!collabConnected ? (
            <>
              <Button fullWidth variant="contained" size="small" startIcon={<LinkIcon />} onClick={handleShare} sx={{ mb: 1 }}>Share Document</Button>
              <Divider sx={{ my: 1 }}><Typography variant="caption" color="text.secondary">or join</Typography></Divider>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                <TextField size="small" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Room code" sx={{ flex: 1 }} inputProps={{ maxLength: 6, style: { textTransform: 'uppercase' } }} />
                <Button size="small" variant="outlined" onClick={handleJoin} disabled={joinCode.length < 4}><PlayArrowIcon sx={{ fontSize: 16 }} /></Button>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Server: {collabMcpPort ? `port ${collabMcpPort}` : 'not configured'} (set in Settings → Collab)
              </Typography>
            </>
          ) : (
            <>
              <Alert severity="success" sx={{ mb: 1, py: 0, '& .MuiAlert-message': { fontSize: 11 } }}>
                Connected to room <strong>{collabRoomCode}</strong>
              </Alert>
              <Button fullWidth variant="outlined" size="small" color="error" startIcon={<StopIcon />} onClick={handleDisconnect}>Disconnect</Button>
            </>
          )}

          {/* User presence */}
          {collabUsers.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>CONNECTED USERS ({collabUsers.length})</Typography>
              <List dense sx={{ py: 0 }}>
                {collabUsers.map((u, i) => {
                  const sessionDurationMs = u.lastSeen ? Date.now() - u.lastSeen : 0
                  const minutes = Math.floor(sessionDurationMs / 60000)
                  const seconds = Math.floor((sessionDurationMs % 60000) / 1000)
                  const sessionTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
                  return (
                    <ListItem key={i} sx={{ py: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Avatar sx={{ width: 24, height: 24, bgcolor: u.color, fontSize: 11, fontWeight: 600 }}>{u.name[0]}</Avatar>
                        <Box>
                          <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, display: 'block' }}>{u.name}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 8, display: 'block' }}>{sessionTime} online</Typography>
                        </Box>
                      </Box>
                      <FiberManualRecordIcon sx={{ fontSize: 8, color: 'success.main' }} />
                    </ListItem>
                  )
                })}
              </List>
            </>
          )}

          {/* Active cursors and presence */}
          {collabCursors.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>ACTIVE EDITING</Typography>
              {collabCursors.map((c) => {
                const user = collabUsers.find(u => u.id === c.userId)
                return (
                  <Box key={c.id} sx={{ mb: 1, p: 0.75, bgcolor: 'action.hover', borderRadius: 0.5, borderLeft: 3, borderColor: c.color }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      <Typography variant="caption" fontWeight={600}>{c.name}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                      {c.selection ? `Selecting (${c.selection} chars)` : `Position: Line ${Math.floor(c.position / 50) + 1}`}
                    </Typography>
                  </Box>
                )
              })}
            </>
          )}
        </Box>
      </Paper>

      {/* Share dialog */}
      <Dialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Share Document</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>Share this room code with collaborators:</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField fullWidth value={generatedCode} slotProps={{ input: { readOnly: true } }} sx={{ '& .MuiInputBase-input': { fontSize: 24, fontWeight: 700, letterSpacing: 4, textAlign: 'center' } }} />
            <IconButton onClick={copyCode}><ContentCopyIcon /></IconButton>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Others can join via View → Collaboration or the 💬 sidebar.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setShareDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
