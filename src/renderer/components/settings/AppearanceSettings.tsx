import React, { useState, type FC } from 'react'
import { Box, Typography, Button, FormControl, Select, MenuItem, Slider, Stack, Avatar, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../../store/app-store'
import { THEMES, ACCENT_SWATCHES, EDITOR_FONTS } from '../../themes'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
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

export const AppearanceSettings: FC = () => {
  const { theme, accentColor, uiFontSize, editorFont, setTheme, setAccentColor, setUiFontSize, setEditorFont, addToast } = useAppStore()
  const [customThemeDialogOpen, setCustomThemeDialogOpen] = useState(false)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const [customThemeName, setCustomThemeName] = useState('')
  const [customThemeColors, setCustomThemeColors] = useState<Record<string, string>>({
    '--bg-primary': '#1e1e2e', '--bg-secondary': '#181825', '--bg-surface': '#313244', '--bg-elevated': '#45475a',
    '--text-primary': '#cdd6f4', '--text-secondary': '#a6adc8', '--text-muted': '#6c7086',
    '--accent': '#89b4fa', '--accent-hover': '#74c7ec', '--success': '#a6e3a1', '--warning': '#f9e2af', '--danger': '#f38ba8', '--border': '#585b70'
  })
  const [customThemes, setCustomThemes] = useState<{ name: string; label: string; vars: Record<string, string> }[]>(() => {
    try { return JSON.parse(localStorage.getItem('customThemes') || '[]') } catch { return [] }
  })

  const resetThemeDialog = () => {
    setEditingThemeId(null); setCustomThemeName('')
    setCustomThemeColors({ '--bg-primary': '#1e1e2e', '--bg-secondary': '#181825', '--bg-surface': '#313244', '--bg-elevated': '#45475a', '--text-primary': '#cdd6f4', '--text-secondary': '#a6adc8', '--text-muted': '#6c7086', '--accent': '#89b4fa', '--accent-hover': '#74c7ec', '--success': '#a6e3a1', '--warning': '#f9e2af', '--danger': '#f38ba8', '--border': '#585b70' })
    setCustomThemeDialogOpen(false)
  }

  const handleCreateCustomTheme = () => {
    if (!customThemeName.trim()) { addToast('error', 'Theme name is required'); return }
    if (editingThemeId) {
      const updated = customThemes.map(t => t.name === editingThemeId ? { ...t, label: customThemeName, vars: customThemeColors } : t)
      setCustomThemes(updated); localStorage.setItem('customThemes', JSON.stringify(updated)); addToast('success', 'Theme updated')
    } else {
      const newTheme = { name: `custom-${Date.now()}`, label: customThemeName, vars: customThemeColors }
      const updated = [...customThemes, newTheme]
      setCustomThemes(updated); localStorage.setItem('customThemes', JSON.stringify(updated)); setTheme(newTheme.name); addToast('success', 'Custom theme created')
    }
    resetThemeDialog()
  }

  const handleEditTheme = (themeName: string) => {
    const t = customThemes.find(x => x.name === themeName)
    if (t) { setEditingThemeId(themeName); setCustomThemeName(t.label); setCustomThemeColors(t.vars); setCustomThemeDialogOpen(true) }
  }

  const handleDeleteTheme = (themeName: string) => {
    const updated = customThemes.filter(t => t.name !== themeName)
    setCustomThemes(updated); localStorage.setItem('customThemes', JSON.stringify(updated))
    if (theme === themeName) setTheme(THEMES[0].name)
    addToast('success', 'Theme deleted')
  }

  return (
    <>
      <SectionTitle>Theme</SectionTitle>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <FormControl fullWidth size="small" sx={{ flex: 1 }}>
          <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map(t => <MenuItem key={t.name} value={t.name}>{t.label}</MenuItem>)}
            {customThemes.map(t => <MenuItem key={t.name} value={t.name}>{t.label} (custom)</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" onClick={() => { setEditingThemeId(null); setCustomThemeName(''); setCustomThemeColors({ '--bg-primary': '#1e1e2e', '--bg-secondary': '#181825', '--bg-surface': '#313244', '--bg-elevated': '#45475a', '--text-primary': '#cdd6f4', '--text-secondary': '#a6adc8', '--text-muted': '#6c7086', '--accent': '#89b4fa', '--accent-hover': '#74c7ec', '--success': '#a6e3a1', '--warning': '#f9e2af', '--danger': '#f38ba8', '--border': '#585b70' }); setCustomThemeDialogOpen(true) }} startIcon={<AddIcon sx={{ fontSize: 16 }} />} sx={{ whiteSpace: 'nowrap' }}>Create</Button>
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

      <Dialog open={customThemeDialogOpen} onClose={resetThemeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingThemeId ? 'Edit Custom Theme' : 'Create Custom Theme'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 2 }}>
          <TextField label="Theme Name" fullWidth size="small" value={customThemeName} onChange={(e) => setCustomThemeName(e.target.value)} placeholder="My Dark Theme" />
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
              {colorVars.map(v => (
                <Box key={v.key} sx={{ display: 'contents' }}>
                  <Typography variant="caption" sx={{ alignSelf: 'center', fontSize: 11 }}>{v.label}</Typography>
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
