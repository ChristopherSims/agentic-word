import { useState, useEffect } from 'react'
import { Box, Typography, Chip, IconButton, Card, CardContent, Button } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../store/app-store'
import type { AgentMemoryEntry } from '../shared/types'

const TYPE_COLORS: Record<string, string> = {
  fact: '#89b4fa',
  preference: '#f9e2af',
  decision: '#a6e3a1',
  correction: '#f38ba8',
  summary: '#cba6f7',
}

export function MemoryPanel() {
  const currentFilePath = useAppStore(s => s.currentFilePath)
  const activeTabId = useAppStore(s => s.activeTabId)
  const addToast = useAppStore(s => s.addToast)
  const [entries, setEntries] = useState<AgentMemoryEntry[]>([])
  const docId = currentFilePath || activeTabId || 'default'

  const loadMemory = async () => {
    const result = await window.wordapp?.agent.memoryGet(docId)
    if (result) setEntries(result as AgentMemoryEntry[])
  }

  useEffect(() => { loadMemory() }, [docId])

  const handleDelete = async (id: string) => {
    await window.wordapp?.agent.memoryDelete(id)
    loadMemory()
    addToast('success', 'Memory entry deleted')
  }

  const handleClearAll = async () => {
    await window.wordapp?.agent.memoryClear(docId)
    setEntries([])
    addToast('success', 'All memory cleared')
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" fontWeight={600} sx={{ mr: 'auto' }}>
          Agent Memory ({entries.length})
        </Typography>
        {entries.length > 0 && (
          <Button size="small" color="error" onClick={handleClearAll} sx={{ fontSize: 9 }}>Clear All</Button>
        )}
      </Box>
      {entries.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 2 }}>
          No memories yet. The agent saves preferences, decisions, and facts as you chat.
        </Typography>
      ) : (
        entries.map(entry => (
          <Card key={entry.id} variant="outlined" sx={{ mb: 0.5 }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <Chip
                  label={entry.type}
                  size="small"
                  sx={{
                    height: 16, fontSize: 9,
                    bgcolor: TYPE_COLORS[entry.type] || 'var(--bg-surface)',
                    color: '#000'
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                  {entry.agentName}
                </Typography>
                <IconButton size="small" sx={{ ml: 'auto', p: 0.25 }} onClick={() => handleDelete(entry.id)}>
                  <DeleteIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Box>
              <Typography variant="caption" sx={{ fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {entry.content}
              </Typography>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  )
}