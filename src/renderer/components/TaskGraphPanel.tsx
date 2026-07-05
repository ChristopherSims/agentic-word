import { Box, Paper, Typography, IconButton, LinearProgress } from '@mui/material'
import CancelIcon from '@mui/icons-material/Cancel'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import PendingIcon from '@mui/icons-material/Pending'
import SyncIcon from '@mui/icons-material/Sync'
import { useAppStore } from '../store/app-store'
import type { AgentTask, TaskStatus } from '../shared/types'

const STATUS_CONFIG: Record<TaskStatus, { icon: React.ReactNode; color: string }> = {
  pending: { icon: <PendingIcon sx={{ fontSize: 14 }} />, color: 'var(--text-muted)' },
  running: { icon: <SyncIcon sx={{ fontSize: 14, animation: 'spin 1s linear infinite' }} />, color: 'var(--accent)' },
  done: { icon: <CheckCircleIcon sx={{ fontSize: 14 }} />, color: 'var(--success)' },
  error: { icon: <ErrorIcon sx={{ fontSize: 14 }} />, color: 'var(--danger)' },
  cancelled: { icon: <CancelIcon sx={{ fontSize: 14 }} />, color: 'var(--text-muted)' },
}

const AGENT_COLORS: Record<string, string> = {
  Writer: '#89b4fa',
  Reviewer: '#f38ba8',
  Researcher: '#a6e3a1',
  Orchestrator: '#cba6f7',
}

export function TaskGraphPanel() {
  const activeTaskGraph = useAppStore(s => s.activeTaskGraph)
  const activeGraphId = useAppStore(s => s.activeGraphId)

  if (activeTaskGraph.length === 0) return null

  const rootTasks = activeTaskGraph.filter(t => t.parentTaskId === null)
  const anyRunning = activeTaskGraph.some(t => t.status === 'running' || t.status === 'pending')

  const handleCancel = () => {
    if (activeGraphId) window.wordapp?.agent.cancelTaskGraph(activeGraphId)
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <Typography variant="caption" fontWeight={600}>Task Graph</Typography>
        {anyRunning && (
          <IconButton size="small" onClick={handleCancel} sx={{ ml: 'auto', p: 0.25 }}>
            <CancelIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>
      {anyRunning && <LinearProgress sx={{ mb: 1, height: 2 }} />}
      {rootTasks.map(task => <TaskNode key={task.id} task={task} allTasks={activeTaskGraph} depth={0} />)}
    </Paper>
  )
}

function TaskNode({ task, allTasks, depth }: { task: AgentTask; allTasks: AgentTask[]; depth: number }) {
  const config = STATUS_CONFIG[task.status]
  const children = allTasks.filter(t => t.parentTaskId === task.id)
  const agentColor = AGENT_COLORS[task.agentName] || 'var(--accent)'

  return (
    <Box sx={{ ml: depth * 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: agentColor, flexShrink: 0 }} />
        {config.icon}
        <Typography variant="caption" sx={{ fontSize: 11, color: config.color, fontWeight: task.status === 'running' ? 600 : 400 }}>
          {task.agentName}: {task.title}
        </Typography>
      </Box>
      {task.result && (
        <Box sx={{ ml: 3.5, mb: 0.5, p: 0.75, bgcolor: 'var(--bg-surface)', borderRadius: 1, maxHeight: 120, overflow: 'auto' }}>
          <Typography variant="caption" sx={{ fontSize: 10, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{task.result}</Typography>
        </Box>
      )}
      {task.error && (
        <Typography variant="caption" color="error" sx={{ fontSize: 10, ml: 3.5 }}>{task.error}</Typography>
      )}
      {children.map(child => <TaskNode key={child.id} task={child} allTasks={allTasks} depth={depth + 1} />)}
    </Box>
  )
}