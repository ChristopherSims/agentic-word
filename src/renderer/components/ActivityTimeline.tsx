import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  Avatar,
  Stack,
  Chip,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  ButtonGroup,
} from '@mui/material'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import EditIcon from '@mui/icons-material/Edit'
import ChatBubbleIcon from '@mui/icons-material/ChatBubble'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import '../styles/activity-timeline.css'

interface TimelineEvent {
  id: string
  userId: string
  userName: string
  timestamp: number
  type: 'edit' | 'comment' | 'suggestion' | 'presence'
  action: string
  details?: string
  accepted?: boolean
}

interface ActivityFilters {
  users: Set<string>
  types: Set<string>
  dateRange: [number, number]
}

export function ActivityTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [filteredEvents, setFilteredEvents] = useState<TimelineEvent[]>([])
  const [filters, setFilters] = useState<ActivityFilters>({
    users: new Set(),
    types: new Set(['edit', 'comment', 'suggestion', 'presence']),
    dateRange: [Date.now() - 86400000, Date.now()], // Last 24 hours
  })
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Load mock events
    const mockEvents: TimelineEvent[] = [
      {
        id: 'evt1',
        userId: 'user1',
        userName: 'Alice',
        timestamp: Date.now() - 3600000,
        type: 'edit',
        action: 'Added 250 words',
        details: 'Expanded section on introduction',
      },
      {
        id: 'evt2',
        userId: 'user2',
        userName: 'Bob',
        timestamp: Date.now() - 3000000,
        type: 'comment',
        action: 'Added comment',
        details: 'Consider rewording this paragraph',
      },
      {
        id: 'evt3',
        userId: 'user1',
        userName: 'Alice',
        timestamp: Date.now() - 2400000,
        type: 'edit',
        action: 'Edited 45 words',
        details: 'Refined section content',
      },
      {
        id: 'evt4',
        userId: 'user2',
        userName: 'Bob',
        timestamp: Date.now() - 1800000,
        type: 'suggestion',
        action: 'Suggested change',
        details: 'Grammar improvement: "is" → "are"',
        accepted: true,
      },
      {
        id: 'evt5',
        userId: 'user1',
        userName: 'Alice',
        timestamp: Date.now() - 900000,
        type: 'edit',
        action: 'Deleted 12 words',
        details: 'Removed redundant content',
      },
    ]
    setEvents(mockEvents)
    applyFilters(mockEvents, filters)
  }, [])

  const applyFilters = (
    allEvents: TimelineEvent[],
    activeFilters: ActivityFilters
  ) => {
    const filtered = allEvents.filter((event) => {
      // Check type filter
      if (!activeFilters.types.has(event.type)) {
        return false
      }

      // Check user filter (if any selected, show only those)
      if (
        activeFilters.users.size > 0 &&
        !activeFilters.users.has(event.userId)
      ) {
        return false
      }

      // Check date range
      if (
        event.timestamp < activeFilters.dateRange[0] ||
        event.timestamp > activeFilters.dateRange[1]
      ) {
        return false
      }

      return true
    })

    setFilteredEvents(filtered)
  }

  const toggleUserFilter = (userId: string) => {
    const newUsers = new Set(filters.users)
    if (newUsers.has(userId)) {
      newUsers.delete(userId)
    } else {
      newUsers.add(userId)
    }
    const newFilters = { ...filters, users: newUsers }
    setFilters(newFilters)
    applyFilters(events, newFilters)
  }

  const toggleTypeFilter = (type: string) => {
    const newTypes = new Set(filters.types)
    if (newTypes.has(type)) {
      newTypes.delete(type)
    } else {
      newTypes.add(type)
    }
    const newFilters = { ...filters, types: newTypes }
    setFilters(newFilters)
    applyFilters(events, newFilters)
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'edit':
        return <EditIcon sx={{ fontSize: 20 }} />
      case 'comment':
        return <ChatBubbleIcon sx={{ fontSize: 20 }} />
      case 'suggestion':
        return <ThumbUpIcon sx={{ fontSize: 20 }} />
      default:
        return <AccessTimeIcon sx={{ fontSize: 20 }} />
    }
  }

  const getEventColor = (type: string): 'success' | 'info' | 'warning' | 'error' => {
    switch (type) {
      case 'edit':
        return 'success'
      case 'comment':
        return 'info'
      case 'suggestion':
        return 'warning'
      default:
        return 'error'
    }
  }

  const groupEventsByDate = (
    evts: TimelineEvent[]
  ): Record<string, TimelineEvent[]> => {
    const grouped: Record<string, TimelineEvent[]> = {}

    evts.forEach((event) => {
      const date = new Date(event.timestamp).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })

      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(event)
    })

    return grouped
  }

  const uniqueUsers = Array.from(
    new Set(events.map((e) => ({ userId: e.userId, userName: e.userName })))
  )

  const groupedEvents = groupEventsByDate(filteredEvents)

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Activity Timeline
      </Typography>

      {/* Filters Section */}
      <Card sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          {/* Type Filters */}
          <Box>
            <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 1 }}>
              Event Types
            </Typography>
            <Stack direction="row" spacing={1}>
              {['edit', 'comment', 'suggestion', 'presence'].map((type) => (
                <FormControlLabel
                  key={type}
                  control={
                    <Checkbox
                      checked={filters.types.has(type)}
                      onChange={() => toggleTypeFilter(type)}
                      size="small"
                    />
                  }
                  label={type.charAt(0).toUpperCase() + type.slice(1)}
                />
              ))}
            </Stack>
          </Box>

          {/* User Filters */}
          <Box>
            <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 1 }}>
              Users
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {uniqueUsers.map((user) => (
                <Chip
                  key={user.userId}
                  label={user.userName}
                  onClick={() => toggleUserFilter(user.userId)}
                  color={
                    filters.users.has(user.userId) ? 'primary' : 'default'
                  }
                  variant={
                    filters.users.has(user.userId) ? 'filled' : 'outlined'
                  }
                  size="small"
                />
              ))}
            </Stack>
          </Box>

          {/* Time Range (simplified) */}
          <Box>
            <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 1 }}>
              Time Range
            </Typography>
            <ButtonGroup size="small">
              <Button
                onClick={() => {
                  const newFilters = {
                    ...filters,
                    dateRange: [Date.now() - 3600000, Date.now()],
                  }
                  setFilters(newFilters)
                  applyFilters(events, newFilters)
                }}
              >
                Last Hour
              </Button>
              <Button
                onClick={() => {
                  const newFilters = {
                    ...filters,
                    dateRange: [Date.now() - 86400000, Date.now()],
                  }
                  setFilters(newFilters)
                  applyFilters(events, newFilters)
                }}
              >
                Last 24h
              </Button>
              <Button
                onClick={() => {
                  const newFilters = {
                    ...filters,
                    dateRange: [Date.now() - 604800000, Date.now()],
                  }
                  setFilters(newFilters)
                  applyFilters(events, newFilters)
                }}
              >
                Last Week
              </Button>
            </ButtonGroup>
          </Box>
        </Stack>
      </Card>

      {/* Timeline */}
      <Box sx={{ position: 'relative' }}>
        {Object.entries(groupedEvents).map(([dateGroup, groupEvents]) => (
          <Box key={dateGroup} sx={{ mb: 3 }}>
            {/* Date Divider */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 2,
                '&::before, &::after': {
                  content: '""',
                  flex: 1,
                  height: '1px',
                  bgcolor: 'divider',
                },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  px: 2,
                  fontWeight: 600,
                  color: 'text.secondary',
                }}
              >
                {dateGroup}
              </Typography>
            </Box>

            {/* Events */}
            <Stack spacing={1}>
              {groupEvents
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((event) => (
                  <Card
                    key={event.id}
                    sx={{
                      p: 1.5,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        boxShadow: 2,
                        bgcolor: 'action.hover',
                      },
                      borderLeft: 4,
                      borderColor: `${getEventColor(event.type)}.main`,
                    }}
                    onClick={() => {
                      setSelectedEvent(event)
                      setDetailsOpen(true)
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="flex-start"
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: `${getEventColor(event.type)}.main`,
                        }}
                      >
                        {getEventIcon(event.type)}
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar
                            sx={{
                              width: 28,
                              height: 28,
                              fontSize: '0.75rem',
                            }}
                          >
                            {event.userName.charAt(0)}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500}>
                              {event.userName}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </Typography>
                          </Box>

                          {event.accepted !== undefined && (
                            <Chip
                              size="small"
                              label={event.accepted ? 'Accepted' : 'Pending'}
                              color={
                                event.accepted ? 'success' : 'warning'
                              }
                              variant="outlined"
                            />
                          )}
                        </Stack>

                        <Typography
                          variant="body2"
                          sx={{ mt: 0.5 }}
                        >
                          {event.action}
                        </Typography>

                        {event.details && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            sx={{ mt: 0.5 }}
                          >
                            {event.details}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </Card>
                ))}
            </Stack>
          </Box>
        ))}
      </Box>

      {filteredEvents.length === 0 && (
        <Card sx={{ p: 2, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No events match the current filters
          </Typography>
        </Card>
      )}

      {/* Event Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{selectedEvent?.action}</DialogTitle>
        <DialogContent>
          {selectedEvent && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  User
                </Typography>
                <Typography variant="body2">
                  {selectedEvent.userName}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Timestamp
                </Typography>
                <Typography variant="body2">
                  {new Date(selectedEvent.timestamp).toLocaleString()}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Event Type
                </Typography>
                <Typography variant="body2">
                  {selectedEvent.type.charAt(0).toUpperCase() +
                    selectedEvent.type.slice(1)}
                </Typography>
              </Box>
              {selectedEvent.details && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Details
                  </Typography>
                  <Typography variant="body2">
                    {selectedEvent.details}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
