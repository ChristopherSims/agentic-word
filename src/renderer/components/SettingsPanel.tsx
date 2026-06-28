import React, { useEffect, type FC } from 'react'
import { Box, Tabs, Tab, Chip, Table, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
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
import { THEMES } from '../themes'

export const SettingsPanel: FC = () => {
  const {
    settingsPanelOpen, settingsPanelView,
    theme, accentColor, uiFontSize, editorFont,
    setSettingsPanelOpen, setSettingsPanelView,
    saveAllSettings
  } = useAppStore()

  // Apply theme CSS variables
  useEffect(() => {
    const themeDef = THEMES.find((t) => t.name === theme)
    if (themeDef) { for (const [key, value] of Object.entries(themeDef.vars)) document.documentElement.style.setProperty(key, value) }
    if (accentColor) document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('font-size', `${uiFontSize}px`)
  }, [theme, accentColor, uiFontSize])

  useEffect(() => {
    const editor = document.querySelector('.tiptap') as HTMLElement | null
    if (editor) { editor.style.fontFamily = `"${editorFont}", monospace` }
  }, [editorFont])

  const handleClose = () => {
    saveAllSettings()
    setSettingsPanelOpen(false)
  }

  return (
    <Dialog
      open={settingsPanelOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      sx={{
        '& .MuiDialog-container': { height: '100%', alignItems: 'flex-start' },
        '& .MuiDialog-paper': {
          height: '90vh',
          maxHeight: '95vh',
          mx: 2,
          mt: 2,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mr: 'auto' }}>
          <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'var(--accent-muted)', color: 'var(--accent)', border: 1, borderColor: 'var(--accent)', fontSize: '0.8rem', mr: 1 }}>Settings</Box>
        </Typography>
        <IconButton onClick={handleClose} sx={{ p: 1 }}><CloseIcon /></IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs value={settingsPanelView} onChange={(_, v) => setSettingsPanelView(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 30, '& .MuiTab-root': { minHeight: 28, px: 1, fontSize: 11 } }}>
          <Tab label="Appearance" value="appearance" />
          <Tab label="Agent" value="agent" />
          <Tab label="Editor" value="editor" />
          <Tab label="Behavior" value="behavior" />
          <Tab label="Advanced" value="advanced" />
          <Tab label="VCS" value="vcs" />
          <Tab label="Collab" value="collab" />
          <Tab label="Privacy" value="privacy" />
          <Tab label="Plugins" value="plugins" />
          <Tab label="Keys" value="keybindings" />
        </Tabs>
      </Box>

      <DialogContent sx={{ flex: 1, overflow: 'auto', p: 2, minHeight: 0 }}>
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
          <Table sx={{ '& td, & th': { fontSize: 11, py: 0.5 } }}>
            <TableBody>
              {[
                ['Ctrl+N', 'New Document'], ['Ctrl+O', 'Open File'], ['Ctrl+S', 'Save'],
                ['Ctrl+F', 'Find & Replace'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'],
                ['Ctrl+T', 'New Tab'], ['Ctrl+\\', 'Split View'], ['Ctrl+,', 'Settings'],
                ['Ctrl+Shift+E', 'Export Dialog'], ['Ctrl+Shift+F', 'Font Manager'],
                ['Ctrl+Shift+P', 'Command Palette'], ['Ctrl+Shift+G', 'Grammar Panel'],
                ['Ctrl+Shift+S', 'Global Search'], ['Ctrl+Shift+A', 'Accessibility Settings'],
                ['Ctrl+Shift+T', 'Theme Customizer'], ['Ctrl+Shift+C', 'Spell Check Panel'],
                ['Ctrl+Shift+W', 'Writing Suggestions'], ['Ctrl+Shift+K', 'Keyboard Shortcuts'],
                ['Esc', 'Exit Focus Mode']
              ].map(([key, desc]) => (
                <TableRow key={key}><TableCell><Chip label={key} size="small" variant="outlined" sx={{ fontSize: 9, height: 18 }} /></TableCell><TableCell>{desc}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}
