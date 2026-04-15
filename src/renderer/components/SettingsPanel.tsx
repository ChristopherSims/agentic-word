import React, { useState, useEffect, type FC } from 'react'
import { Box, Paper, Typography, IconButton, Tabs, Tab, TextField, Button, Slider, Switch, Select, MenuItem, FormControlLabel, Divider, Chip, List, ListItem, ListItemText, FormControl, Avatar, Stack, Table, TableBody, TableRow, TableCell } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import ApplyIcon from '@mui/icons-material/Check'
import { useAppStore } from '../store/app-store'
import { THEMES, ACCENT_SWATCHES, EDITOR_FONTS, SPELL_CHECK_LANGUAGES, LINE_SPACINGS, AUTO_SAVE_OPTIONS } from '../themes'

interface Preset { id: string; name: string; endpoint: string; apiKey: string; model: string }

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const SettingsPanel: FC = () => {
  const {
    settingsPanelOpen, settingsPanelView,
    theme, accentColor, uiFontSize, editorFont,
    agentConfig, setAgentConfig, availableTools, agentPresets, setAgentPresets,
    agentMaxToolTurns, agentAutoApplyThreshold, agentTemperature,
    spellCheckLang, defaultFontFamily, defaultFontSize, showWordCount, lineSpacing,
    vcsDefaultBranch, vcsAutoCommitOnSave, vcsMaxCommits,
    collabDisplayName, collabCursorColor, collabMcpPort,
    setSettingsPanelOpen, setSettingsPanelView,
    setTheme, setAccentColor, setUiFontSize, setEditorFont,
    setAgentMaxToolTurns, setAgentAutoApplyThreshold, setAgentTemperature,
    setSpellCheckLang, setDefaultFontFamily, setDefaultFontSize, setShowWordCount, setLineSpacing,
    setVcsDefaultBranch, setVcsAutoCommitOnSave, setVcsMaxCommits,
    setCollabDisplayName, setCollabCursorColor, setCollabMcpPort,
    setAutoSaveInterval
  } = useAppStore()

  const [localAgentConfig, setLocalAgentConfig] = useState(agentConfig)
  const [newPresetName, setNewPresetName] = useState('')

  useEffect(() => { setLocalAgentConfig(agentConfig) }, [agentConfig])
  useEffect(() => { window.wordapp?.agent.getPresets().then((p) => { if (p) setAgentPresets(p as Preset[]) }).catch(() => {}) }, [])

  useEffect(() => {
    const themeDef = THEMES.find((t) => t.name === theme)
    if (themeDef) { for (const [key, value] of Object.entries(themeDef.vars)) document.documentElement.style.setProperty(key, value) }
    if (accentColor) document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('font-size', `${uiFontSize}px`)
  }, [theme, accentColor, uiFontSize])

  useEffect(() => {
    const editor = document.querySelector('.tiptap') as HTMLElement | null
    if (editor) { editor.style.fontFamily = `"${editorFont}", monospace`; editor.style.lineHeight = lineSpacing }
  }, [editorFont, lineSpacing])

  useEffect(() => { window.wordapp?.agent.configureAdvanced({ maxToolTurns: agentMaxToolTurns, temperature: agentTemperature }) }, [agentMaxToolTurns, agentTemperature])
  useEffect(() => { window.wordapp?.settings.setSpellCheckLang(spellCheckLang) }, [spellCheckLang])

  const handleAgentSave = async () => { setAgentConfig(localAgentConfig); await window.wordapp?.agent.configure(localAgentConfig) }
  const handleSavePreset = async () => { if (!newPresetName.trim()) return; await window.wordapp?.agent.addPreset({ name: newPresetName, endpoint: localAgentConfig.endpoint, apiKey: localAgentConfig.apiKey, model: localAgentConfig.model }); const p = await window.wordapp?.agent.getPresets(); if (p) setAgentPresets(p as Preset[]); setNewPresetName('') }
  const handleApplyPreset = async (id: string) => { const config = await window.wordapp?.agent.applyPreset(id); if (config) { const c = config as { endpoint: string; apiKey: string; model: string }; setLocalAgentConfig(c); setAgentConfig(c) } }
  const handleDeletePreset = async (id: string) => { await window.wordapp?.agent.deletePreset(id); const p = await window.wordapp?.agent.getPresets(); if (p) setAgentPresets(p as Preset[]) }

  const chatSidebarOpen = useAppStore((s) => s.chatSidebarOpen)

  if (!settingsPanelOpen) return null

  return (
    <Paper sx={{ position: 'fixed', right: chatSidebarOpen ? 340 : 0, top: 0, bottom: 0, width: 380, zIndex: 100, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={settingsPanelView} onChange={(_, v) => setSettingsPanelView(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 30, '& .MuiTab-root': { minHeight: 28, px: 1, fontSize: 11 } }}>
          <Tab label="Appearance" value="appearance" /><Tab label="Agent" value="agent" /><Tab label="Editor" value="editor" /><Tab label="VCS" value="vcs" /><Tab label="Collab" value="collab" /><Tab label="Keys" value="keybindings" />
        </Tabs>
        <IconButton size="small" onClick={() => setSettingsPanelOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {settingsPanelView === 'appearance' && (
          <>
            <SectionTitle>Theme</SectionTitle>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              {THEMES.map((t) => (
                <Chip key={t.name} label={t.label} variant={theme === t.name ? 'filled' : 'outlined'} color={theme === t.name ? 'primary' : 'default'} onClick={() => setTheme(t.name)} size="small" sx={{ fontSize: 11 }} />
              ))}
            </Stack>

            <SectionTitle>Accent Color</SectionTitle>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              {ACCENT_SWATCHES.map((s) => (
                <Avatar key={s.name} sx={{ width: 24, height: 24, bgcolor: s.color, cursor: 'pointer', border: accentColor === s.color ? 2 : 0, borderColor: 'text.primary' }} onClick={() => setAccentColor(s.color)} variant="rounded" />
              ))}
            </Stack>

            <SectionTitle>UI Font Size</SectionTitle>
            <Slider value={uiFontSize} onChange={(_, v) => setUiFontSize(v as number)} min={12} max={18} step={1} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}px`} size="small" />

            <SectionTitle>Editor Font</SectionTitle>
            <FormControl fullWidth size="small"><Select value={editorFont} onChange={(e) => setEditorFont(e.target.value)}>{EDITOR_FONTS.map((f) => <MenuItem key={f} value={f} sx={{ fontSize: 11 }}>{f}</MenuItem>)}</Select></FormControl>
          </>
        )}

        {settingsPanelView === 'agent' && (
          <>
            <SectionTitle>API Configuration</SectionTitle>
            <TextField fullWidth label="Endpoint" value={localAgentConfig.endpoint} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, endpoint: e.target.value })} placeholder="http://localhost:11434/v1" sx={{ mb: 1 }} />
            <TextField fullWidth label="API Key" type="password" value={localAgentConfig.apiKey} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, apiKey: e.target.value })} placeholder="Leave empty for local models" sx={{ mb: 1 }} />
            <TextField fullWidth label="Model" value={localAgentConfig.model} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, model: e.target.value })} placeholder="hermes3, gpt-4, llama3" sx={{ mb: 1 }} />
            <Button fullWidth variant="contained" size="small" onClick={handleAgentSave}>Save Agent Config</Button>

            <SectionTitle>Presets</SectionTitle>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField size="small" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Preset name..." onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset() }} sx={{ flex: 1 }} />
              <Button size="small" variant="outlined" onClick={handleSavePreset}>Save</Button>
            </Box>
            <List dense>{agentPresets.map((p) => (
              <ListItem key={p.id} secondaryAction={<Box sx={{ display: 'flex', gap: 0.25 }}><IconButton size="small" onClick={() => handleApplyPreset(p.id)}><ApplyIcon sx={{ fontSize: 14 }} /></IconButton><IconButton size="small" onClick={() => handleDeletePreset(p.id)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton></Box>}>
                <ListItemText primary={p.name} secondary={p.model} primaryTypographyProps={{ fontSize: 12 }} secondaryTypographyProps={{ fontSize: 10 }} />
              </ListItem>
            ))}</List>

            <SectionTitle>Tool Chain Turns</SectionTitle>
            <Slider value={agentMaxToolTurns} onChange={(_, v) => setAgentMaxToolTurns(v as number)} min={1} max={10} step={1} valueLabelDisplay="auto" size="small" />

            <SectionTitle>Auto-Apply Threshold</SectionTitle>
            <Typography variant="caption" color="text.secondary">0 = always require review</Typography>
            <Slider value={agentAutoApplyThreshold} onChange={(_, v) => setAgentAutoApplyThreshold(v as number)} min={0} max={100} step={5} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} size="small" />

            <SectionTitle>Temperature</SectionTitle>
            <Slider value={agentTemperature} onChange={(_, v) => setAgentTemperature(v as number)} min={0} max={2} step={0.1} valueLabelDisplay="auto" size="small" />

            <SectionTitle>Tools ({availableTools.length})</SectionTitle>
            <Box sx={{ fontSize: 11, color: 'text.secondary', maxHeight: 100, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
              {availableTools.map((t) => <div key={t.name}><Typography component="span" color="primary" fontWeight={600}>{t.name}</Typography> — {t.description}</div>)}
            </Box>
          </>
        )}

        {settingsPanelView === 'editor' && (
          <>
            <SectionTitle>Auto-Save Interval</SectionTitle>
            <FormControl fullWidth size="small"><Select value={useAppStore.getState().autoSaveIntervalMs} onChange={(e) => setAutoSaveInterval(Number(e.target.value))}>{AUTO_SAVE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value} sx={{ fontSize: 11 }}>{o.label}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Spell Check Language</SectionTitle>
            <FormControl fullWidth size="small"><Select value={spellCheckLang} onChange={(e) => setSpellCheckLang(e.target.value)}>{SPELL_CHECK_LANGUAGES.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Default Font Family</SectionTitle>
            <FormControl fullWidth size="small"><Select value={defaultFontFamily} onChange={(e) => setDefaultFontFamily(e.target.value)}><MenuItem value="" sx={{ fontSize: 11 }}>(inherit)</MenuItem>{['Arial', 'Calibri', 'Cambria', 'Consolas', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana'].map((f) => <MenuItem key={f} value={f} sx={{ fontSize: 11 }}>{f}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Default Font Size</SectionTitle>
            <FormControl fullWidth size="small"><Select value={defaultFontSize} onChange={(e) => setDefaultFontSize(e.target.value)}>{['12px', '14px', '16px', '18px', '20px', '24px'].map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 11 }}>{s}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Line Spacing</SectionTitle>
            <FormControl fullWidth size="small"><Select value={lineSpacing} onChange={(e) => setLineSpacing(e.target.value)}>{LINE_SPACINGS.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

            <FormControlLabel control={<Switch checked={showWordCount} onChange={(e) => setShowWordCount(e.target.checked)} />} label={<Typography variant="caption">Show word/char count</Typography>} />
          </>
        )}

        {settingsPanelView === 'vcs' && (
          <>
            <SectionTitle>Default Branch Name</SectionTitle>
            <TextField fullWidth value={vcsDefaultBranch} onChange={(e) => setVcsDefaultBranch(e.target.value)} placeholder="main" />

            <FormControlLabel control={<Switch checked={vcsAutoCommitOnSave} onChange={(e) => setVcsAutoCommitOnSave(e.target.checked)} />} label={<Typography variant="caption">Auto-commit on save</Typography>} sx={{ mt: 1 }} />

            <SectionTitle>Max Commits Retained</SectionTitle>
            <Typography variant="caption" color="text.secondary">0 = unlimited</Typography>
            <TextField fullWidth type="number" value={vcsMaxCommits || ''} onChange={(e) => setVcsMaxCommits(Number(e.target.value) || 0)} placeholder="0" />
          </>
        )}

        {settingsPanelView === 'collab' && (
          <>
            <SectionTitle>Display Name</SectionTitle>
            <TextField fullWidth value={collabDisplayName} onChange={(e) => setCollabDisplayName(e.target.value)} placeholder="Your name" />

            <SectionTitle>Cursor Color</SectionTitle>
            <input type="color" value={collabCursorColor} onChange={(e) => setCollabCursorColor(e.target.value)} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer' }} />

            <SectionTitle>MCP Port</SectionTitle>
            <TextField fullWidth type="number" value={collabMcpPort || ''} onChange={(e) => setCollabMcpPort(Number(e.target.value))} placeholder="0 = off" />
          </>
        )}

        {settingsPanelView === 'keybindings' && (
          <>
            <SectionTitle>Keyboard Shortcuts</SectionTitle>
            <Table sx={{ '& td, & th': { fontSize: 11, py: 0.5 } }}>
              <TableBody>
                {[
                  ['Ctrl+N', 'New Document'], ['Ctrl+O', 'Open File'], ['Ctrl+S', 'Save'],
                  ['Ctrl+F', 'Find & Replace'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'],
                  ['Ctrl+T', 'New Tab'], ['Ctrl+\\', 'Split View'], ['Ctrl+,', 'Settings'],
                  ['Ctrl+Shift+E', 'AI Inline Edit'], ['Ctrl+Shift+F', 'Insert Footnote'],
                  ['Ctrl+Shift+P', 'Command Palette'], ['Ctrl+Shift+G', 'VCS Commit'],
                  ['Esc', 'Exit Focus Mode']
                ].map(([key, desc]) => (
                  <TableRow key={key}><TableCell><Chip label={key} size="small" variant="outlined" sx={{ fontSize: 9, height: 18 }} /></TableCell><TableCell>{desc}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Box>
    </Paper>
  )
}
