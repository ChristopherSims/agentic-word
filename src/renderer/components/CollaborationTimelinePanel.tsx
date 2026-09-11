import React, { type FC } from 'react'
import { Box, Typography, List, ListItem, ListItemText, Stack, IconButton, Divider, Avatar, AvatarGroup } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../store/app-store'
import { SidePanel } from './shared/SidePanel'
import type { CollaborationEvent } from '../../shared/types'

export const CollaborationTimelinePanel: FC = () => {
  const { collaborationTimelineOpen, setCollaborationTimelineOpen, collaborationEvents, clearCollaborationEvents } = useAppStore()
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const inspectorSize = useAppStore((s) => s.inspectorSize)

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
      edit: 'var(--ui-success)',
      comment: 'var(--ui-accent)',
      mention: 'var(--ui-warning)',
      resolve: 'var(--ui-success)',
      merge: 'var(--ui-accent)',
      conflict: 'var(--ui-danger)'
    }
    return colors[type] || 'var(--ui-text)'
  }

  const getEventIcon = (type: CollaborationEvent['type']) => {
    const icons = {
      edit: '✎',
      comment: '#',
      mention: '@',
      resolve: '✓',
      merge: '⇄',
      conflict: '!'
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
      right={inspectorOpen ? Math.round(window.innerWidth * (inspectorSize / 100)) : 0}
      headerContent={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Collaboration Timeline</Typography>
          <Typography variant="caption" color="text.secondary">({collaborationEvents.length})</Typography>
          {collaborationEvents.length > 0 && (
            <IconButton size="small" sx={{ ml: 0.5 }} onClick={() => clearCollaborationEvents()} aria-label="Clear timeline">
              <DeleteIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
      }
    >

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {collaborationEvents.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 2, textAlign: 'center' }}>
            No collaboration events yet
          </Typography>
        ) : (
          Object.entries(groupedEvents).map(([date, events]) => (
            <Box key={date} sx={{ mb: 1.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>
                {date}
              </Typography>
              <List dense sx={{ mt: 0.5, py: 0 }}>
                {events.map((event) => (
                  <ListItem
                    key={event.id}
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
                          fontSize: 12,
                          fontWeight: 700,
                          color: getEventColor(event.type),
                          bgcolor: `color-mix(in oklab, ${getEventColor(event.type)} 16%, transparent)`
                        }}
                      >
                        {getEventIcon(event.type)}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600 }}>
                          {event.userName}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary', display: 'block', mt: 0.25 }}>
                          {event.content.description}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: 12, color: 'text.disabled', display: 'block', mt: 0.25 }}>
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
