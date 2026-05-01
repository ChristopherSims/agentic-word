import React, { useState, useRef, type FC } from 'react'
import { Box, Typography, IconButton, TextField, Button, Chip, List, ListItem, ListItemText, Divider, Tooltip, Avatar, Stack, Menu, MenuItem } from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import UndoIcon from '@mui/icons-material/Undo'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import SendIcon from '@mui/icons-material/Send'
import LockIcon from '@mui/icons-material/Lock'
import PublicIcon from '@mui/icons-material/Public'
import { useAppStore } from '../store/app-store'
import { SidePanel } from './shared/SidePanel'
import { formatTime, validateInput } from '../utils'

export const CommentPanel: FC = () => {
  const {
    commentPanelOpen, commentThreads, commentInputOpen,
    commentSelectionText,
    setCommentPanelOpen, addCommentThread, addCommentReply,
    resolveCommentThread, unresolveCommentThread, deleteCommentThread,
    setCommentInputOpen, collabDisplayName, collabUsers
  } = useAppStore()

  const [newComment, setNewComment] = useState('')
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({})
  const [mentionAnchor, setMentionAnchor] = useState<{ el: HTMLElement; threadId: string } | null>(null)
  const mentionLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMentionEnter = () => {
    if (mentionLeaveTimerRef.current) { clearTimeout(mentionLeaveTimerRef.current); mentionLeaveTimerRef.current = null }
  }
  const handleMentionLeave = () => {
    mentionLeaveTimerRef.current = setTimeout(() => setMentionAnchor(null), 1000)
  }
  const [selectedPermission, setSelectedPermission] = useState<'private' | 'shared'>('shared')

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
      createdBy: state.collabDisplayName,
      createdAt: Date.now(),
      permissions: { view: ['all'], edit: [state.collabDisplayName] },
      replies: [{ id: crypto.randomUUID(), author: state.collabDisplayName, authorId: state.currentUserId || 'local', content: newComment, timestamp: Date.now(), mentions: [] }]
    })
    setNewComment('')
    setCommentInputOpen(false)
    setSelectedPermission('shared')
  }

  const handleReply = (threadId: string) => {
    const reply = replyInputs[threadId]
    if (!validateInput(reply)) return
    const state = useAppStore.getState()
    // Extract mentions from reply (@username)
    const mentionMatches = reply.match(/@(\w+)/g) || []
    const mentions = mentionMatches.map((m) => m.slice(1))
    
    addCommentReply(threadId, { 
      author: state.collabDisplayName,
      authorId: state.currentUserId || 'local',
      content: reply,
      mentions
    })
    setReplyInputs((prev) => ({ ...prev, [threadId]: '' }))
  }

  const handleMentionInsert = (username: string, threadId: string) => {
    const currentText = replyInputs[threadId] || ''
    const atIndex = currentText.lastIndexOf('@')
    if (atIndex >= 0) {
      const newText = currentText.slice(0, atIndex) + `@${username} `
      setReplyInputs((prev) => ({ ...prev, [threadId]: newText }))
    }
    setMentionAnchor(null)
  }

  const getPermissionIcon = (permissions?: { view: string[]; edit: string[] }) => {
    if (!permissions) return null
    const isPrivate = permissions.view?.length === 0 || (permissions.view?.length === 1 && permissions.view[0] === 'self')
    return isPrivate ? <LockIcon sx={{ fontSize: 12 }} /> : <PublicIcon sx={{ fontSize: 12 }} />
  }

  const renderThread = (thread: typeof commentThreads[0]) => (
    <Box key={thread.id} sx={{ mb: 1.5, p: 1, borderRadius: 1, border: 1, borderColor: thread.resolved ? 'success.light' : 'divider', bgcolor: thread.resolved ? 'success.dark' : 'transparent', opacity: thread.resolved ? 0.7 : 1 }}>
      {/* Thread header with creator and permissions */}
      <Box sx={{ mb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" fontWeight={700} sx={{ fontSize: 10 }}>{thread.createdBy || 'Anonymous'}</Typography>
          {getPermissionIcon(thread.permissions) && (
            <Tooltip title={thread.permissions?.view?.[0] === 'all' ? 'Shared' : 'Private'}>
              {getPermissionIcon(thread.permissions)}
            </Tooltip>
          )}
        </Box>
        {thread.createdAt && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            {formatTime(thread.createdAt)}
          </Typography>
        )}
      </Box>

      {/* Selection context */}
      <Box sx={{ mb: 0.5, px: 1, py: 0.25, bgcolor: 'action.hover', borderRadius: 0.5, borderLeft: 3, borderColor: 'primary.main' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: 10 }}>"{thread.selectionText.slice(0, 80)}{thread.selectionText.length > 80 ? '...' : ''}"</Typography>
      </Box>

      {/* Replies with author attribution */}
      {thread.replies.map((r, i) => {
        const replyMentions = r.mentions || []
        return (
          <Box key={r.id} sx={{ mt: 0.5, p: 0.75, bgcolor: 'action.hover', borderRadius: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10 }}>{r.author || r.authorId}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>{formatTime(r.timestamp)}</Typography>
            </Box>
            <Typography variant="caption" sx={{ fontSize: 11, display: 'block', pl: 1, mb: 0.25, whiteSpace: 'pre-wrap' }}>
              {r.content}
            </Typography>
            {replyMentions.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 1 }}>
                {replyMentions.map((mention) => (
                  <Chip key={mention} label={`@${mention}`} size="small" variant="outlined" sx={{ height: 16, fontSize: 8 }} />
                ))}
              </Box>
            )}
          </Box>
        )
      })}

      {/* Reply input */}
      {!thread.resolved && (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, alignItems: 'flex-end' }}>
          <TextField
            size="small"
            value={replyInputs[thread.id] || ''}
            onChange={(e) => setReplyInputs((p) => ({ ...p, [thread.id]: e.target.value }))}
            placeholder="Reply... (use @username to mention)"
            sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleReply(thread.id)
              }
              // Show mention suggestions on @
              if (e.key === '@') {
                const target = e.currentTarget
                setTimeout(() => {
                  setMentionAnchor({ el: target, threadId: thread.id })
                }, 0)
              }
            }}
          />
          <IconButton size="small" onClick={() => handleReply(thread.id)}>
            <SendIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      )}

      {/* Mention menu */}
      <Menu
        anchorEl={mentionAnchor?.el}
        open={mentionAnchor?.threadId === thread.id}
        onClose={() => setMentionAnchor(null)}
        PaperProps={{ onMouseEnter: handleMentionEnter, onMouseLeave: handleMentionLeave }}
      >
        {collabUsers.map((user) => (
          <MenuItem key={user.id} onClick={() => handleMentionInsert(user.name, thread.id)}>
            <Avatar sx={{ width: 20, height: 20, marginRight: 1, bgcolor: user.color, fontSize: 9 }}>
              {user.name[0]}
            </Avatar>
            {user.name}
          </MenuItem>
        ))}
      </Menu>

      {/* Resolution and delete buttons */}
      <Box sx={{ display: 'flex', gap: 0.25, mt: 0.5 }}>
        {thread.resolved ? (
          <Tooltip title="Reopen">
            <IconButton size="small" onClick={() => unresolveCommentThread(thread.id)}>
              <UndoIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Resolve">
            <IconButton size="small" color="success" onClick={() => resolveCommentThread(thread.id)}>
              <CheckCircleOutlinedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Delete thread">
          <IconButton size="small" color="error" onClick={() => deleteCommentThread(thread.id)}>
            <DeleteOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
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
