import React, { useState, useEffect, useCallback, type FC } from 'react'
import { Box, TextField, Typography, Paper, List, ListItemButton, ListItemText, ListItemIcon } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import SummarizeIcon from '@mui/icons-material/Summarize'
import TranslateIcon from '@mui/icons-material/Translate'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SpellcheckIcon from '@mui/icons-material/Spellcheck'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import { useAppStore } from '../store/app-store'

interface Command {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  action: () => void
}

export const AgentCommandBar: FC = () => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const documentContent = useAppStore((s) => s.documentContent)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const addToast = useAppStore((s) => s.addToast)
  const addChatMessage = useAppStore((s) => s.addChatMessage)
  const setChatLoading = useAppStore((s) => s.setChatLoading)
  const setChatSidebarOpen = useAppStore((s) => s.setChatSidebarOpen)

  const commands: Command[] = [
    {
      id: 'summarize',
      label: 'Summarize document',
      description: 'Generate an executive summary',
      icon: <SummarizeIcon sx={{ fontSize: 18 }} />,
      action: () => executeSimple('Summarize this document in a concise executive summary. Return only the summary.')
    },
    {
      id: 'outline',
      label: 'Generate outline',
      description: 'Create a document outline from content',
      icon: <FormatListNumberedIcon sx={{ fontSize: 18 }} />,
      action: () => executeSimple('Analyze this document and generate a detailed outline with sections and subsections. Return as a JSON array with title, level, and children fields.')
    },
    {
      id: 'grammar',
      label: 'Check grammar',
      description: 'Find and fix grammar issues',
      icon: <SpellcheckIcon sx={{ fontSize: 18 }} />,
      action: () => executeSimple('Check this document for grammar and spelling errors. List each issue with the original text, suggested fix, and explanation.')
    },
    {
      id: 'translate',
      label: 'Translate document',
      description: 'Translate to another language',
      icon: <TranslateIcon sx={{ fontSize: 18 }} />,
      action: () => executeSimple('Translate the following document to Spanish. Return only the translated text.')
    },
    {
      id: 'improve',
      label: 'Improve writing',
      description: 'Enhance clarity and style',
      icon: <AutoAwesomeIcon sx={{ fontSize: 18 }} />,
      action: () => executeSimple('Improve the writing quality of this document. Make it clearer, more engaging, and fix any awkward phrasing. Return the improved version.')
    },
  ]

  const executeSimple = async (prompt: string) => {
    setOpen(false)
    setChatSidebarOpen(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: prompt })
    setChatLoading(true)
    try {
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: prompt }],
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
    } catch (err) {
      addToast('error', `Command failed: ${(err as Error).message}`)
    }
    setChatLoading(false)
  }

  const executeCustom = async () => {
    if (!query.trim()) return
    setOpen(false)
    const prompt = query.trim()
    setChatSidebarOpen(true)
    addChatMessage({ id: crypto.randomUUID(), role: 'user' as const, content: prompt })
    setChatLoading(true)
    try {
      await window.wordapp?.agent.chatStream(
        [{ role: 'user', content: prompt }],
        { documentContent: documentContent.slice(0, 4000), currentBranch }
      )
    } catch (err) {
      addToast('error', `Command failed: ${(err as Error).message}`)
    }
    setChatLoading(false)
    setQuery('')
  }

  const filtered = query
    ? commands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault()
        setOpen((prev) => !prev)
        setQuery('')
        setSelectedIndex(0)
      }
      if (!open) return
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action()
        } else {
          executeCustom()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, query, selectedIndex, filtered])

  if (!open) return null

  return (
    <Box
      onClick={() => { setOpen(false); setQuery('') }}
      sx={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', justifyContent: 'center', pt: '15vh',
        bgcolor: 'rgba(0,0,0,0.5)',
      }}
    >
      <Paper
        onClick={(e) => e.stopPropagation()}
        sx={{ width: 520, maxHeight: 400, overflow: 'hidden', borderRadius: 2, boxShadow: 24 }}
      >
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          <TextField
            autoFocus
            fullWidth
            variant="standard"
            placeholder="Ask the agent to do something... (e.g. summarize, outline, translate)"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            InputProps={{ disableUnderline: true, sx: { fontSize: 14 } }}
          />
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, whiteSpace: 'nowrap' }}>
            Esc to close
          </Typography>
        </Box>

        <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
          {filtered.map((cmd, i) => (
            <ListItemButton
              key={cmd.id}
              selected={i === selectedIndex}
              onClick={cmd.action}
              sx={{ py: 0.75 }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>{cmd.icon}</ListItemIcon>
              <ListItemText
                primary={cmd.label}
                secondary={cmd.description}
                slotProps={{
                  primary: { sx: { fontSize: 13 } },
                  secondary: { sx: { fontSize: 10 } },
                }}
              />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9 }}>⏎</Typography>
            </ListItemButton>
          ))}
          {query && filtered.length === 0 && (
            <ListItemButton onClick={executeCustom} sx={{ py: 0.75 }}>
              <ListItemIcon sx={{ minWidth: 32 }}><AutoAwesomeIcon sx={{ fontSize: 18 }} /></ListItemIcon>
              <ListItemText
                primary={`Ask: "${query}"`}
                secondary="Send custom prompt to agent"
                slotProps={{
                  primary: { sx: { fontSize: 13, fontStyle: 'italic' } },
                  secondary: { sx: { fontSize: 10 } },
                }}
              />
            </ListItemButton>
          )}
        </List>
      </Paper>
    </Box>
  )
}
