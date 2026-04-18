import React, { useState, useEffect, type FC } from 'react'
import { Box, Typography, IconButton, Tabs, Tab, TextField, Button, Slider, Switch, Select, MenuItem, FormControlLabel, Divider, Chip, List, ListItem, ListItemText, FormControl, Avatar, Stack, Table, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import ApplyIcon from '@mui/icons-material/Check'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import { useAppStore } from '../store/app-store'
import type { PluginManifest, PluginMarketplaceEntry } from '../types'
import { SidePanel } from './shared/SidePanel'
import { THEMES, ACCENT_SWATCHES, EDITOR_FONTS, SPELL_CHECK_LANGUAGES, LINE_SPACINGS, AUTO_SAVE_OPTIONS } from '../themes'
import { validateInput } from '../utils'

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
    // v0.4.4 settings
    tabSize, useTabsForIndentation, wordWrap, backupFrequency,
    autoSaveOnFocusLoss, autoFormatOnPaste, scrollPastEnd, rememberLastDocument, sessionRestoration, autocorrectAggressiveLevel,
    performanceTuning, cacheSize, updateFrequency, enableBackupExport,
    autoSaveIntervalMs, autocorrectEnabled, smartQuotesEnabled, emDashEnabled,
    pageHeaderFooter,
    setSettingsPanelOpen, setSettingsPanelView,
    setTheme, setAccentColor, setUiFontSize, setEditorFont,
    setAgentMaxToolTurns, setAgentAutoApplyThreshold, setAgentTemperature,
    setSpellCheckLang, setDefaultFontFamily, setDefaultFontSize, setShowWordCount, setLineSpacing,
    setVcsDefaultBranch, setVcsAutoCommitOnSave, setVcsMaxCommits,
    setCollabDisplayName, setCollabCursorColor, setCollabMcpPort,
    setAutoSaveInterval,
    // v0.4.4 setters
    setTabSize, setUseTabsForIndentation, setWordWrap, setBackupFrequency,
    setAutoSaveOnFocusLoss, setAutoFormatOnPaste, setScrollPastEnd, setRememberLastDocument, setSessionRestoration, setAutocorrectAggressiveLevel,
    setPerformanceTuning, setCacheSize, setUpdateFrequency, setEnableBackupExport,
    setAutocorrectEnabled, setSmartQuotesEnabled, setEmDashEnabled,
    setPageHeaderFooter,
    addToast,
    // v0.4.7: Inline Smart Suggestions
    inlineSuggestionsEnabled, inlineSuggestionTriggerWordCount, inlineSuggestionContextLength, inlineSuggestionDebounceMs,
    setInlineSuggestionsEnabled, setInlineSuggestionTriggerWordCount, setInlineSuggestionContextLength, setInlineSuggestionDebounceMs,
    // v0.5.1: Privacy & Security
    privacyMode, dnsOverHttps, dataResidency, gdprConsent, analyticsEnabled,
    setPrivacyMode, setDnsOverHttps, setDataResidency, setGdprConsent, setAnalyticsEnabled,
    // v0.5.0: Cloud & Sync
    autoSyncEnabled, syncInterval, selectiveSyncFolders, autoBackupEnabled, maxBackupVersions, backupRetentionDays,
    setAutoSyncEnabled, setSyncInterval, setSelectiveSyncFolders, setAutoBackupEnabled, setMaxBackupVersions, setBackupRetentionDays
  } = useAppStore()

  const [localAgentConfig, setLocalAgentConfig] = useState(agentConfig)
  const [newPresetName, setNewPresetName] = useState('')
  const [customThemeDialogOpen, setCustomThemeDialogOpen] = useState(false)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const [customThemeName, setCustomThemeName] = useState('')
  const [customThemeColors, setCustomThemeColors] = useState<Record<string, string>>({
    '--bg-primary': '#1e1e2e',
    '--bg-secondary': '#181825',
    '--bg-surface': '#313244',
    '--bg-elevated': '#45475a',
    '--text-primary': '#cdd6f4',
    '--text-secondary': '#a6adc8',
    '--text-muted': '#6c7086',
    '--accent': '#89b4fa',
    '--accent-hover': '#74c7ec',
    '--success': '#a6e3a1',
    '--warning': '#f9e2af',
    '--danger': '#f38ba8',
    '--border': '#585b70'
  })
  const [customThemes, setCustomThemes] = useState<{ name: string; label: string; vars: Record<string, string> }[]>([])
  
  // Cloud & Sync state
  const [providerStatuses, setProviderStatuses] = useState<Array<{ provider: string; isAuthenticated: boolean; displayName: string; syncStatus?: string; lastSyncTime?: number }>>([])
  const [selectedConflictStrategy, setSelectedConflictStrategy] = useState<'last-write-wins' | 'keep-local' | 'manual'>('last-write-wins')
  const [isAuthenticating, setIsAuthenticating] = useState<string | null>(null)

  useEffect(() => { setLocalAgentConfig(agentConfig) }, [agentConfig])
  
  // Listen for cloud status changes from IPC
  useEffect(() => {
    const unsubscribe = window.wordapp?.on('cloud:status-changed', (statuses: typeof providerStatuses) => {
      setProviderStatuses(statuses)
    })
    return () => unsubscribe?.()
  }, [])
  useEffect(() => {
    const stored = localStorage.getItem('customThemes')
    if (stored) {
      try {
        setCustomThemes(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to load custom themes:', e)
      }
    }
  }, [])
  useEffect(() => { window.wordapp?.agent.getPresets().then((p) => { if (p) setAgentPresets(p as Preset[]) }).catch((err) => addToast('warning', `Failed to load agent presets: ${(err as Error).message}`)) }, [])

  useEffect(() => {
    const themeDef = THEMES.find((t) => t.name === theme) || customThemes.find((t) => t.name === theme)
    if (themeDef) { for (const [key, value] of Object.entries(themeDef.vars)) document.documentElement.style.setProperty(key, value) }
    if (accentColor) document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('font-size', `${uiFontSize}px`)
  }, [theme, accentColor, uiFontSize, customThemes])

  useEffect(() => {
    const editor = document.querySelector('.tiptap') as HTMLElement | null
    if (editor) { editor.style.fontFamily = `"${editorFont}", monospace`; editor.style.lineHeight = lineSpacing }
  }, [editorFont, lineSpacing])

  useEffect(() => { window.wordapp?.agent.configureAdvanced({ maxToolTurns: agentMaxToolTurns, temperature: agentTemperature }) }, [agentMaxToolTurns, agentTemperature])
  useEffect(() => { window.wordapp?.settings.setSpellCheckLang(spellCheckLang) }, [spellCheckLang])

  const handleAgentSave = async () => { setAgentConfig(localAgentConfig); await window.wordapp?.agent.configure(localAgentConfig) }
  const handleSavePreset = async () => { if (!validateInput(newPresetName)) return; await window.wordapp?.agent.addPreset({ name: newPresetName, endpoint: localAgentConfig.endpoint, apiKey: localAgentConfig.apiKey, model: localAgentConfig.model }); const p = await window.wordapp?.agent.getPresets(); if (p) setAgentPresets(p as Preset[]); setNewPresetName('') }
  const handleApplyPreset = async (id: string) => { const config = await window.wordapp?.agent.applyPreset(id); if (config) { const c = config as { endpoint: string; apiKey: string; model: string }; setLocalAgentConfig(c); setAgentConfig(c) } }
  const handleDeletePreset = async (id: string) => { await window.wordapp?.agent.deletePreset(id); const p = await window.wordapp?.agent.getPresets(); if (p) setAgentPresets(p as Preset[]) }

  const handleCreateCustomTheme = () => {
    if (!customThemeName.trim()) {
      addToast('error', 'Theme name is required')
      return
    }
    
    if (editingThemeId) {
      // Edit existing theme
      const updated = customThemes.map((t) =>
        t.name === editingThemeId ? { ...t, label: customThemeName, vars: customThemeColors } : t
      )
      setCustomThemes(updated)
      localStorage.setItem('customThemes', JSON.stringify(updated))
      addToast('success', 'Theme updated')
    } else {
      // Create new theme
      const newTheme = {
        name: `custom-${Date.now()}`,
        label: customThemeName,
        vars: customThemeColors
      }
      const updated = [...customThemes, newTheme]
      setCustomThemes(updated)
      localStorage.setItem('customThemes', JSON.stringify(updated))
      setTheme(newTheme.name)
      addToast('success', 'Custom theme created')
    }
    
    resetThemeDialog()
  }

  const handleEditTheme = (themeName: string) => {
    const themeToEdit = customThemes.find((t) => t.name === themeName)
    if (themeToEdit) {
      setEditingThemeId(themeName)
      setCustomThemeName(themeToEdit.label)
      setCustomThemeColors(themeToEdit.vars)
      setCustomThemeDialogOpen(true)
    }
  }

  const handleDeleteTheme = (themeName: string) => {
    const updated = customThemes.filter((t) => t.name !== themeName)
    setCustomThemes(updated)
    localStorage.setItem('customThemes', JSON.stringify(updated))
    if (theme === themeName) {
      setTheme(THEMES[0].name)
    }
    addToast('success', 'Theme deleted')
  }

  const resetThemeDialog = () => {
    setEditingThemeId(null)
    setCustomThemeName('')
    setCustomThemeColors({
      '--bg-primary': '#1e1e2e',
      '--bg-secondary': '#181825',
      '--bg-surface': '#313244',
      '--bg-elevated': '#45475a',
      '--text-primary': '#cdd6f4',
      '--text-secondary': '#a6adc8',
      '--text-muted': '#6c7086',
      '--accent': '#89b4fa',
      '--accent-hover': '#74c7ec',
      '--success': '#a6e3a1',
      '--warning': '#f9e2af',
      '--danger': '#f38ba8',
      '--border': '#585b70'
    })
    setCustomThemeDialogOpen(false)
  }

  const colorVars = [
    { key: '--bg-primary', label: 'Background Primary' },
    { key: '--bg-secondary', label: 'Background Secondary' },
    { key: '--bg-surface', label: 'Background Surface' },
    { key: '--text-primary', label: 'Text Primary' },
    { key: '--text-secondary', label: 'Text Secondary' },
    { key: '--accent', label: 'Accent Color' },
    { key: '--success', label: 'Success' },
    { key: '--warning', label: 'Warning' },
    { key: '--danger', label: 'Danger' },
    { key: '--border', label: 'Border' }
  ]

  const chatSidebarOpen = useAppStore((s) => s.chatSidebarOpen)

  if (!settingsPanelOpen) return null

  return (
    <SidePanel title="Settings" onClose={() => setSettingsPanelOpen(false)} width={380} right={chatSidebarOpen ? 340 : 0}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs value={settingsPanelView} onChange={(_, v) => setSettingsPanelView(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 30, '& .MuiTab-root': { minHeight: 28, px: 1, fontSize: 11 } }}>
            <Tab label="Appearance" value="appearance" />
            <Tab label="Agent" value="agent" />
            <Tab label="Editor" value="editor" />
            <Tab label="Behavior" value="behavior" />
            <Tab label="Advanced" value="advanced" />
            <Tab label="VCS" value="vcs" />
            <Tab label="Collab" value="collab" />
            <Tab label="Cloud & Sync" value="cloud-sync" />
            <Tab label="Privacy" value="privacy" />
            <Tab label="Plugins" value="plugins" />
            <Tab label="Keys" value="keybindings" />
          </Tabs>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {settingsPanelView === 'appearance' && (
          <>
            <SectionTitle>Theme</SectionTitle>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <FormControl fullWidth size="small" sx={{ flex: 1 }}>
                <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
                  {THEMES.map((t) => <MenuItem key={t.name} value={t.name}>{t.label}</MenuItem>)}
                  {customThemes.map((t) => <MenuItem key={t.name} value={t.name}>{t.label} (custom)</MenuItem>)}
                </Select>
              </FormControl>
              <Button size="small" variant="outlined" onClick={() => { setEditingThemeId(null); setCustomThemeName(''); setCustomThemeColors({ '--bg-primary': '#1e1e2e', '--bg-secondary': '#181825', '--bg-surface': '#313244', '--bg-elevated': '#45475a', '--text-primary': '#cdd6f4', '--text-secondary': '#a6adc8', '--text-muted': '#6c7086', '--accent': '#89b4fa', '--accent-hover': '#74c7ec', '--success': '#a6e3a1', '--warning': '#f9e2af', '--danger': '#f38ba8', '--border': '#585b70' }); setCustomThemeDialogOpen(true) }} startIcon={<AddIcon sx={{ fontSize: 16 }} />} sx={{ whiteSpace: 'nowrap' }}>Create</Button>
            </Box>

            {customThemes.length > 0 && (
              <Box sx={{ mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Custom Themes</Typography>
                <Stack spacing={0.5}>
                  {customThemes.map((t) => (
                    <Box key={t.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 0.5, bgcolor: 'background.paper', borderRadius: 0.5 }}>
                      <Typography variant="caption">{t.label}</Typography>
                      <Box sx={{ display: 'flex', gap: 0.25 }}>
                        <IconButton size="small" onClick={() => handleEditTheme(t.name)} sx={{ fontSize: 12 }}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
                        <IconButton size="small" onClick={() => handleDeleteTheme(t.name)} sx={{ fontSize: 12 }}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

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
            <SectionTitle>Tab & Indentation</SectionTitle>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Tab Size: {tabSize} spaces</Typography>
              <Slider value={tabSize} onChange={(_, v) => setTabSize(v as number)} min={1} max={8} step={1} valueLabelDisplay="auto" size="small" />
            </Box>
            <FormControlLabel control={<Switch checked={useTabsForIndentation} onChange={(e) => setUseTabsForIndentation(e.target.checked)} />} label={<Typography variant="caption">Use tabs for indentation</Typography>} sx={{ mb: 2 }} />

            <SectionTitle>Word Wrap</SectionTitle>
            <FormControlLabel control={<Switch checked={wordWrap} onChange={(e) => setWordWrap(e.target.checked)} />} label={<Typography variant="caption">Enable word wrap</Typography>} sx={{ mb: 2 }} />

            <SectionTitle>Backup Frequency</SectionTitle>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Every {backupFrequency} minutes</Typography>
              <Slider value={backupFrequency} onChange={(_, v) => setBackupFrequency(v as number)} min={5} max={240} step={5} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v} min`} size="small" />
            </Box>

            <Divider sx={{ my: 2 }} />

            <SectionTitle>Auto-Save Interval</SectionTitle>
            <FormControl fullWidth size="small"><Select value={autoSaveIntervalMs} onChange={(e) => setAutoSaveInterval(Number(e.target.value))}>{AUTO_SAVE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value} sx={{ fontSize: 11 }}>{o.label}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Spell Check Language</SectionTitle>
            <FormControl fullWidth size="small"><Select value={spellCheckLang} onChange={(e) => setSpellCheckLang(e.target.value)}>{SPELL_CHECK_LANGUAGES.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Default Font Family</SectionTitle>
            <FormControl fullWidth size="small"><Select value={defaultFontFamily} onChange={(e) => setDefaultFontFamily(e.target.value)}><MenuItem value="" sx={{ fontSize: 11 }}>(inherit)</MenuItem>{['Arial', 'Calibri', 'Cambria', 'Consolas', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana'].map((f) => <MenuItem key={f} value={f} sx={{ fontSize: 11 }}>{f}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Default Font Size</SectionTitle>
            <FormControl fullWidth size="small"><Select value={defaultFontSize} onChange={(e) => setDefaultFontSize(e.target.value)}>{['12px', '14px', '16px', '18px', '20px', '24px'].map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 11 }}>{s}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Line Spacing</SectionTitle>
            <FormControl fullWidth size="small"><Select value={lineSpacing} onChange={(e) => setLineSpacing(e.target.value)}>{LINE_SPACINGS.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

            <FormControlLabel control={<Switch checked={showWordCount} onChange={(e) => setShowWordCount(e.target.checked)} />} label={<Typography variant="caption">Show word/char count</Typography>} />

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Autocorrect</Typography>
            <FormControlLabel control={<Switch checked={autocorrectEnabled} onChange={(e) => setAutocorrectEnabled(e.target.checked)} />} label={<Typography variant="caption">Autocorrect typos</Typography>} />
            <FormControlLabel control={<Switch checked={smartQuotesEnabled} onChange={(e) => setSmartQuotesEnabled(e.target.checked)} />} label={<Typography variant="caption">Smart quotes ("…" → \u201C\u201D)</Typography>} />
            <FormControlLabel control={<Switch checked={emDashEnabled} onChange={(e) => setEmDashEnabled(e.target.checked)} />} label={<Typography variant="caption">Em-dash (-- → \u2014)</Typography>} />

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>AI Inline Suggestions</Typography>
            <FormControlLabel control={<Switch checked={inlineSuggestionsEnabled} onChange={(e) => setInlineSuggestionsEnabled(e.target.checked)} />} label={<Typography variant="caption">Enable inline smart suggestions</Typography>} />
            
            {inlineSuggestionsEnabled && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, mt: 1, display: 'block' }}>Trigger after {inlineSuggestionTriggerWordCount} words</Typography>
                <Slider
                  size="small"
                  min={1}
                  max={10}
                  step={1}
                  value={inlineSuggestionTriggerWordCount}
                  onChange={(_, v) => setInlineSuggestionTriggerWordCount(Array.isArray(v) ? v[0] : v)}
                  valueLabelDisplay="auto"
                  sx={{ my: 0.5 }}
                />
                
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, mt: 1, display: 'block' }}>Context length: {inlineSuggestionContextLength} chars</Typography>
                <Slider
                  size="small"
                  min={50}
                  max={300}
                  step={10}
                  value={inlineSuggestionContextLength}
                  onChange={(_, v) => setInlineSuggestionContextLength(Array.isArray(v) ? v[0] : v)}
                  valueLabelDisplay="auto"
                  sx={{ my: 0.5 }}
                />

                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, mt: 1, display: 'block' }}>Response debounce: {inlineSuggestionDebounceMs}ms</Typography>
                <Slider
                  size="small"
                  min={300}
                  max={3000}
                  step={100}
                  value={inlineSuggestionDebounceMs}
                  onChange={(_, v) => setInlineSuggestionDebounceMs(Array.isArray(v) ? v[0] : v)}
                  valueLabelDisplay="auto"
                  sx={{ my: 0.5 }}
                />
              </>
            )}

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Header &amp; Footer</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Use {`{n}`} for page number, {`{N}`} for total pages, {`{date}`} for today</Typography>
            <TextField label="Header Left" size="small" fullWidth value={pageHeaderFooter.headerLeft} onChange={(e) => setPageHeaderFooter({ headerLeft: e.target.value })} sx={{ mb: 0.5 }} />
            <TextField label="Header Center" size="small" fullWidth value={pageHeaderFooter.headerCenter} onChange={(e) => setPageHeaderFooter({ headerCenter: e.target.value })} sx={{ mb: 0.5 }} />
            <TextField label="Footer Center" size="small" fullWidth value={pageHeaderFooter.footerCenter} onChange={(e) => setPageHeaderFooter({ footerCenter: e.target.value })} placeholder="Page {n} of {N}" sx={{ mb: 0.5 }} />
            <FormControlLabel control={<Switch checked={pageHeaderFooter.showPageNumbers} onChange={(e) => setPageHeaderFooter({ showPageNumbers: e.target.checked })} />} label={<Typography variant="caption">Show page numbers</Typography>} />
            <FormControlLabel control={<Switch checked={pageHeaderFooter.showTitle} onChange={(e) => setPageHeaderFooter({ showTitle: e.target.checked })} />} label={<Typography variant="caption">Show title in header</Typography>} />
          </>
        )}

        {settingsPanelView === 'behavior' && (
          <>
            <SectionTitle>Auto-Save</SectionTitle>
            <FormControlLabel control={<Switch checked={autoSaveOnFocusLoss} onChange={(e) => setAutoSaveOnFocusLoss(e.target.checked)} />} label={<Typography variant="caption">Auto-save on focus loss</Typography>} sx={{ mb: 1.5 }} />

            <SectionTitle>Formatting</SectionTitle>
            <FormControlLabel control={<Switch checked={autoFormatOnPaste} onChange={(e) => setAutoFormatOnPaste(e.target.checked)} />} label={<Typography variant="caption">Auto-format on paste</Typography>} sx={{ mb: 1.5 }} />

            <SectionTitle>Scrolling</SectionTitle>
            <FormControlLabel control={<Switch checked={scrollPastEnd} onChange={(e) => setScrollPastEnd(e.target.checked)} />} label={<Typography variant="caption">Scroll past end of document</Typography>} sx={{ mb: 1.5 }} />

            <SectionTitle>Document Handling</SectionTitle>
            <FormControlLabel control={<Switch checked={rememberLastDocument} onChange={(e) => setRememberLastDocument(e.target.checked)} />} label={<Typography variant="caption">Remember last document</Typography>} sx={{ mb: 1 }} />
            <FormControlLabel control={<Switch checked={sessionRestoration} onChange={(e) => setSessionRestoration(e.target.checked)} />} label={<Typography variant="caption">Restore session on startup</Typography>} sx={{ mb: 1.5 }} />

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Autocorrect Level</SectionTitle>
            <FormControl fullWidth size="small">
              <Select value={autocorrectAggressiveLevel} onChange={(e) => setAutocorrectAggressiveLevel(e.target.value as any)}>
                <MenuItem value="off" sx={{ fontSize: 11 }}>Off</MenuItem>
                <MenuItem value="conservative" sx={{ fontSize: 11 }}>Conservative (only obvious mistakes)</MenuItem>
                <MenuItem value="aggressive" sx={{ fontSize: 11 }}>Aggressive (suggest alternatives)</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Higher levels apply more corrections automatically</Typography>
          </>
        )}

        {settingsPanelView === 'advanced' && (
          <>
            <SectionTitle>Performance Tuning</SectionTitle>
            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <Select value={performanceTuning} onChange={(e) => setPerformanceTuning(e.target.value as any)}>
                <MenuItem value="low-power" sx={{ fontSize: 11 }}>Low Power (minimal resources)</MenuItem>
                <MenuItem value="balanced" sx={{ fontSize: 11 }}>Balanced (default)</MenuItem>
                <MenuItem value="high-performance" sx={{ fontSize: 11 }}>High Performance (uses more memory)</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Choose based on your system resources and preferences</Typography>

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Cache Size</SectionTitle>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Memory: {cacheSize} MB</Typography>
              <Slider value={cacheSize} onChange={(_, v) => setCacheSize(v as number)} min={50} max={1000} step={50} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v} MB`} size="small" />
            </Box>

            <SectionTitle>Update Frequency</SectionTitle>
            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <Select value={updateFrequency} onChange={(e) => setUpdateFrequency(e.target.value as any)}>
                <MenuItem value="never" sx={{ fontSize: 11 }}>Never</MenuItem>
                <MenuItem value="daily" sx={{ fontSize: 11 }}>Daily</MenuItem>
                <MenuItem value="weekly" sx={{ fontSize: 11 }}>Weekly (default)</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>How often to check for application updates</Typography>

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Backup Management</SectionTitle>
            <FormControlLabel control={<Switch checked={enableBackupExport} onChange={(e) => setEnableBackupExport(e.target.checked)} />} label={<Typography variant="caption">Enable automatic backup export</Typography>} sx={{ mb: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Automatically export backups of your documents for safekeeping</Typography>
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

            <SectionTitle>Server Port</SectionTitle>
            <TextField fullWidth type="number" value={collabMcpPort || ''} onChange={(e) => setCollabMcpPort(Number(e.target.value))} placeholder="ws://localhost:PORT (default: 0 / off)" />
          </>
        )}

        {settingsPanelView === 'cloud-sync' && (
          <>
            <SectionTitle>Connected Providers & Status</SectionTitle>
            {providerStatuses.length > 0 ? (
              <Stack spacing={0.75} sx={{ mb: 2 }}>
                {providerStatuses.map((status) => (
                  <Box key={status.provider} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', p: 1, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" fontWeight={600}>{status.displayName}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: status.syncStatus === 'syncing' ? 'warning.main' : status.syncStatus === 'error' ? 'error.main' : 'success.main'
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                          {status.syncStatus === 'syncing' ? '⟳ Syncing...' : status.syncStatus === 'error' ? '✗ Error' : '✓ Connected'}
                        </Typography>
                      </Stack>
                      {status.lastSyncTime && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 8, display: 'block', mt: 0.25 }}>
                          Last sync: {new Date(status.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, flexDirection: 'column' }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={async () => {
                          try {
                            const result = await window.wordapp?.cloud.syncNow(status.provider)
                            if (result?.success) {
                              addToast('success', `Sync started for ${status.displayName}`)
                            } else {
                              addToast('error', `Sync failed: ${result?.error || 'Unknown error'}`)
                            }
                          } catch (err) {
                            addToast('error', `Sync error: ${(err as Error).message}`)
                          }
                        }}
                        sx={{ fontSize: 10, p: 0.5 }}
                      >
                        Sync
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="error"
                        onClick={async () => {
                          try {
                            const result = await window.wordapp?.cloud.disconnect(status.provider)
                            if (result?.success) {
                              addToast('success', `Disconnected from ${status.displayName}`)
                            } else {
                              addToast('error', `Disconnect failed: ${result?.error || 'Unknown error'}`)
                            }
                          } catch (err) {
                            addToast('error', `Disconnect error: ${(err as Error).message}`)
                          }
                        }}
                        sx={{ fontSize: 10, p: 0.5 }}
                      >
                        Disconnect
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block', fontStyle: 'italic' }}>No providers connected. Connect one below to start syncing.</Typography>
            )}

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Cloud Provider Authentication</SectionTitle>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Connect to your cloud storage provider to enable syncing</Typography>
            <Stack spacing={1} sx={{ mb: 2 }}>
              {[
                { name: 'Google Drive', id: 'google-drive' },
                { name: 'Dropbox', id: 'dropbox' },
                { name: 'OneDrive', id: 'onedrive' },
                { name: 'Custom WebDAV', id: 'webdav' }
              ].map((provider) => {
                const isAuth = providerStatuses.some((s) => s.provider === provider.id && s.isAuthenticated)
                return (
                  <Button
                    key={provider.id}
                    fullWidth
                    variant={isAuth ? 'contained' : 'outlined'}
                    size="small"
                    disabled={isAuthenticating !== null}
                    onClick={async () => {
                      if (isAuth) return
                      setIsAuthenticating(provider.id)
                      try {
                        const result = await window.wordapp?.cloud.authStart(provider.id)
                        if (result?.success) {
                          addToast('success', `${provider.name} authenticated successfully`)
                        } else {
                          addToast('error', `Authentication failed: ${result?.error || 'Unknown error'}`)
                        }
                      } catch (err) {
                        addToast('error', `Auth error: ${(err as Error).message}`)
                      } finally {
                        setIsAuthenticating(null)
                      }
                    }}
                    sx={{ justifyContent: 'flex-start', textAlign: 'left', position: 'relative' }}
                  >
                    {isAuthenticating === provider.id ? (
                      <>
                        <Box sx={{ display: 'inline-block', width: 12, height: 12, border: '2px solid', borderColor: 'divider', borderRightColor: 'primary.main', borderRadius: '50%', animation: 'spin 1s linear infinite', mr: 0.5 }} />
                        Authenticating...
                      </>
                    ) : isAuth ? (
                      `✓ ${provider.name}`
                    ) : (
                      `${provider.name}`
                    )}
                  </Button>
                )
              })}
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Auto-Sync Settings</SectionTitle>
            <FormControlLabel
              control={<Switch checked={autoSyncEnabled} onChange={(e) => setAutoSyncEnabled(e.target.checked)} />}
              label={<Typography variant="caption">Enable automatic sync</Typography>}
              sx={{ mb: 1 }}
            />

            {autoSyncEnabled && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Sync interval: {syncInterval} seconds</Typography>
                <Slider
                  value={syncInterval}
                  onChange={(_, v) => setSyncInterval(v as number)}
                  min={60}
                  max={3600}
                  step={60}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${v}s`}
                  size="small"
                  sx={{ mb: 2 }}
                />
              </>
            )}

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Selective Folder Sync</SectionTitle>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Choose which folders to sync (leave empty to sync all)</Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Enter folder paths separated by commas"
              value={selectiveSyncFolders.join(', ')}
              onChange={(e) => setSelectiveSyncFolders(e.target.value.split(',').map((f) => f.trim()).filter((f) => f))}
              multiline
              rows={2}
              sx={{ mb: 2 }}
            />
            {selectiveSyncFolders.length > 0 && (
              <Box sx={{ mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>Selected Folders:</Typography>
                <Stack spacing={0.25}>
                  {selectiveSyncFolders.map((folder, idx) => (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                      <Typography variant="caption">{folder}</Typography>
                      <IconButton
                        size="small"
                        onClick={() => setSelectiveSyncFolders(selectiveSyncFolders.filter((_, i) => i !== idx))}
                        sx={{ fontSize: 12 }}
                      >
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Conflict Resolution Strategy</SectionTitle>
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <Select defaultValue="last-write-wins" onChange={(e) => {
                addToast('info', `Conflict resolution set to: ${e.target.value}`)
                // TODO: Store and apply conflict resolution strategy
              }}>
                <MenuItem value="last-write-wins" sx={{ fontSize: 11 }}>Last Write Wins (remote overwrites local)</MenuItem>
                <MenuItem value="keep-local" sx={{ fontSize: 11 }}>Keep Local (preserve local version)</MenuItem>
                <MenuItem value="manual" sx={{ fontSize: 11 }}>Manual (prompt for each conflict)</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>Choose how to handle sync conflicts</Typography>

            <Divider sx={{ my: 1.5 }} />

            <SectionTitle>Automatic Backups</SectionTitle>
            <FormControlLabel
              control={<Switch checked={autoBackupEnabled} onChange={(e) => setAutoBackupEnabled(e.target.checked)} />}
              label={<Typography variant="caption">Enable automatic backups</Typography>}
              sx={{ mb: 1 }}
            />

            {autoBackupEnabled && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Maximum backup versions: {maxBackupVersions}</Typography>
                <Slider
                  value={maxBackupVersions}
                  onChange={(_, v) => setMaxBackupVersions(v as number)}
                  min={1}
                  max={100}
                  step={1}
                  valueLabelDisplay="auto"
                  size="small"
                  sx={{ mb: 1.5 }}
                />

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Retention period: {backupRetentionDays} days</Typography>
                <Slider
                  value={backupRetentionDays}
                  onChange={(_, v) => setBackupRetentionDays(v as number)}
                  min={1}
                  max={365}
                  step={1}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${v} days`}
                  size="small"
                  sx={{ mb: 2 }}
                />
              </>
            )}
          </>
        )}

        {settingsPanelView === 'privacy' && (
          <>
            <SectionTitle>Privacy Mode</SectionTitle>
            <FormControlLabel
              control={<Switch checked={privacyMode} onChange={(e) => setPrivacyMode(e.target.checked)} />}
              label="Enable Privacy Mode (disables analytics, crash reports, telemetry)"
            />

            <SectionTitle>DNS over HTTPS</SectionTitle>
            <FormControlLabel
              control={<Switch checked={dnsOverHttps} onChange={(e) => setDnsOverHttps(e.target.checked)} />}
              label="Enable DNS over HTTPS (prevents ISP snooping)"
            />

            <SectionTitle>Data Residency</SectionTitle>
            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <Select value={dataResidency} onChange={(e) => setDataResidency(e.target.value as any)}>
                <MenuItem value="us">United States (Default)</MenuItem>
                <MenuItem value="eu">European Union (GDPR-Compliant)</MenuItem>
                <MenuItem value="local">Local Only (No Cloud)</MenuItem>
                <MenuItem value="canada">Canada</MenuItem>
                <MenuItem value="australia">Australia</MenuItem>
              </Select>
            </FormControl>

            <SectionTitle>Analytics & Telemetry</SectionTitle>
            <FormControlLabel
              control={<Switch checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)} />}
              label="Enable analytics (helps us improve the app)"
            />

            <SectionTitle>GDPR Compliance</SectionTitle>
            <FormControlLabel
              control={<Switch checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} />}
              label="I consent to GDPR-compliant data processing"
            />
            <Typography variant="caption" sx={{ display: 'block', mt: 1, mb: 1.5, color: 'text.secondary' }}>
              By enabling GDPR mode, you agree to our privacy policy. Your data will be processed according to GDPR regulations with explicit consent management.
            </Typography>

            <Divider sx={{ my: 2 }} />

            <SectionTitle>Data Management</SectionTitle>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  const data = {
                    exportDate: new Date().toISOString(),
                    privacySettings: { privacyMode, dnsOverHttps, dataResidency, gdprConsent },
                  }
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `privacy-data-${Date.now()}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                  addToast('success', 'Data exported successfully')
                }}
              >
                Export Data
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={() => {
                  if (window.confirm('This will delete all your personal data. Are you sure?')) {
                    localStorage.clear()
                    addToast('success', 'All data deleted')
                  }
                }}
              >
                Delete All Data
              </Button>
            </Stack>
          </>
        )}

        {settingsPanelView === 'plugins' && (
          <PluginSettingsTab />
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

      <Dialog open={customThemeDialogOpen} onClose={() => resetThemeDialog()} maxWidth="sm" fullWidth>
        <DialogTitle>{editingThemeId ? 'Edit Custom Theme' : 'Create Custom Theme'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 2 }}>
          <TextField label="Theme Name" fullWidth size="small" value={customThemeName} onChange={(e) => setCustomThemeName(e.target.value)} placeholder="My Dark Theme" />
          
          {/* Live Preview */}
          <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: customThemeColors['--bg-primary'] }}>
            <Typography variant="caption" fontWeight={600} sx={{ color: customThemeColors['--text-secondary'], mb: 0.5, display: 'block' }}>Preview</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--bg-secondary'] }}><Typography variant="caption" sx={{ color: customThemeColors['--text-primary'] }}>Secondary BG</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--accent'], color: 'white' }}><Typography variant="caption">Accent</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--success'], color: 'white' }}><Typography variant="caption">Success</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--warning'], color: 'white' }}><Typography variant="caption">Warning</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--danger'], color: 'white' }}><Typography variant="caption">Danger</Typography></Box>
            </Box>
            <Typography variant="caption" sx={{ color: customThemeColors['--text-secondary'] }}>This is how your text will look in this theme</Typography>
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>Colors</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 40px', gap: 1, maxHeight: 300, overflow: 'auto' }}>
              {colorVars.map((v) => (
                <Box key={v.key} sx={{ display: 'contents' }}>
                  <Typography variant="caption" sx={{ alignSelf: 'center', fontSize: 11 }}>{v.label}</Typography>
                  <input
                    type="color"
                    value={customThemeColors[v.key] || '#000000'}
                    onChange={(e) => setCustomThemeColors({ ...customThemeColors, [v.key]: e.target.value })}
                    style={{ width: 40, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => resetThemeDialog()}>Cancel</Button>
          {editingThemeId && (
            <Button onClick={() => { handleDeleteTheme(editingThemeId); resetThemeDialog() }} color="error">
              Delete
            </Button>
          )}
          <Button onClick={handleCreateCustomTheme} variant="contained">
            {editingThemeId ? 'Update Theme' : 'Create Theme'}
          </Button>
        </DialogActions>
      </Dialog>
    </SidePanel>
  )
}

// ─── v0.3.6: Plugin Settings Tab ───

function PluginSettingsTab() {
  const { pluginList, pluginMarketplace, setPluginList, setPluginMarketplace, addToast } = useAppStore()

  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await window.wordapp?.plugin.list()
      if (list) setPluginList(list as PluginManifest[])
      const market = await window.wordapp?.plugin.marketplace()
      if (market) setPluginMarketplace(market as PluginMarketplaceEntry[])
    } catch (err) {
      addToast('error', `Failed to load plugins: ${(err as Error).message}`)
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const handleInstall = async (entry: PluginMarketplaceEntry) => {
    const code = await window.wordapp?.plugin.builtinCode(entry.name)
    const manifest = { ...entry, installed: false, enabled: true }
    const result = await window.wordapp?.plugin.install(manifest, code || '')
    if (result) { addToast('success', `Plugin "${entry.name}" installed`); refresh() }
  }

  const handleUninstall = async (name: string) => {
    const result = await window.wordapp?.plugin.uninstall(name)
    if (result) { addToast('success', `Plugin "${name}" uninstalled`); refresh() }
  }

  const handleEnable = async (name: string) => {
    const result = await window.wordapp?.plugin.enable(name)
    if (result) { addToast('success', `Plugin "${name}" enabled`); refresh() }
  }

  const handleDisable = async (name: string) => {
    const result = await window.wordapp?.plugin.disable(name)
    if (result) { addToast('success', `Plugin "${name}" disabled`); refresh() }
  }

  const installedNames = new Set(pluginList.map((p) => p.name))

  return (
    <>
      <SectionTitle>Installed Plugins</SectionTitle>
      {pluginList.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ py: 1, display: 'block' }}>No plugins installed.</Typography>}
      <List dense sx={{ mb: 2 }}>
        {pluginList.map((p) => (
          <ListItem key={p.name} secondaryAction={<Box sx={{ display: 'flex', gap: 0.25 }}>
            <Switch size="small" checked={p.enabled} onChange={() => p.enabled ? handleDisable(p.name) : handleEnable(p.name)} />
            <IconButton size="small" color="error" onClick={() => handleUninstall(p.name)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
          </Box>}>
            <ListItemText
              primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontWeight={600}>{p.name}</Typography>
                <Chip label={`v${p.version}`} size="small" variant="outlined" sx={{ fontSize: 8, height: 14 }} />
                {p.lastError && <Chip label="ERROR" size="small" color="error" sx={{ fontSize: 7, height: 12 }} />}
              </Box>}
              secondary={p.description}
              primaryTypographyProps={{ fontSize: 11 }}
              secondaryTypographyProps={{ fontSize: 10 }}
            />
          </ListItem>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />

      <SectionTitle>Plugin Marketplace</SectionTitle>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Built-in plugins available for installation</Typography>
      <List dense>
        {pluginMarketplace.map((p) => (
          <ListItem key={p.name} secondaryAction={
            installedNames.has(p.name) ? (
              <Chip label="Installed" size="small" color="success" variant="outlined" sx={{ fontSize: 9, height: 20 }} />
            ) : (
              <Button size="small" variant="outlined" onClick={() => handleInstall(p)} sx={{ fontSize: 10 }}>Install</Button>
            )
          }>
            <ListItemText
              primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontWeight={600}>{p.name}</Typography>
                <Chip label={`v${p.version}`} size="small" variant="outlined" sx={{ fontSize: 8, height: 14 }} />
                <Chip label={p.author} size="small" sx={{ fontSize: 8, height: 14 }} />
              </Box>}
              secondary={p.description}
              primaryTypographyProps={{ fontSize: 11 }}
              secondaryTypographyProps={{ fontSize: 10 }}
            />
          </ListItem>
        ))}
      </List>
    </>
  )
}
