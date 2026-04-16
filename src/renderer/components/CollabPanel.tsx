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

export const CollabPanel: FC = () => {
  const { collabConnected, collabRoomCode, collabUsers, collabCursors, collabMcpPort, collabDisplayName, collabCursorColor } = useAppStore()
  const [joinCode, setJoinCode] = useState('')
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')

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
    if (!joinCode.trim()) return
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

  return (
    <>
      <Paper sx={{ width: 280, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2">Collaboration</Typography>
          <IconButton size="small" onClick={() => useAppStore.getState().setCollabPanelOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>

        <Box sx={{ p: 1.5, overflow: 'auto', flex: 1 }}>
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
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>CONNECTED USERS</Typography>
              <List dense sx={{ py: 0 }}>
                {collabUsers.map((u, i) => (
                  <ListItem key={i} sx={{ py: 0.25 }}>
                    <ListItemAvatar sx={{ minWidth: 28 }}>
                      <Avatar sx={{ width: 20, height: 20, bgcolor: u.color, fontSize: 10 }}>{u.name[0]}</Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={u.name} primaryTypographyProps={{ fontSize: 11 }} />
                    <FiberManualRecordIcon sx={{ fontSize: 8, color: 'success.main' }} />
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {/* Active cursors */}
          {collabCursors.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>ACTIVE CURSORS</Typography>
              {collabCursors.map((c) => (
                <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <Typography variant="caption">{c.name}</Typography>
                  <Typography variant="caption" color="text.secondary">pos {c.position}</Typography>
                </Box>
              ))}
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
