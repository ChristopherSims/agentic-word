import React, { useState, type FC } from 'react'
import { Box, Typography, Button, FormControl, Select, MenuItem, Slider, Stack, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, ButtonBase, Tooltip, Switch, FormControlLabel, Divider, Alert, ToggleButtonGroup, ToggleButton } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../../store/app-store'
import { ACCENT_SWATCHES, EDITOR_FONTS, THEMES } from '../../themes'
import { getContrastRatio } from '../../utils/theme-manager'
import {
  CUSTOM_THEMES_CHANGED_EVENT,
  CUSTOM_THEMES_STORAGE_KEY
} from '../../theme/resolver'

const ThemeSwatch: FC<{ vars?: Record<string, string> }> = ({ vars }) => (
  <Box sx={{ display: 'inline-flex', width: 24, height: 16, borderRadius: 0.5, overflow: 'hidden', mr: 1, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
    <Box sx={{ width: '34%', bgcolor: vars?.['--bg-primary'] ?? 'var(--ui-canvas)' }} />
    <Box sx={{ width: '33%', bgcolor: vars?.['--bg-surface'] ?? 'var(--ui-elevated)' }} />
    <Box sx={{ width: '33%', bgcolor: vars?.['--accent'] ?? 'var(--ui-accent)' }} />
  </Box>
)

interface CustomThemeRecord {
  name: string
  label: string
  mode: 'light' | 'dark'
  vars: Record<string, string>
}

const notifyCustomThemesChanged = () => window.dispatchEvent(new Event(CUSTOM_THEMES_CHANGED_EVENT))

const persistCustomThemes = (themes: CustomThemeRecord[]) => {
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes))
  notifyCustomThemesChanged()
}

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', fontWeight: 700 }}>{children}</Typography>
)

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

const LIGHT_THEME_DEFAULTS: Record<string, string> = {
  '--bg-primary': '#ECEEF2', '--bg-secondary': '#F5F6F8', '--bg-surface': '#FFFFFF', '--bg-elevated': '#FFFFFF',
  '--text-primary': '#20242C', '--text-secondary': '#566171', '--text-muted': '#626C7A',
  '--accent': '#445CCB', '--accent-hover': '#364BB0', '--success': '#216A48', '--warning': '#855C12', '--danger': '#B42338', '--border': '#D8DDE5'
}

const DARK_THEME_DEFAULTS: Record<string, string> = {
  '--bg-primary': '#1e1e2e', '--bg-secondary': '#181825', '--bg-surface': '#313244', '--bg-elevated': '#45475a',
  '--text-primary': '#cdd6f4', '--text-secondary': '#a6adc8', '--text-muted': '#6c7086',
  '--accent': '#89b4fa', '--accent-hover': '#74c7ec', '--success': '#a6e3a1', '--warning': '#f9e2af', '--danger': '#f38ba8', '--border': '#585b70'
}

export const AppearanceSettings: FC = () => {
  const {
    themeMode, useSystemThemePreference, themeLight, themeDark,
    accentColor, uiFontSize, editorFont, reducedMotion,
    setThemeMode, setUseSystemThemePreference, setThemeLight, setThemeDark,
    setAccentColor, setUiFontSize, setEditorFont, setReducedMotion, addToast
  } = useAppStore()
  const [customThemeDialogOpen, setCustomThemeDialogOpen] = useState(false)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const [customThemeName, setCustomThemeName] = useState('')
  const [customThemeMode, setCustomThemeMode] = useState<'light' | 'dark'>('light')
  const [customThemeColors, setCustomThemeColors] = useState<Record<string, string>>({ ...LIGHT_THEME_DEFAULTS })
  const [customThemes, setCustomThemes] = useState<CustomThemeRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || '[]') } catch { return [] }
  })

  const themeOptions = [
    ...THEMES.map((t) => ({ name: t.name, label: t.label, mode: t.mode, vars: t.vars as Record<string, string> | undefined })),
    ...customThemes.map((t) => ({ name: t.name, label: `${t.label} (custom)`, mode: t.mode, vars: t.vars }))
  ]
  const lightThemes = themeOptions.filter((t) => t.mode === 'light')
  const darkThemes = themeOptions.filter((t) => t.mode === 'dark')

  const resetThemeDialog = () => {
    setEditingThemeId(null); setCustomThemeName('')
    setCustomThemeMode('light')
    setCustomThemeColors({ ...LIGHT_THEME_DEFAULTS })
    setCustomThemeDialogOpen(false)
  }

  const handleCreateCustomTheme = () => {
    if (!customThemeName.trim()) { addToast('error', 'Theme name is required'); return }
    const mode = customThemeMode
    if (editingThemeId) {
      const updated = customThemes.map(t => t.name === editingThemeId ? { ...t, label: customThemeName, mode, vars: customThemeColors } : t)
      setCustomThemes(updated); persistCustomThemes(updated); addToast('success', 'Theme updated')
    } else {
      const newTheme = { name: `custom-${Date.now()}`, label: customThemeName, mode, vars: customThemeColors }
      const updated = [...customThemes, newTheme]
      setCustomThemes(updated); persistCustomThemes(updated)
      if (mode === 'light') setThemeLight(newTheme.name)
      else setThemeDark(newTheme.name)
      addToast('success', 'Custom theme created')
    }
    resetThemeDialog()
  }

  const handleEditTheme = (themeName: string) => {
    const t = customThemes.find(x => x.name === themeName)
    if (t) { setEditingThemeId(themeName); setCustomThemeName(t.label); setCustomThemeMode(t.mode); setCustomThemeColors(t.vars); setCustomThemeDialogOpen(true) }
  }

  const handleDeleteTheme = (themeName: string) => {
    const updated = customThemes.filter(t => t.name !== themeName)
    setCustomThemes(updated); persistCustomThemes(updated)
    if (themeLight === themeName) setThemeLight('paper')
    if (themeDark === themeName) setThemeDark('catppuccin-mocha')
    addToast('success', 'Theme deleted')
  }

  return (
    <>
      <SectionTitle>Color Mode</SectionTitle>
      <Box data-setting="theme" sx={{ mb: 2 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={themeMode === 'auto' ? 'system' : themeMode}
          onChange={(_, value) => {
            if (!value) return
            if (value === 'system') {
              setUseSystemThemePreference(true)
              setThemeMode('auto')
            } else {
              setUseSystemThemePreference(false)
              setThemeMode(value as 'light' | 'dark')
            }
          }}
        >
          <ToggleButton value="system" sx={{ textTransform: 'none' }}>System</ToggleButton>
          <ToggleButton value="light" sx={{ textTransform: 'none' }}>Light</ToggleButton>
          <ToggleButton value="dark" sx={{ textTransform: 'none' }}>Dark</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <SectionTitle>Light Theme</SectionTitle>
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <Select value={themeLight} onChange={(e) => setThemeLight(e.target.value)}>
          {lightThemes.map(t => <MenuItem key={t.name} value={t.name}><ThemeSwatch vars={t.vars} />{t.label}</MenuItem>)}
        </Select>
      </FormControl>

      <SectionTitle>Dark Theme</SectionTitle>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <FormControl fullWidth size="small" sx={{ flex: 1 }}>
          <Select value={themeDark} onChange={(e) => setThemeDark(e.target.value)}>
            {darkThemes.map(t => <MenuItem key={t.name} value={t.name}><ThemeSwatch vars={t.vars} />{t.label}</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" onClick={() => { setEditingThemeId(null); setCustomThemeName(''); setCustomThemeMode('light'); setCustomThemeColors({ ...LIGHT_THEME_DEFAULTS }); setCustomThemeDialogOpen(true) }} startIcon={<AddIcon sx={{ fontSize: 16 }} />} sx={{ whiteSpace: 'nowrap' }}>Create</Button>
      </Box>

      {customThemes.length > 0 && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ mb: 0.5, display: 'block', fontWeight: 600 }}>Custom Themes</Typography>
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
      <Stack data-setting="accent" direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <Tooltip title="Default">
          <ButtonBase
            aria-label="Default accent"
            aria-pressed={!accentColor}
            onClick={() => setAccentColor('')}
            sx={{ width: 28, height: 28, borderRadius: '50%', border: '1px dashed', borderColor: 'divider', color: 'text.secondary', fontSize: 12 }}
          >
            A
          </ButtonBase>
        </Tooltip>
        {ACCENT_SWATCHES.map(s => (
          <Tooltip key={s.name} title={s.name}>
            <ButtonBase
              aria-label={`Accent color: ${s.name}`}
              aria-pressed={accentColor === s.color}
              onClick={() => setAccentColor(s.color)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: s.color,
                border: accentColor === s.color ? '2px solid' : '1px solid',
                borderColor: accentColor === s.color ? 'text.primary' : 'divider'
              }}
            />
          </Tooltip>
        ))}
      </Stack>

      <SectionTitle>UI Font Size</SectionTitle>
      <Box data-setting="ui-font-size" sx={{ px: 1 }}>
        <Slider value={uiFontSize} onChange={(_, v) => setUiFontSize(v as number)} min={12} max={18} step={1} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}px`} size="small" />
      </Box>

      <SectionTitle>Editor Font</SectionTitle>
      <Box data-setting="editor-font">
        <FormControl fullWidth size="small"><Select value={editorFont} onChange={(e) => setEditorFont(e.target.value)}>{EDITOR_FONTS.map(f => <MenuItem key={f} value={f} sx={{ fontSize: 12 }}>{f}</MenuItem>)}</Select></FormControl>
      </Box>

      <SectionTitle>Motion</SectionTitle>
      <FormControlLabel
        control={<Switch checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />}
        label={<Typography variant="caption">Reduce motion</Typography>}
      />

      <Divider sx={{ my: 2 }} />
      <Button
        size="small"
        variant="outlined"
        onClick={() => {
          setAccentColor('')
          setUiFontSize(14)
          setEditorFont('Georgia')
          setThemeLight('paper')
          setThemeDark('catppuccin-mocha')
          addToast('success', 'Appearance reset')
        }}
      >
        Reset appearance
      </Button>

      <Dialog open={customThemeDialogOpen} onClose={resetThemeDialog} fullWidth sx={{ maxWidth: "sm" }}>
        <DialogTitle>{editingThemeId ? 'Edit Custom Theme' : 'Create Custom Theme'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 2 }}>
          <TextField label="Theme Name" fullWidth size="small" value={customThemeName} onChange={(e) => setCustomThemeName(e.target.value)} placeholder="My Theme" />
          <FormControl fullWidth size="small">
            <Select
              value={customThemeMode}
              onChange={(e) => {
                const mode = e.target.value as 'light' | 'dark'
                setCustomThemeMode(mode)
                setCustomThemeColors({ ...(mode === 'light' ? LIGHT_THEME_DEFAULTS : DARK_THEME_DEFAULTS) })
              }}
            >
              <MenuItem value="light">Light theme</MenuItem>
              <MenuItem value="dark">Dark theme</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: customThemeColors['--bg-primary'] }}>
            <Typography variant="caption" sx={{ color: customThemeColors['--text-secondary'], mb: 0.5, display: 'block', fontWeight: 600 }}>Preview</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--bg-secondary'] }}><Typography variant="caption" sx={{ color: customThemeColors['--text-primary'] }}>Secondary BG</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--accent'], color: 'white' }}><Typography variant="caption">Accent</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--success'], color: 'white' }}><Typography variant="caption">Success</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--warning'], color: 'white' }}><Typography variant="caption">Warning</Typography></Box>
              <Box sx={{ px: 1, py: 0.5, borderRadius: 0.5, bgcolor: customThemeColors['--danger'], color: 'white' }}><Typography variant="caption">Danger</Typography></Box>
            </Box>
            <Typography variant="caption" sx={{ color: customThemeColors['--text-secondary'] }}>This is how your text will look in this theme</Typography>
          </Box>
          {(() => {
            const ratio = parseFloat(getContrastRatio(customThemeColors['--text-primary'], customThemeColors['--bg-primary']))
            return Number.isFinite(ratio) && ratio < 4.5 ? (
              <Alert severity="warning">
                Text contrast is {ratio.toFixed(1)}:1, below the 4.5:1 minimum. Choose a lighter or darker text/background.
              </Alert>
            ) : null
          })()}
          <Box>
            <Typography variant="caption" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>Colors</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 40px', gap: 1, maxHeight: 300, overflow: 'auto' }}>
              {colorVars.map(v => (
                <Box key={v.key} sx={{ display: 'contents' }}>
                  <Typography variant="caption" sx={{ alignSelf: 'center', fontSize: 12 }}>{v.label}</Typography>
                  <input type="color" value={customThemeColors[v.key] || '#000000'} onChange={(e) => setCustomThemeColors({ ...customThemeColors, [v.key]: e.target.value })} style={{ width: 40, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetThemeDialog}>Cancel</Button>
          {editingThemeId && <Button onClick={() => { handleDeleteTheme(editingThemeId); resetThemeDialog() }} color="error">Delete</Button>}
          <Button onClick={handleCreateCustomTheme} variant="contained">{editingThemeId ? 'Update Theme' : 'Create Theme'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
