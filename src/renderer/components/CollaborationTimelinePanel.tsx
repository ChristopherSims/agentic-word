import React, { type FC } from 'react'
import { Box, Typography, List, ListItem, ListItemText, Chip, Stack, IconButton, Divider, Avatar, AvatarGroup } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../store/app-store'
import { SidePanel } from './shared/SidePanel'
import type { CollaborationEvent } from '../../shared/types'

export const CollaborationTimelinePanel: FC = () => {
  const { collaborationTimelineOpen, setCollaborationTimelineOpen, collaborationEvents, clearCollaborationEvents } = useAppStore()
  const chatSidebarOpen = useAppStore((s) => s.chatSidebarOpen)

  if (!collaborationTimelineOpen) return null

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const getEventColor = (type: CollaborationEvent['type']) => {
    const colors = {
      edit: '#a6e3a1',
      comment: '#89b4fa',
      mention: '#f9e2af',
      resolve: '#94e2d5',
      merge: '#cba6f7',
      conflict: '#f38ba8'
    }
    return colors[type] || '#cdd6f4'
  }

  const getEventIcon = (type: CollaborationEvent['type']) => {
    const icons = {
      edit: '✎',
      comment: '💬',
      mention: '@',
      resolve: '✓',
      merge: '⤵',
      conflict: '⚠'
    }
    return icons[type]
  }

  // Group events by date
  const groupedEvents = collaborationEvents.reduce((acc, event) => {
    const date = formatDate(event.timestamp)
    if (!acc[date]) acc[date] = []
    acc[date].push(event)
    return acc
  }, {} as Record<string, CollaborationEvent[]>)

  return (
    <SidePanel
      title="Collaboration Timeline"
      onClose={() => setCollaborationTimelineOpen(false)}
      width={340}
      right={chatSidebarOpen ? 340 : 0}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" fontWeight={600}>
          {collaborationEvents.length} events
        </Typography>
        {collaborationEvents.length > 0 && (
          <IconButton size="small" onClick={() => clearCollaborationEvents()} title="Clear timeline">
            <DeleteIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {collaborationEvents.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 2, textAlign: 'center' }}>
            No collaboration events yet
          </Typography>
        ) : (
          Object.entries(groupedEvents).map(([date, events]) => (
            <Box key={date} sx={{ mb: 2 }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {date}
              </Typography>
              <List dense sx={{ mt: 0.5 }}>
                {events.map((event) => (
                  <ListItem
                    key={event.id}
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
                        label={getEventIcon(event.type)}
                        size="small"
                        sx={{
                          bgcolor: getEventColor(event.type),
                          color: 'black',
                          fontWeight: 700,
                          minWidth: 28,
                          height: 24,
                          fontSize: 12
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" fontWeight={600} sx={{ fontSize: 11 }}>
                          {event.userName}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary', display: 'block', mt: 0.25 }}>
                          {event.content.description}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: 9, color: 'text.disabled', display: 'block', mt: 0.25 }}>
                          {formatTime(event.timestamp)}
                        </Typography>
                      </Box>
                    </Box>
                  </ListItem>
                ))}
              </List>
            </Box>
          ))
        )}
      </Box>
    </SidePanel>
  )
}
