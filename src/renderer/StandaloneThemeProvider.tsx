import React, { useMemo, type FC, type ReactNode } from 'react'
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material'
import { THEMES } from './themes'

function loadSetting<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}

function buildMuiTheme(themeName: string, accentColor: string) {
  const themeDef = THEMES.find((t) => t.name === themeName)
  const v = themeDef?.vars || THEMES[0].vars
  const accent = accentColor || v['--accent']
  const isDark = (v['--bg-primary'] || '#1e1e2e').charCodeAt(1) < 55

  return createTheme({
    motion: { reducedMotion: 'system' as const },
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: accent },
      secondary: { main: v['--accent-hover'] || accent },
      background: { default: v['--bg-primary'], paper: v['--bg-secondary'] },
      text: { primary: v['--text-primary'], secondary: v['--text-secondary'] },
      success: { main: v['--success'] },
      warning: { main: v['--warning'] },
      error: { main: v['--danger'] },
      divider: v['--border']
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.3px' },
      caption: { letterSpacing: '0.3px', fontWeight: 500 }
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, fontSize: '13px', transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', '&:hover': { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)', transform: 'translateY(-1px)' }, '&:active': { transform: 'translateY(0)' } },
          outlined: { borderColor: v['--border'], '&:hover': { backgroundColor: v['--bg-surface'], borderColor: accent } },
          contained: { boxShadow: `0 4px 12px rgba(137, 180, 250, 0.25)` }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: { color: v['--text-secondary'], transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)', borderRadius: '6px', '&:hover': { color: accent, backgroundColor: v['--bg-surface'], transform: 'scale(1.05)' } }
        }
      },
      MuiTooltip: {
        defaultProps: { arrow: true, placement: 'top' },
        styleOverrides: { tooltip: { fontSize: 11, backgroundColor: v['--bg-elevated'], color: v['--text-primary'], boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '8px 12px' } }
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none', background: `linear-gradient(135deg, ${v['--bg-secondary']} 0%, rgba(45, 45, 65, 0.3) 100%)`, backdropFilter: 'blur(10px)', border: `1px solid rgba(255, 255, 255, 0.05)`, boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)' } }
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontSize: 12, minHeight: 36, fontWeight: 500, color: v['--text-secondary'], '&:hover': { color: accent } } }
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
        styleOverrides: { root: { '& .MuiOutlinedInput-root': { fontSize: 12, '& fieldset': { borderColor: `rgba(88, 91, 112, 0.6)` }, '&:hover fieldset': { borderColor: `rgba(137, 180, 250, 0.6)` }, '&.Mui-focused fieldset': { borderColor: accent } }, '& .MuiOutlinedInput-input': { padding: '10px 12px', fontSize: '13px' } } }
      },
      MuiSelect: { defaultProps: { size: 'small' }, styleOverrides: { root: { fontSize: 12 } } },
      MuiSlider: { styleOverrides: { root: { fontSize: 12, '& .MuiSlider-thumb': { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)' }, '& .MuiSlider-track': { borderRadius: '4px' } } } },
      MuiSwitch: { styleOverrides: { root: { '& .MuiSwitch-switchBase': { color: v['--text-muted'] }, '& .MuiSwitch-track': { backgroundColor: v['--bg-surface'], boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.2)' } } } },
      MuiChip: { styleOverrides: { root: { fontSize: 11, fontWeight: 500, borderRadius: 6, boxShadow: '0 1px 4px rgba(0, 0, 0, 0.15)' } } },
      MuiDialog: { styleOverrides: { paper: { backgroundColor: v['--bg-secondary'], boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)', borderRadius: '12px' } } },
      MuiDialogTitle: { styleOverrides: { root: { fontSize: 14, fontWeight: 700 } } },
      MuiListItem: { styleOverrides: { root: { '&:hover': { backgroundColor: v['--bg-surface'] } } } },
      MuiAlert: { styleOverrides: { root: { fontSize: 12, borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' } } }
    }
  })
}

export const StandaloneThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const theme = loadSetting('theme', THEMES[0].name)
  const accentColor = loadSetting('accentColor', THEMES[0].vars['--accent'])
  const muiTheme = useMemo(() => buildMuiTheme(theme, accentColor), [theme, accentColor])

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  )
}
