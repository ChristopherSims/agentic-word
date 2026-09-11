import React, { useMemo, useState, type FC } from 'react'
import { Box, ButtonBase, Chip, Dialog, DialogContent, DialogTitle, IconButton, InputAdornment, ListItemButton, ListItemText, Table, TableBody, TableCell, TableRow, TextField, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { useAppStore } from '../store/app-store'
import { AppearanceSettings } from './settings/AppearanceSettings'
import { AgentSettings } from './settings/AgentSettings'
import { EditorSettings } from './settings/EditorSettings'
import { BehaviorSettings } from './settings/BehaviorSettings'
import { AdvancedSettings } from './settings/AdvancedSettings'
import { VcsSettings } from './settings/VcsSettings'
import { CollabSettings } from './settings/CollabSettings'
import { PrivacySettings } from './settings/PrivacySettings'
import { PluginsSettings } from './settings/PluginsSettings'
import { SETTINGS_NAV, navLabel, searchSettings, type SettingIndexEntry, type SettingsView } from '../settings/index'
import { buildShortcutHelp } from '../commands/shortcuts'
import { formatKeybinding } from '../utils/keyboard-shortcuts'

export const SettingsPanel: FC = () => {
  const {
    settingsPanelOpen, settingsPanelView,
    setSettingsPanelOpen, setSettingsPanelView,
    saveAllSettings, keyboardShortcuts
  } = useAppStore()
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchSettings(query), [query])
  const shortcutRows = useMemo(() => buildShortcutHelp(keyboardShortcuts), [keyboardShortcuts])

  const handleClose = () => {
    saveAllSettings()
    setSettingsPanelOpen(false)
  }

  const goToSetting = (entry: SettingIndexEntry) => {
    setSettingsPanelView(entry.view)
    setQuery('')
    if (!entry.anchor) return
    // Wait for the target pane to render, then reveal and focus the control.
    window.setTimeout(() => {
      const el = document.querySelector(`[data-setting="${entry.anchor}"]`)
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'center' })
        el.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]')?.focus()
      }
    }, 60)
  }

  const navItemSx = (selected: boolean) => ({
    width: '100%',
    justifyContent: 'flex-start',
    px: 1.5,
    py: 0.75,
    borderRadius: 0.5,
    fontSize: 13,
    fontWeight: selected ? 600 : 400,
    color: selected ? 'primary.main' : 'text.primary',
    bgcolor: selected ? 'action.selected' : 'transparent',
    '&:hover': { bgcolor: 'action.hover' }
  })

  return (
    <Dialog
      open={settingsPanelOpen}
      onClose={handleClose}
      fullWidth
      scroll="paper"
      sx={{
        '& .MuiDialog-container': { height: '100%', alignItems: 'flex-start' },
        '& .MuiDialog-paper': {
          height: 'auto',
          minHeight: 420,
          maxHeight: '85vh',
          mx: 2,
          mt: 2,
          display: 'flex',
          flexDirection: 'column'
        },
        maxWidth: 'md'
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 'auto' }}>Settings</Typography>
        <IconButton onClick={handleClose} aria-label="Close settings"><CloseIcon /></IconButton>
      </DialogTitle>

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box
          component="nav"
          aria-label="Settings categories"
          sx={{ width: 216, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Box sx={{ p: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search settings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>
                }
              }}
            />
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', pb: 1 }}>
            {query.trim() ? (
              results.length > 0 ? (
                results.map((entry) => (
                  <ListItemButton key={entry.id} onClick={() => goToSetting(entry)} sx={{ py: 0.5, display: 'block' }}>
                    <ListItemText
                      primary={entry.label}
                      secondary={navLabel(entry.view)}
                      slotProps={{ primary: { sx: { fontSize: 13 } }, secondary: { sx: { fontSize: 12 } } }}
                    />
                  </ListItemButton>
                ))
              ) : (
                <Typography sx={{ px: 1.5, py: 1, fontSize: 12, color: 'text.secondary' }}>No matching settings</Typography>
              )
            ) : (
              SETTINGS_NAV.map((item) => (
                <ButtonBase
                  key={item.id}
                  onClick={() => setSettingsPanelView(item.id)}
                  aria-current={settingsPanelView === item.id ? 'page' : undefined}
                  sx={navItemSx(settingsPanelView === item.id)}
                >
                  {item.label}
                </ButtonBase>
              ))
            )}
          </Box>
        </Box>

        <DialogContent sx={{ flex: 1, overflow: 'auto', p: 2, minHeight: 0, minWidth: 0 }}>
          {settingsPanelView === 'appearance' && <AppearanceSettings />}
          {settingsPanelView === 'agent' && <AgentSettings />}
          {settingsPanelView === 'editor' && <EditorSettings />}
          {settingsPanelView === 'behavior' && <BehaviorSettings />}
          {settingsPanelView === 'advanced' && <AdvancedSettings />}
          {settingsPanelView === 'vcs' && <VcsSettings />}
          {settingsPanelView === 'collab' && <CollabSettings />}
          {settingsPanelView === 'privacy' && <PrivacySettings />}
          {settingsPanelView === 'plugins' && <PluginsSettings />}
          {settingsPanelView === 'keybindings' && (
            <Table sx={{ '& td, & th': { fontSize: 12, py: 0.5 } }}>
              <TableBody>
                {shortcutRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={{ width: 160 }}><Chip label={formatKeybinding(row.keybinding)} size="small" variant="outlined" sx={{ fontSize: 12, height: 18 }} /></TableCell>
                    <TableCell>{row.label}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>{row.category}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Box>
    </Dialog>
  )
}
