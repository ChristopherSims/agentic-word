import React, { useMemo, type FC, type ReactNode } from 'react'
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material'
import { useAppStore } from './store/app-store'
import { THEMES } from './themes'

// Convert our custom theme vars to MUI palette
function buildMuiTheme(themeName: string, accentColor: string) {
  const themeDef = THEMES.find((t) => t.name === themeName)
  const v = themeDef?.vars || THEMES[0].vars
  const accent = accentColor || v['--accent']
  const isDark = (v['--bg-primary'] || '#1e1e2e').charCodeAt(1) < 55 // rough: dark themes start with low hex

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: accent },
      secondary: { main: v['--accent-hover'] || accent },
      background: {
        default: v['--bg-primary'],
        paper: v['--bg-secondary']
      },
      text: {
        primary: v['--text-primary'],
        secondary: v['--text-secondary']
      },
      success: { main: v['--success'] },
      warning: { main: v['--warning'] },
      error: { main: v['--danger'] },
      divider: v['--border']
    },
    typography: {
      fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 13
    },
    shape: { borderRadius: 6 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 500 }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: v['--text-secondary'],
            '&:hover': { color: v['--text-primary'], backgroundColor: v['--bg-surface'] },
            '&.Mui-selected': { color: accent, backgroundColor: v['--bg-surface'] }
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontSize: 11, backgroundColor: v['--bg-elevated'], color: v['--text-primary'] }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontSize: 12, minHeight: 32 }
        }
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: { '& .MuiOutlinedInput-root': { fontSize: 12 } }
        }
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: { fontSize: 12 }
        }
      },
      MuiSlider: {
        styleOverrides: {
          root: { fontSize: 12 }
        }
      },
      MuiSwitch: {
        styleOverrides: {
          root: { '& .MuiSwitch-switchBase': { color: v['--text-muted'] } }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: { fontSize: 11 }
        }
      },
      MuiDialog: {
        styleOverrides: {
          paper: { backgroundColor: v['--bg-secondary'] }
        }
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { fontSize: 14, fontWeight: 600 }
        }
      },
      MuiListItem: {
        styleOverrides: {
          root: { '&:hover': { backgroundColor: v['--bg-surface'] } }
        }
      },
      MuiAlert: {
        styleOverrides: {
          root: { fontSize: 12 }
        }
      }
    }
  })
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const theme = useAppStore((s) => s.theme)
  const accentColor = useAppStore((s) => s.accentColor)
  const muiTheme = useMemo(() => buildMuiTheme(theme, accentColor), [theme, accentColor])

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  )
}
