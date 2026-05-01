import React, { useState, useEffect, useMemo, type FC } from 'react'
import { Dialog, DialogContent, Autocomplete, TextField, List, ListItem, ListItemButton, ListItemText, Typography, Chip, Box, InputAdornment } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { useAppStore } from '../store/app-store'

interface Command {
  id: string
  label: string
  category: string
  shortcut?: string
  action: () => void
}

export const CommandPalette: FC = () => {
  const { commandPaletteOpen, setCommandPaletteOpen } = useAppStore()

  const commands = useMemo<Command[]>(() => [
    { id: 'new', label: 'New Document', category: 'File', shortcut: 'Ctrl+N', action: () => { useAppStore.getState().setDocumentContent(''); useAppStore.getState().setDocumentTitle('Untitled'); useAppStore.getState().setCurrentFilePath(null); useAppStore.getState().setDirty(false) }},
    { id: 'open', label: 'Open File...', category: 'File', shortcut: 'Ctrl+O', action: () => window.wordapp?.file.openDialog().then(() => {}) },
    { id: 'save', label: 'Save', category: 'File', shortcut: 'Ctrl+S', action: () => window.wordapp?.on('file-save', () => {}) },
    { id: 'save-as', label: 'Save As...', category: 'File', shortcut: 'Ctrl+Shift+S', action: () => window.wordapp?.file.saveAsDialog().then(() => {}) },
    { id: 'export-pdf', label: 'Export PDF...', category: 'File', action: () => window.wordapp?.on('file-export-pdf', () => {}) },
    { id: 'template-blank', label: 'New from Template: Blank', category: 'File', action: () => loadTemplate('blank') },
    { id: 'template-letter', label: 'New from Template: Letter', category: 'File', action: () => loadTemplate('letter') },
    { id: 'template-resume', label: 'New from Template: Resume', category: 'File', action: () => loadTemplate('resume') },
    { id: 'template-report', label: 'New from Template: Report', category: 'File', action: () => loadTemplate('report') },
    { id: 'template-memo', label: 'New from Template: Memo', category: 'File', action: () => loadTemplate('memo') },
    { id: 'template-gallery', label: 'Template Gallery...', category: 'File', action: () => useAppStore.getState().setTemplateGalleryOpen(true) },
    { id: 'find', label: 'Find...', category: 'Edit', shortcut: 'Ctrl+F', action: () => useAppStore.getState().setFindBarOpen(true) },
    { id: 'find-replace', label: 'Find and Replace...', category: 'Edit', shortcut: 'Ctrl+H', action: () => useAppStore.getState().setFindBarOpen(true) },
    { id: 'settings', label: 'Settings...', category: 'View', shortcut: 'Ctrl+,', action: () => useAppStore.getState().setSettingsPanelOpen(true) },
    { id: 'toggle-sidebar', label: 'Toggle Chat Sidebar', category: 'View', action: () => useAppStore.getState().toggleChatSidebar() },
    { id: 'toggle-vcs', label: 'Toggle VCS Panel', category: 'View', action: () => useAppStore.getState().setVcsPanelOpen(!useAppStore.getState().vcsPanelOpen) },
    { id: 'toggle-split', label: 'Toggle Split View', category: 'View', shortcut: 'Ctrl+\\', action: () => useAppStore.getState().setSplitViewOpen(!useAppStore.getState().splitViewOpen) },
    { id: 'toggle-md-preview', label: 'Toggle Markdown Preview', category: 'View', action: () => useAppStore.getState().setMdPreviewOpen(!useAppStore.getState().mdPreviewOpen) },
    { id: 'outline', label: 'Toggle Outline View', category: 'View', action: () => useAppStore.getState().setOutlineOpen(!useAppStore.getState().outlineOpen) },
    { id: 'doc-stats', label: 'Toggle Document Statistics', category: 'View', action: () => useAppStore.getState().setDocStatsPanelOpen(!useAppStore.getState().docStatsPanelOpen) },
    { id: 'collab', label: 'Toggle Collaboration Panel', category: 'View', action: () => useAppStore.getState().setCollabPanelOpen(!useAppStore.getState().collabPanelOpen) },
    { id: 'insert-footnote', label: 'Insert Footnote', category: 'Edit', shortcut: 'Ctrl+Shift+F', action: () => {} },
    { id: 'vcs-commit', label: 'VCS: Commit...', category: 'VCS', shortcut: 'Ctrl+Shift+G', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('commit') }},
    { id: 'vcs-log', label: 'VCS: Show Log', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('log') }},
    { id: 'vcs-branches', label: 'VCS: Branches', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('branches') }},
    { id: 'vcs-graph', label: 'VCS: Commit Graph', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('graph') }},
    { id: 'vcs-merge', label: 'VCS: Merge...', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('merge') }},
    { id: 'vcs-diff', label: 'VCS: Diff', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('diff') }},
    { id: 'vcs-tags', label: 'VCS: Tags', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('tags') }},
    { id: 'agent-undo', label: 'Undo Last Agent Action', category: 'Agent', action: () => useAppStore.getState().undoLastAcceptedChange() },
  ], [])

  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => { if (commandPaletteOpen) { setQuery(''); setSelectedIdx(0) } }, [commandPaletteOpen])
  useEffect(() => { setSelectedIdx(0) }, [query])

  const executeCommand = (cmd: Command) => { setCommandPaletteOpen(false); cmd.action() }

  let lastCategory = ''

  return (
    <Dialog open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { maxHeight: 420, mt: '10vh' } }}>
      <DialogContent sx={{ p: 0 }}>
        <Autocomplete
          freeSolo
          open
          inputValue={query}
          onInputChange={(_, v) => setQuery(v)}
          options={filtered}
          getOptionLabel={(o) => typeof o === 'string' ? o : o.label}
          groupBy={(o) => o.category}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Type a command..."
              autoFocus
              InputProps={{ ...params.InputProps, startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>) }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            />
          )}
          renderOption={(props, option) => {
            const cmd = option as Command
            const { key, ...liProps } = props
            return (
              <li key={key} {...liProps}>
                <ListItemButton onClick={() => executeCommand(cmd)} sx={{ py: 0.5 }}>
                  <ListItemText primary={cmd.label} primaryTypographyProps={{ fontSize: 12 }} />
                  {cmd.shortcut && <Chip label={cmd.shortcut} size="small" variant="outlined" sx={{ fontSize: 9, height: 18 }} />}
                </ListItemButton>
              </li>
            )
          }}
          sx={{ '& .MuiAutocomplete-paper': { maxHeight: 300 } }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[selectedIdx]) { e.preventDefault(); executeCommand(filtered[selectedIdx]) }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

async function loadTemplate(name: string) {
  const content = await window.wordapp?.template.get(name)
  if (content) {
    const store = useAppStore.getState()
    store.setDocumentContent(content)
    store.setDocumentTitle(name.charAt(0).toUpperCase() + name.slice(1))
    store.setCurrentFilePath(null)
    store.setDirty(true)
  }
}
