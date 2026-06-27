import React, { useState, useEffect, type FC } from 'react'
import { Box, Typography, IconButton, Tabs, Tab, Table, TableBody, TableRow, TableCell, Chip, Stack, List, ListItem, ListItemText, Divider, Button, TextField, FormControl, Select, MenuItem, Slider, Switch, FormControlLabel, Avatar } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { StandaloneThemeProvider } from './StandaloneThemeProvider'
import { THEMES, ACCENT_SWATCHES, EDITOR_FONTS, SPELL_CHECK_LANGUAGES, LINE_SPACINGS, AUTO_SAVE_OPTIONS } from './themes'

interface PopupAppProps {
  mode: 'settings' | 'help'
}

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

// ─── Self-contained Settings (no Zustand dependency) ───

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
  { key: '--border', label: 'Border' },
]

function loadSetting<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}

function saveSetting(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

const SettingsContent: FC = () => {
  const [tab, setTab] = useState('appearance')
  const [theme, setTheme] = useState(() => loadSetting('theme', THEMES[0].name))
  const [accentColor, setAccentColor] = useState(() => loadSetting('accentColor', ACCENT_SWATCHES[0].color))
  const [uiFontSize, setUiFontSize] = useState(() => loadSetting('uiFontSize', 14))
  const [editorFont, setEditorFont] = useState(() => loadSetting('editorFont', EDITOR_FONTS[0]))
  const [tabSize, setTabSize] = useState(() => loadSetting('tabSize', 2))
  const [wordWrap, setWordWrap] = useState(() => loadSetting('wordWrap', true))
  const [spellCheckLang, setSpellCheckLang] = useState(() => loadSetting('spellCheckLang', 'en-US'))
  const [defaultFontFamily, setDefaultFontFamily] = useState(() => loadSetting('defaultFontFamily', ''))
  const [defaultFontSize, setDefaultFontSize] = useState(() => loadSetting('defaultFontSize', '16px'))
  const [lineSpacing, setLineSpacing] = useState(() => loadSetting('lineSpacing', '1.5'))
  const [autoSaveIntervalMs, setAutoSaveIntervalMs] = useState(() => loadSetting('autoSaveIntervalMs', 30000))
  const [privacyMode, setPrivacyMode] = useState(() => loadSetting('privacyMode', false))
  const [dnsOverHttps, setDnsOverHttps] = useState(() => loadSetting('dnsOverHttps', false))
  const [dataResidency, setDataResidency] = useState(() => loadSetting('dataResidency', 'us'))
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => loadSetting('analyticsEnabled', true))
  const [gdprConsent, setGdprConsent] = useState(() => loadSetting('gdprConsent', false))
  const [customThemes, setCustomThemes] = useState<{ name: string; label: string; vars: Record<string, string> }[]>(() => loadSetting('customThemes', []))
  const [customThemeDialogOpen, setCustomThemeDialogOpen] = useState(false)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const [customThemeName, setCustomThemeName] = useState('')
  const [customThemeColors, setCustomThemeColors] = useState<Record<string, string>>({
    '--bg-primary': '#1e1e2e', '--bg-secondary': '#181825', '--bg-surface': '#313244', '--bg-elevated': '#45475a',
    '--text-primary': '#cdd6f4', '--text-secondary': '#a6adc8', '--text-muted': '#6c7086',
    '--accent': '#89b4fa', '--accent-hover': '#74c7ec', '--success': '#a6e3a1', '--warning': '#f9e2af', '--danger': '#f38ba8', '--border': '#585b70'
  })

  // Apply theme CSS variables
  useEffect(() => {
    const themeDef = THEMES.find((t) => t.name === theme)
    if (themeDef) { for (const [key, value] of Object.entries(themeDef.vars)) document.documentElement.style.setProperty(key, value) }
    if (accentColor) document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('font-size', `${uiFontSize}px`)
  }, [theme, accentColor, uiFontSize])

  // Persist on change
  useEffect(() => { saveSetting('theme', theme) }, [theme])
  useEffect(() => { saveSetting('accentColor', accentColor) }, [accentColor])
  useEffect(() => { saveSetting('uiFontSize', uiFontSize) }, [uiFontSize])
  useEffect(() => { saveSetting('editorFont', editorFont) }, [editorFont])
  useEffect(() => { saveSetting('tabSize', tabSize) }, [tabSize])
  useEffect(() => { saveSetting('wordWrap', wordWrap) }, [wordWrap])
  useEffect(() => { saveSetting('spellCheckLang', spellCheckLang) }, [spellCheckLang])
  useEffect(() => { saveSetting('defaultFontFamily', defaultFontFamily) }, [defaultFontFamily])
  useEffect(() => { saveSetting('defaultFontSize', defaultFontSize) }, [defaultFontSize])
  useEffect(() => { saveSetting('lineSpacing', lineSpacing) }, [lineSpacing])
  useEffect(() => { saveSetting('autoSaveIntervalMs', autoSaveIntervalMs) }, [autoSaveIntervalMs])
  useEffect(() => { saveSetting('privacyMode', privacyMode) }, [privacyMode])
  useEffect(() => { saveSetting('dnsOverHttps', dnsOverHttps) }, [dnsOverHttps])
  useEffect(() => { saveSetting('dataResidency', dataResidency) }, [dataResidency])
  useEffect(() => { saveSetting('analyticsEnabled', analyticsEnabled) }, [analyticsEnabled])
  useEffect(() => { saveSetting('gdprConsent', gdprConsent) }, [gdprConsent])
  useEffect(() => { saveSetting('customThemes', customThemes) }, [customThemes])

  const handleCreateCustomTheme = () => {
    if (!customThemeName.trim()) return
    if (editingThemeId) {
      const updated = customThemes.map(t => t.name === editingThemeId ? { ...t, label: customThemeName, vars: customThemeColors } : t)
      setCustomThemes(updated)
    } else {
      const newTheme = { name: `custom-${Date.now()}`, label: customThemeName, vars: customThemeColors }
      setCustomThemes([...customThemes, newTheme])
      setTheme(newTheme.name)
    }
    setCustomThemeDialogOpen(false)
    setEditingThemeId(null)
    setCustomThemeName('')
  }

  const handleEditTheme = (themeName: string) => {
    const t = customThemes.find(x => x.name === themeName)
    if (t) { setEditingThemeId(themeName); setCustomThemeName(t.label); setCustomThemeColors(t.vars); setCustomThemeDialogOpen(true) }
  }

  const handleDeleteTheme = (themeName: string) => {
    const updated = customThemes.filter(t => t.name !== themeName)
    setCustomThemes(updated)
    if (theme === themeName) setTheme(THEMES[0].name)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, bgcolor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', WebkitAppRegion: 'drag' as any }}>
        <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>Settings</Typography>
        <IconButton size="small" onClick={() => window.close()} sx={{ WebkitAppRegion: 'no-drag' as any }}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
      </Box>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 30, '& .MuiTab-root': { minHeight: 28, px: 1, fontSize: 11 } }}>
          <Tab label="Appearance" value="appearance" />
          <Tab label="Editor" value="editor" />
          <Tab label="Privacy" value="privacy" />
          <Tab label="Keys" value="keybindings" />
        </Tabs>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {tab === 'appearance' && (
          <>
            <SectionTitle>Theme</SectionTitle>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <FormControl fullWidth size="small" sx={{ flex: 1 }}>
                <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
                  {THEMES.map(t => <MenuItem key={t.name} value={t.name}>{t.label}</MenuItem>)}
                  {customThemes.map(t => <MenuItem key={t.name} value={t.name}>{t.label} (custom)</MenuItem>)}
                </Select>
              </FormControl>
              <Button size="small" variant="outlined" onClick={() => { setEditingThemeId(null); setCustomThemeName(''); setCustomThemeDialogOpen(true) }} startIcon={<AddIcon sx={{ fontSize: 16 }} />} sx={{ whiteSpace: 'nowrap' }}>Create</Button>
            </Box>

            {customThemes.length > 0 && (
              <Box sx={{ mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Custom Themes</Typography>
                <Stack spacing={0.5}>
                  {customThemes.map(t => (
                    <Box key={t.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 0.5, bgcolor: 'background.paper', borderRadius: 0.5 }}>
                      <Typography variant="caption">{t.label}</Typography>
                      <Box sx={{ display: 'flex', gap: 0.25 }}>
                        <IconButton size="small" onClick={() => handleEditTheme(t.name)}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
                        <IconButton size="small" onClick={() => handleDeleteTheme(t.name)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            <SectionTitle>Accent Color</SectionTitle>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              {ACCENT_SWATCHES.map(s => (
                <Avatar key={s.name} sx={{ width: 24, height: 24, bgcolor: s.color, cursor: 'pointer', border: accentColor === s.color ? 2 : 0, borderColor: 'text.primary' }} onClick={() => setAccentColor(s.color)} variant="rounded" />
              ))}
            </Stack>

            <SectionTitle>UI Font Size</SectionTitle>
            <Slider value={uiFontSize} onChange={(_, v) => setUiFontSize(v as number)} min={12} max={18} step={1} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}px`} size="small" />

            <SectionTitle>Editor Font</SectionTitle>
            <FormControl fullWidth size="small"><Select value={editorFont} onChange={(e) => setEditorFont(e.target.value)}>{EDITOR_FONTS.map(f => <MenuItem key={f} value={f} sx={{ fontSize: 11 }}>{f}</MenuItem>)}</Select></FormControl>

            {/* Custom theme dialog */}
            {customThemeDialogOpen && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>{editingThemeId ? 'Edit Theme' : 'Create Theme'}</Typography>
                <TextField label="Theme Name" fullWidth size="small" value={customThemeName} onChange={(e) => setCustomThemeName(e.target.value)} placeholder="My Dark Theme" sx={{ mb: 1 }} />
                <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: customThemeColors['--bg-primary'], mb: 1 }}>
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
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 40px', gap: 1, maxHeight: 200, overflow: 'auto', mb: 1 }}>
                  {colorVars.map(v => (
                    <Box key={v.key} sx={{ display: 'contents' }}>
                      <Typography variant="caption" sx={{ alignSelf: 'center', fontSize: 11 }}>{v.label}</Typography>
                      <input type="color" value={customThemeColors[v.key] || '#000000'} onChange={(e) => setCustomThemeColors({ ...customThemeColors, [v.key]: e.target.value })} style={{ width: 40, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                    </Box>
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" onClick={() => { setCustomThemeDialogOpen(false); setEditingThemeId(null) }}>Cancel</Button>
                  {editingThemeId && <Button size="small" color="error" onClick={() => { handleDeleteTheme(editingThemeId); setCustomThemeDialogOpen(false); setEditingThemeId(null) }}>Delete</Button>}
                  <Button size="small" variant="contained" onClick={handleCreateCustomTheme}>{editingThemeId ? 'Update' : 'Create'}</Button>
                </Box>
              </Box>
            )}
          </>
        )}

        {tab === 'editor' && (
          <>
            <SectionTitle>Tab Size</SectionTitle>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>{tabSize} spaces</Typography>
              <Slider value={tabSize} onChange={(_, v) => setTabSize(v as number)} min={1} max={8} step={1} valueLabelDisplay="auto" size="small" />
            </Box>
            <FormControlLabel control={<Switch checked={wordWrap} onChange={(e) => setWordWrap(e.target.checked)} />} label={<Typography variant="caption">Word wrap</Typography>} sx={{ mb: 2 }} />

            <SectionTitle>Spell Check Language</SectionTitle>
            <FormControl fullWidth size="small"><Select value={spellCheckLang} onChange={(e) => setSpellCheckLang(e.target.value)}>{SPELL_CHECK_LANGUAGES.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Default Font Family</SectionTitle>
            <FormControl fullWidth size="small"><Select value={defaultFontFamily} onChange={(e) => setDefaultFontFamily(e.target.value)}><MenuItem value="" sx={{ fontSize: 11 }}>(inherit)</MenuItem>{['Arial', 'Calibri', 'Cambria', 'Consolas', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana'].map((f) => <MenuItem key={f} value={f} sx={{ fontSize: 11 }}>{f}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Default Font Size</SectionTitle>
            <FormControl fullWidth size="small"><Select value={defaultFontSize} onChange={(e) => setDefaultFontSize(e.target.value)}>{['12px', '14px', '16px', '18px', '20px', '24px'].map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 11 }}>{s}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Line Spacing</SectionTitle>
            <FormControl fullWidth size="small"><Select value={lineSpacing} onChange={(e) => setLineSpacing(e.target.value)}>{LINE_SPACINGS.map((l) => <MenuItem key={l.value} value={l.value} sx={{ fontSize: 11 }}>{l.label}</MenuItem>)}</Select></FormControl>

            <SectionTitle>Auto-Save Interval</SectionTitle>
            <FormControl fullWidth size="small"><Select value={autoSaveIntervalMs} onChange={(e) => setAutoSaveIntervalMs(Number(e.target.value))}>{AUTO_SAVE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value} sx={{ fontSize: 11 }}>{o.label}</MenuItem>)}</Select></FormControl>
          </>
        )}

        {tab === 'privacy' && (
          <>
            <SectionTitle>Privacy Mode</SectionTitle>
            <FormControlLabel control={<Switch checked={privacyMode} onChange={(e) => setPrivacyMode(e.target.checked)} />} label="Enable Privacy Mode (disables analytics, crash reports, telemetry)" />
            <SectionTitle>DNS over HTTPS</SectionTitle>
            <FormControlLabel control={<Switch checked={dnsOverHttps} onChange={(e) => setDnsOverHttps(e.target.checked)} />} label="Enable DNS over HTTPS (prevents ISP snooping)" />
            <SectionTitle>Data Residency</SectionTitle>
            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <Select value={dataResidency} onChange={(e) => setDataResidency(e.target.value)}>
                <MenuItem value="us">United States (Default)</MenuItem>
                <MenuItem value="eu">European Union (GDPR-Compliant)</MenuItem>
                <MenuItem value="local">Local Only (No Cloud)</MenuItem>
                <MenuItem value="canada">Canada</MenuItem>
                <MenuItem value="australia">Australia</MenuItem>
              </Select>
            </FormControl>
            <SectionTitle>Analytics & Telemetry</SectionTitle>
            <FormControlLabel control={<Switch checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)} />} label="Enable analytics (helps us improve the app)" />
            <SectionTitle>GDPR Compliance</SectionTitle>
            <FormControlLabel control={<Switch checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} />} label="I consent to GDPR-compliant data processing" />
            <Typography variant="caption" sx={{ display: 'block', mt: 1, mb: 1.5, color: 'text.secondary' }}>By enabling GDPR mode, you agree to our privacy policy.</Typography>
            <Divider sx={{ my: 2 }} />
            <SectionTitle>Data Management</SectionTitle>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" onClick={() => {
                const data = { exportDate: new Date().toISOString(), privacySettings: { privacyMode, dnsOverHttps, dataResidency, gdprConsent } }
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `privacy-data-${Date.now()}.json`; a.click()
                URL.revokeObjectURL(url)
              }}>Export Data</Button>
              <Button variant="outlined" color="error" size="small" onClick={() => { if (window.confirm('Delete all personal data?')) { localStorage.clear() } }}>Delete All Data</Button>
            </Stack>
          </>
        )}

        {tab === 'keybindings' && (
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
        )}
      </Box>
    </Box>
  )
}

// ─── Self-contained Help (no Zustand dependency) ───

const HelpContent: FC = () => {
  const [tab, setTab] = useState('tutorials')
  const [searchQuery, setSearchQuery] = useState('')

  const tutorials = [
    { id: 'intro', title: 'Getting Started', duration: '5 min', description: 'Learn the basics of WordApp' },
    { id: 'editing', title: 'Document Editing', duration: '3 min', description: 'Master text editing features' },
    { id: 'collab', title: 'Real-Time Collaboration', duration: '4 min', description: 'Work together with others' },
    { id: 'vcs', title: 'Version Control', duration: '6 min', description: 'Track document history' },
    { id: 'export', title: 'Export & Share', duration: '3 min', description: 'Export to multiple formats' }
  ]

  const faqs = [
    { q: 'How do I save my document?', a: 'Use Ctrl+S or File → Save to save your work.' },
    { q: 'Can I collaborate with others?', a: 'Yes! Open View → Collaboration to invite others or join a session.' },
    { q: 'What formats can I export to?', a: 'WordApp supports PDF, EPUB, LaTeX, RTF, CSV, and more.' },
    { q: 'How do I enable dark mode?', a: 'Go to Settings → Appearance and select your preferred theme.' },
    { q: 'Is there a mobile version?', a: 'Mobile support is planned for a future release.' }
  ]

  const resources = [
    { title: 'User Guide', url: 'https://github.com/ChristopherSims/agentic-word/docs', icon: '📖' },
    { title: 'API Documentation', url: 'https://github.com/ChristopherSims/agentic-word/api-docs', icon: '⚙️' },
    { title: 'Plugin Development', url: 'https://github.com/ChristopherSims/agentic-word/plugin-guide', icon: '🔌' },
    { title: 'Troubleshooting', url: 'https://github.com/ChristopherSims/agentic-word/troubleshooting', icon: '🆘' },
    { title: 'GitHub Issues', url: 'https://github.com/ChristopherSims/agentic-word/issues', icon: '🐛' }
  ]

  const filteredTutorials = tutorials.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase()))
  const filteredFaqs = faqs.filter(f => f.q.toLowerCase().includes(searchQuery.toLowerCase()) || f.a.toLowerCase().includes(searchQuery.toLowerCase()))
  const filteredResources = resources.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, bgcolor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', WebkitAppRegion: 'drag' as any }}>
        <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>Help & Documentation</Typography>
        <IconButton size="small" onClick={() => window.close()} sx={{ WebkitAppRegion: 'no-drag' as any }}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
      </Box>
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1, pl: 1 }}>
          <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <TextField size="small" variant="standard" placeholder="Search help..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} slotProps={{ input: { disableUnderline: true } }} sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 12 } }} />
        </Box>
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tab label="Tutorials" value="tutorials" sx={{ fontSize: 12, textTransform: 'none' }} />
        <Tab label="FAQ" value="faq" sx={{ fontSize: 12, textTransform: 'none' }} />
        <Tab label="Resources" value="resources" sx={{ fontSize: 12, textTransform: 'none' }} />
      </Tabs>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {tab === 'tutorials' && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>Video Tutorials</Typography>
            <List dense sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filteredTutorials.map((tut) => (
                <ListItem key={tut.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1, border: 1, borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.selected' } }}>
                  <PlayArrowIcon sx={{ fontSize: 16, mr: 1, color: 'primary.main' }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ fontSize: 11, display: 'block', fontWeight: 600 }}>{tut.title}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>{tut.description}</Typography>
                  </Box>
                  <Chip label={tut.duration} size="small" variant="outlined" sx={{ fontSize: 8, height: 18 }} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
        {tab === 'faq' && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>Frequently Asked Questions</Typography>
            <Stack spacing={1.5}>
              {filteredFaqs.map((faq, idx) => (
                <Box key={idx} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontSize: 11, display: 'block', mb: 0.5, fontWeight: 600 }}>{faq.q}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', lineHeight: 1.4 }}>{faq.a}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
        {tab === 'resources' && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>External Resources</Typography>
            <List dense sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {filteredResources.map((res, idx) => (
                <ListItem key={idx} component="a" href={res.url} target="_blank" rel="noopener noreferrer" sx={{ p: 0.75, bgcolor: 'action.hover', borderRadius: 1, border: 1, borderColor: 'divider', textDecoration: 'none', color: 'inherit', '&:hover': { bgcolor: 'action.selected', borderColor: 'primary.main' } }}>
                  <Typography variant="caption" sx={{ fontSize: 10 }}>{res.icon} {res.title}</Typography>
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export const PopupApp: FC<PopupAppProps> = ({ mode }) => {
  return (
    <StandaloneThemeProvider>
      {mode === 'settings' ? <SettingsContent /> : <HelpContent />}
    </StandaloneThemeProvider>
  )
}
