import React, { type FC } from 'react'
import { Box, Typography, List, ListItem, ListItemText, Chip, Stack, IconButton, Avatar } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import UndoIcon from '@mui/icons-material/Undo'
import { useAppStore } from '../store/app-store'
import { SidePanel } from './shared/SidePanel'
import type { AttributedEdit } from '../../shared/types'

export const EditHistoryPanel: FC = () => {
  const { editHistoryOpen, setEditHistoryOpen, attributedEdits } = useAppStore()
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const inspectorSize = useAppStore((s) => s.inspectorSize)

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
      insert: '+',
      delete: '−',
      replace: '↻'
    }
    return icons[type]
  }

  const getEditColor = (type: AttributedEdit['type']) => {
    const colors = {
      insert: 'var(--ui-success)',
      delete: 'var(--ui-danger)',
      replace: 'var(--ui-warning)'
    }
    return colors[type]
  }

  return (
    <SidePanel
      title={`Edit History (${attributedEdits.length})`}
      onClose={() => setEditHistoryOpen(false)}
      width={340}
      right={inspectorOpen ? Math.round(window.innerWidth * (inspectorSize / 100)) : 0}
    >
      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {attributedEdits.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 2, textAlign: 'center' }}>
            No edits recorded
          </Typography>
        ) : (
          <List dense sx={{ display: 'flex', flexDirection: 'column-reverse', py: 0 }}>
            {attributedEdits.map((edit) => (
              <ListItem
                key={edit.id}
                sx={{
                  p: 0.75,
                  mb: 0.25,
                  borderRadius: 0.5,
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'flex-start' }}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: 0.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: getEditColor(edit.type),
                      bgcolor: `color-mix(in oklab, ${getEditColor(edit.type)} 16%, transparent)`
                    }}
                  >
                    {getEditIcon(edit.type)}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.25 }}>
                      <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600 }}>
                        {edit.userName}
                      </Typography>
                      <Chip
                        label={edit.type}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: 12 }}
                      />
                    </Stack>

                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 12,
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

                    <Typography variant="caption" sx={{ fontSize: 12, color: 'text.disabled', display: 'block', mt: 0.25 }}>
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
