import React, { type FC } from 'react'
import { Box, Typography, List, ListItem, ListItemText, Chip, Stack, IconButton, Avatar } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import UndoIcon from '@mui/icons-material/Undo'
import { useAppStore } from '../store/app-store'
import { SidePanel } from './shared/SidePanel'
import type { AttributedEdit } from '../../shared/types'

export const EditHistoryPanel: FC = () => {
  const { editHistoryOpen, setEditHistoryOpen, attributedEdits } = useAppStore()
  const chatSidebarOpen = useAppStore((s) => s.chatSidebarOpen)

  if (!editHistoryOpen) return null

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - timestamp

    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  const getEditIcon = (type: AttributedEdit['type']) => {
    const icons = {
      insert: '➕',
      delete: '➖',
      replace: '↻'
    }
    return icons[type]
  }

  const getEditColor = (type: AttributedEdit['type']) => {
    const colors = {
      insert: '#a6e3a1',
      delete: '#f38ba8',
      replace: '#f9e2af'
    }
    return colors[type]
  }

  return (
    <SidePanel
      title="Edit History"
      onClose={() => setEditHistoryOpen(false)}
      width={340}
      right={chatSidebarOpen ? 340 : 0}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" fontWeight={600}>
          {attributedEdits.length} edits
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {attributedEdits.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 2, textAlign: 'center' }}>
            No edits recorded
          </Typography>
        ) : (
          <List dense sx={{ display: 'flex', flexDirection: 'column-reverse' }}>
            {attributedEdits.map((edit) => (
              <ListItem
                key={edit.id}
                sx={{
                  p: 0.75,
                  mb: 0.5,
                  bgcolor: 'action.hover',
                  borderRadius: 0.75,
                  border: 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.selected' }
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'flex-start' }}>
                  <Chip
                    label={getEditIcon(edit.type)}
                    size="small"
                    sx={{
                      bgcolor: getEditColor(edit.type),
                      color: 'black',
                      fontWeight: 700,
                      minWidth: 28,
                      height: 24,
                      fontSize: 12
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.25 }}>
                      <Typography variant="caption" fontWeight={600} sx={{ fontSize: 11 }}>
                        {edit.userName}
                      </Typography>
                      <Chip
                        label={edit.type}
                        size="small"
                        variant="outlined"
                        sx={{ height: 16, fontSize: 8 }}
                      />
                    </Stack>

                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 10,
                        color: 'text.secondary',
                        display: 'block',
                        mt: 0.25,
                        fontFamily: 'monospace',
                        maxHeight: 40,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}
                    >
                      {edit.content}
                    </Typography>

                    <Typography variant="caption" sx={{ fontSize: 9, color: 'text.disabled', display: 'block', mt: 0.25 }}>
                      {formatTime(edit.timestamp)} • Position {edit.position}
                    </Typography>
                  </Box>
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </SidePanel>
  )
}
