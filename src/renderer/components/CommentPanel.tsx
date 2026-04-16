import React, { useState, type FC } from 'react'
import { Box, Typography, IconButton, TextField, Button, Chip, List, ListItem, ListItemText, Divider, Tooltip } from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import UndoIcon from '@mui/icons-material/Undo'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import SendIcon from '@mui/icons-material/Send'
import { useAppStore } from '../store/app-store'
import { SidePanel } from './shared/SidePanel'
import { formatTime, validateInput } from '../utils'

export const CommentPanel: FC = () => {
  const {
    commentPanelOpen, commentThreads, commentInputOpen,
    commentSelectionText,
    setCommentPanelOpen, addCommentThread, addCommentReply,
    resolveCommentThread, unresolveCommentThread, deleteCommentThread,
    setCommentInputOpen
  } = useAppStore()

  const [newComment, setNewComment] = useState('')
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({})

  if (!commentPanelOpen) return null

  const unresolved = commentThreads.filter((t) => !t.resolved)
  const resolved = commentThreads.filter((t) => t.resolved)

  const handleAddComment = () => {
    if (!validateInput(newComment)) return
    const state = useAppStore.getState()
    addCommentThread({
      documentId: state.currentFilePath || state.activeTabId,
      selectionFrom: state.commentSelectionFrom,
      selectionTo: state.commentSelectionTo,
      selectionText: state.commentSelectionText || commentSelectionText,
      resolved: false,
      replies: [{ id: crypto.randomUUID(), author: state.collabDisplayName, content: newComment, timestamp: Date.now() }]
    })
    setNewComment('')
    setCommentInputOpen(false)
  }

  const handleReply = (threadId: string) => {
    const reply = replyInputs[threadId]
    if (!validateInput(reply)) return
    const author = useAppStore.getState().collabDisplayName
    addCommentReply(threadId, { author, content: reply })
    setReplyInputs((prev) => ({ ...prev, [threadId]: '' }))
  }



  const renderThread = (thread: typeof commentThreads[0]) => (
    <Box key={thread.id} sx={{ mb: 1.5, p: 1, borderRadius: 1, border: 1, borderColor: thread.resolved ? 'success.light' : 'divider', bgcolor: thread.resolved ? 'success.dark' : 'transparent', opacity: thread.resolved ? 0.7 : 1 }}>
      <Box sx={{ mb: 0.5, px: 1, py: 0.25, bgcolor: 'action.hover', borderRadius: 0.5, borderLeft: 3, borderColor: 'primary.main' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: 10 }}>"{thread.selectionText.slice(0, 80)}{thread.selectionText.length > 80 ? '...' : ''}"</Typography>
      </Box>

      {thread.replies.map((r, i) => (
        <Box key={r.id} sx={{ mt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10 }}>{r.author}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>{formatTime(r.timestamp)}</Typography>
          </Box>
          <Typography variant="caption" sx={{ fontSize: 11, display: 'block', pl: 1 }}>{r.content}</Typography>
        </Box>
      ))}

      {!thread.resolved && (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
          <TextField
            size="small" value={replyInputs[thread.id] || ''} onChange={(e) => setReplyInputs((p) => ({ ...p, [thread.id]: e.target.value }))}
            placeholder="Reply..." sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }} onKeyDown={(e) => { if (e.key === 'Enter') handleReply(thread.id) }}
          />
          <IconButton size="small" onClick={() => handleReply(thread.id)}><SendIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 0.25, mt: 0.5 }}>
        {thread.resolved ? (
          <Tooltip title="Reopen"><IconButton size="small" onClick={() => unresolveCommentThread(thread.id)}><UndoIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
        ) : (
          <Tooltip title="Resolve"><IconButton size="small" color="success" onClick={() => resolveCommentThread(thread.id)}><CheckCircleOutlinedIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
        )}
        <Tooltip title="Delete thread"><IconButton size="small" color="error" onClick={() => deleteCommentThread(thread.id)}><DeleteOutlinedIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
      </Box>
    </Box>
  )

  return (
    <SidePanel title="Comments" onClose={() => setCommentPanelOpen(false)} width={320} zIndex={95}>
      <Box sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ChatIcon sx={{ fontSize: 16 }} />
          <Chip label={unresolved.length} size="small" color={unresolved.length > 0 ? 'primary' : 'default'} sx={{ fontSize: 9, height: 16 }} />
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {commentInputOpen && (
          <Box sx={{ mb: 2, p: 1, borderRadius: 1, border: 1, borderColor: 'primary.main' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontStyle: 'italic' }}>
              On: "{commentSelectionText.slice(0, 50)}{commentSelectionText.length > 50 ? '...' : ''}"
            </Typography>
            <TextField
              multiline rows={2} fullWidth size="small" value={newComment} onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..." autoFocus sx={{ mb: 0.5, '& .MuiInputBase-input': { fontSize: 12 } }}
            />
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button size="small" variant="contained" onClick={handleAddComment} disabled={!newComment.trim()}>Comment</Button>
              <Button size="small" onClick={() => { setCommentInputOpen(false); setNewComment('') }}>Cancel</Button>
            </Box>
          </Box>
        )}

        {unresolved.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Open ({unresolved.length})</Typography>
            {unresolved.map(renderThread)}
          </>
        )}

        {resolved.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Resolved ({resolved.length})</Typography>
            {resolved.map(renderThread)}
          </>
        )}

        {commentThreads.length === 0 && !commentInputOpen && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 4 }}>
            Select text and click the comment icon to add a comment.
          </Typography>
        )}
      </Box>
    </SidePanel>
  )
}
