import React, { useState, useEffect, useMemo, useRef, type FC } from 'react'
import { Dialog, DialogContent, TextField, ListItemButton, ListItemText, Chip, InputAdornment, Typography, Box } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { useAppStore } from '../store/app-store'
import { filterCommands, getAppCommands, groupCommands, type AppCommand } from '../commands/registry'

export const CommandPalette: FC = () => {
  const { commandPaletteOpen, setCommandPaletteOpen } = useAppStore()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Availability can change between opens (e.g. agent undo), so rebuild then.
  const commands = useMemo(() => getAppCommands(), [commandPaletteOpen])
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])
  const groups = useMemo(() => groupCommands(filtered), [filtered])

  const isEnabled = (command: AppCommand) => !command.isEnabled || command.isEnabled()

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIdx(0)
    }
  }, [commandPaletteOpen])

  useEffect(() => { setSelectedIdx(0) }, [query])

  // Keep the highlighted row visible.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx, filtered])

  const runCommand = (command: AppCommand) => {
    if (!isEnabled(command)) return
    setCommandPaletteOpen(false)
    command.run()
  }

  const moveSelection = (delta: 1 | -1) => {
    if (filtered.length === 0) return
    let idx = selectedIdx
    for (let step = 0; step < filtered.length; step++) {
      idx = (idx + delta + filtered.length) % filtered.length
      if (isEnabled(filtered[idx])) {
        setSelectedIdx(idx)
        return
      }
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = filtered[selectedIdx]
      if (command) runCommand(command)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setCommandPaletteOpen(false)
    }
  }

  let flatIndex = 0

  return (
    <Dialog
      open={commandPaletteOpen}
      onClose={() => setCommandPaletteOpen(false)}
      fullWidth
      slotProps={{ paper: { sx: { maxWidth: 560, maxHeight: 460, mt: '10vh' } } }}
    >
      <DialogContent sx={{ p: 0 }}>
        <TextField
          fullWidth
          autoFocus
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 }, '& fieldset': { border: 'none' } }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>
            }
          }}
        />
        <Box
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          sx={{ maxHeight: 340, overflow: 'auto', borderTop: 1, borderColor: 'divider', py: 0.5 }}
        >
          {filtered.length === 0 && (
            <Typography sx={{ p: 2, fontSize: 12, color: 'text.secondary' }}>No matching commands</Typography>
          )}
          {groups.map((group) => (
            <Box key={group.category}>
              <Typography
                variant="caption"
                sx={{ px: 2, py: 0.5, display: 'block', fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {group.category}
              </Typography>
              {group.commands.map((command) => {
                const idx = flatIndex++
                const enabled = isEnabled(command)
                const selected = idx === selectedIdx
                return (
                  <ListItemButton
                    key={command.id}
                    role="option"
                    aria-selected={selected}
                    data-selected={selected ? 'true' : undefined}
                    disabled={!enabled}
                    onClick={() => runCommand(command)}
                    onMouseMove={() => { if (enabled && idx !== selectedIdx) setSelectedIdx(idx) }}
                    sx={{ py: 0.5, bgcolor: selected ? 'action.selected' : 'transparent' }}
                  >
                    <ListItemText
                      primary={command.label}
                      secondary={!enabled ? command.disabledReason : undefined}
                      slotProps={{ primary: { sx: { fontSize: 12 } }, secondary: { sx: { fontSize: 11 } } }}
                    />
                    {command.shortcut && <Chip label={command.shortcut} size="small" variant="outlined" sx={{ fontSize: 12, height: 18 }} />}
                  </ListItemButton>
                )
              })}
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
