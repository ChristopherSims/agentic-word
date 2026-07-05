import { useEffect, useState } from 'react'
import { Box, Paper, Typography, IconButton, Chip, Collapse, LinearProgress } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CloseIcon from '@mui/icons-material/Close'
import SyncIcon from '@mui/icons-material/Sync'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import CancelIcon from '@mui/icons-material/Cancel'
import PendingIcon from '@mui/icons-material/Pending'
import { useAppStore } from '../store/app-store'
import type { AgentTask, TaskStatus } from '../shared/types'

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  pending: <PendingIcon sx={{ fontSize: 12 }} />,
  running: <SyncIcon sx={{ fontSize: 12, animation: 'spin 1s linear infinite' }} />,
  done: <CheckCircleIcon sx={{ fontSize: 12, color: 'var(--success)' }} />,
  error: <ErrorIcon sx={{ fontSize: 12, color: 'var(--danger)' }} />,
  cancelled: <CancelIcon sx={{ fontSize: 12, color: 'var(--text-muted)' }} />,
}

const AGENT_COLORS: Record<string, string> = {
  Writer: '#89b4fa', Reviewer: '#f38ba8', Researcher: '#a6e3a1', Orchestrator: '#cba6f7',
}

export function TaskListPopup() {
  const activeTaskGraph = useAppStore(s => s.activeTaskGraph)
  const chatLoading = useAppStore(s => s.chatLoading)
  const agentStatus = useAppStore(s => s.agentStatus)
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  // Reset dismissed when a new graph starts
  useEffect(() => {
    if (activeTaskGraph.length > 0 && activeTaskGraph.some(t => t.status === 'pending' || t.status === 'running')) {
      setDismissed(false)
      setExpanded(true)
    }
  }, [activeTaskGraph.length])

  // Don't render if no tasks, all done, or dismissed
  const hasActiveTasks = activeTaskGraph.some(t => t.status === 'pending' || t.status === 'running')
  if (activeTaskGraph.length === 0 || dismissed) return null
  if (!hasActiveTasks && !chatLoading) return null

  const doneCount = activeTaskGraph.filter(t => t.status === 'done').length
  const totalCount = activeTaskGraph.length

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'absolute',
        bottom: 8, right: 8,
        width: 280, maxWidth: '90%',
        zIndex: 1300,
        bgcolor: 'var(--bg-elevated)',
        border: 1, borderColor: 'var(--border)',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          px: 1, py: 0.5,
          bgcolor: 'var(--bg-surface)',
          cursor: 'pointer',
          borderBottom: expanded ? 1 : 0,
          borderColor: 'var(--border)',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <SyncIcon sx={{ fontSize: 12, color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
        <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, mr: 'auto' }}>
          {agentStatus || 'Agent working...'}
        </Typography>
        <Chip
          label={`${doneCount}/${totalCount}`}
          size="small"
          sx={{ height: 16, fontSize: 8, bgcolor: 'var(--bg-elevated)' }}
        />
        <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 12 }} /> : <ExpandMoreIcon sx={{ fontSize: 12 }} />}
        </IconButton>
        <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); setDismissed(true) }}>
          <CloseIcon sx={{ fontSize: 12 }} />
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ p: 0.75, maxHeight: 200, overflowY: 'auto' }}>
          {activeTaskGraph.map(task => <TaskRow key={task.id} task={task} />)}
        </Box>
        {hasActiveTasks && <LinearProgress sx={{ height: 2 }} />}
      </Collapse>
    </Paper>
  )
}

function TaskRow({ task }: { task: AgentTask }) {
  const agentColor = AGENT_COLORS[task.agentName] || 'var(--accent)'
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, py: 0.25 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: agentColor, mt: 0.25, flexShrink: 0 }} />
      {STATUS_ICON[task.status]}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: task.status === 'running' ? 600 : 400, display: 'block' }}>
          {task.agentName}: {task.title}
        </Typography>
        {task.result && task.status === 'done' && (
          <Typography variant="caption" sx={{ fontSize: 9, color: 'var(--text-secondary)', display: 'block', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.result.slice(0, 80)}...
          </Typography>
        )}
        {task.error && (
          <Typography variant="caption" sx={{ fontSize: 9, color: 'var(--danger)', display: 'block' }}>
            {task.error}
          </Typography>
        )}
      </Box>
    </Box>
  )
}