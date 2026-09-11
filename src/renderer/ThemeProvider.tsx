import React, { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material'
import { useAppStore } from './store/app-store'
import {
  CUSTOM_THEMES_CHANGED_EVENT,
  loadCustomThemes,
  resolveAppearance,
  type ResolvedAppearance
} from './theme/resolver'
import { applyAppearanceToDocument, type FontPreferences } from './theme/apply-appearance'
import { MOTION_SCALE, UI_FONT_STACK, Z_INDEX_SCALE } from './theme/tokens'
import { onSystemThemeChange } from './utils/theme-manager'

const interactiveTransition = [
  `background-color ${MOTION_SCALE.fast} ${MOTION_SCALE.ease}`,
  `border-color ${MOTION_SCALE.fast} ${MOTION_SCALE.ease}`,
  `color ${MOTION_SCALE.fast} ${MOTION_SCALE.ease}`
].join(', ')

function buildMuiTheme(appearance: ResolvedAppearance) {
  const { tokens, mode } = appearance

  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: { main: tokens.accent, contrastText: tokens.onAccent },
      secondary: { main: tokens.accentHover },
      background: { default: tokens.canvas, paper: tokens.surface },
      text: {
        primary: tokens.text,
        secondary: tokens.textSecondary,
        disabled: tokens.textMuted
      },
      success: { main: tokens.success },
      warning: { main: tokens.warning },
      error: { main: tokens.danger },
      divider: tokens.borderSubtle
    },
    typography: {
      fontFamily: UI_FONT_STACK,
      fontSize: 14,
      h1: { fontWeight: 700, letterSpacing: '-0.02em' },
      h2: { fontWeight: 700, letterSpacing: '-0.015em' },
      h3: { fontWeight: 600, letterSpacing: '-0.01em' },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
      caption: { fontSize: '0.75rem' }
    },
    shape: { borderRadius: 8 },
    zIndex: {
      mobileStepper: 1000,
      fab: 1050,
      speedDial: 1050,
      appBar: 1100,
      drawer: Z_INDEX_SCALE.drawer,
      modal: Z_INDEX_SCALE.modal,
      snackbar: Z_INDEX_SCALE.toast,
      tooltip: Z_INDEX_SCALE.tooltip
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontSize: 'var(--font-size-base)',
            lineHeight: 'var(--line-height-base)',
            letterSpacing: 'var(--letter-spacing-base)'
          },
          '::selection': {
            backgroundColor: 'color-mix(in oklab, var(--ui-accent) 30%, transparent)'
          },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: 'var(--ui-border-control)',
            borderRadius: 8,
            border: '2px solid transparent',
            backgroundClip: 'content-box'
          },
          '*::-webkit-scrollbar-thumb:hover': { backgroundColor: 'var(--ui-text-muted)' }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { borderRadius: 12 }
        }
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
            minHeight: 32,
            paddingInline: 14,
            boxShadow: 'none',
            transition: interactiveTransition,
            '&:hover': { boxShadow: 'none' },
            '&:active': { boxShadow: 'none' }
          },
          sizeSmall: { minHeight: 28, paddingInline: 10 },
          sizeLarge: { minHeight: 40, paddingInline: 18 },
          contained: { boxShadow: 'none' }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: 8, transition: interactiveTransition },
          sizeSmall: { padding: 6 }
        }
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            borderColor: 'var(--ui-border-subtle)',
            transition: interactiveTransition,
            '&.Mui-selected': {
              backgroundColor: 'var(--ui-accent-soft)',
              color: 'var(--ui-accent)',
              borderColor: 'var(--ui-accent)',
              '&:hover': { backgroundColor: 'var(--ui-accent-soft)' }
            }
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 600, transition: interactiveTransition },
          sizeSmall: { height: 22, fontSize: 12 },
          label: { paddingInline: 8 },
          outlined: { borderColor: 'var(--ui-border-control)' }
        }
      },
      MuiList: {
        styleOverrides: { root: { paddingTop: 4, paddingBottom: 4 } }
      },
      MuiListItem: {
        styleOverrides: { root: { transition: interactiveTransition } }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 36,
            transition: interactiveTransition,
            '&:hover': { backgroundColor: 'action.hover' },
            '&.Mui-selected': {
              backgroundColor: 'var(--ui-accent-soft)',
              color: 'var(--ui-accent)',
              '&:hover': { backgroundColor: 'color-mix(in oklab, var(--ui-accent) 20%, transparent)' }
            },
            '&.Mui-selected .MuiListItemIcon-root, &.Mui-selected .MuiListItemText-primary': {
              color: 'var(--ui-accent)'
            }
          }
        }
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 10,
            border: '1px solid var(--ui-border-subtle)',
            boxShadow: 'var(--ui-shadow-overlay)',
            paddingTop: 4,
            paddingBottom: 4
          }
        }
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: 13,
            minHeight: 32,
            borderRadius: 6,
            marginLeft: 4,
            marginRight: 4,
            paddingLeft: 8,
            paddingRight: 8,
            transition: interactiveTransition,
            '&:hover': { backgroundColor: 'action.hover' },
            '&.Mui-selected': { backgroundColor: 'var(--ui-accent-soft)', color: 'var(--ui-accent)' }
          }
        }
      },
      MuiTabs: {
        styleOverrides: { root: { minHeight: 36 } }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontSize: 12,
            fontWeight: 600,
            minHeight: 36,
            minWidth: 0,
            paddingInline: 12,
            color: 'text.secondary',
            transition: interactiveTransition,
            '&.Mui-selected': { color: 'var(--ui-accent)' }
          }
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: interactiveTransition,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--ui-border-control)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--ui-accent)', borderWidth: 2 }
          },
          notchedOutline: { borderColor: 'var(--ui-border-subtle)' }
        }
      },
      MuiInputBase: {
        styleOverrides: { input: { fontSize: 13 } }
      },
      MuiTextField: {
        defaultProps: { size: 'small' }
      },
      MuiSelect: {
        defaultProps: { size: 'small' }
      },
      MuiTooltip: {
        defaultProps: { arrow: true, placement: 'top' },
        styleOverrides: {
          tooltip: {
            fontSize: 12,
            borderRadius: 8,
            padding: '6px 10px',
            backgroundColor: 'var(--ui-elevated)',
            color: 'var(--ui-text)',
            border: '1px solid var(--ui-border-subtle)',
            boxShadow: 'var(--ui-shadow-overlay)'
          },
          arrow: { color: 'var(--ui-elevated)' }
        }
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            borderRadius: 16,
            border: '1px solid var(--ui-border-subtle)',
            boxShadow: 'var(--ui-shadow-overlay)'
          }
        }
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: 16, fontWeight: 600, padding: '16px 20px' } }
      },
      MuiDialogContent: {
        styleOverrides: { root: { padding: '8px 20px 20px' } }
      },
      MuiDialogActions: {
        styleOverrides: { root: { padding: '12px 20px 16px' } }
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: 'var(--ui-border-subtle)' } }
      },
      MuiAlert: {
        styleOverrides: {
          root: { fontSize: 13, borderRadius: 10, border: '1px solid var(--ui-border-subtle)' }
        }
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            border: '1px solid var(--ui-border-subtle)',
            borderRadius: 10,
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 }
          }
        }
      },
      MuiTableCell: {
        styleOverrides: { root: { borderBottomColor: 'var(--ui-border-subtle)', fontSize: 13 } }
      },
      MuiSlider: {
        styleOverrides: {
          root: { '& .MuiSlider-thumb': { boxShadow: 'none' } }
        }
      }
    }
  })
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const theme = useAppStore((s) => s.theme)
  const themeLight = useAppStore((s) => s.themeLight)
  const themeDark = useAppStore((s) => s.themeDark)
  const accentColor = useAppStore((s) => s.accentColor)
  const uiFontSize = useAppStore((s) => s.uiFontSize)
  const editorFont = useAppStore((s) => s.editorFont)
  const themeMode = useAppStore((s) => s.themeMode)
  const accessibilityMode = useAppStore((s) => s.accessibilityMode)
  const useSystemThemePreference = useAppStore((s) => s.useSystemThemePreference)
  const scheduledDarkModeEnabled = useAppStore((s) => s.scheduledDarkModeEnabled)
  const scheduledDarkModeStart = useAppStore((s) => s.scheduledDarkModeStart)
  const scheduledDarkModeEnd = useAppStore((s) => s.scheduledDarkModeEnd)
  const globalFontSize = useAppStore((s) => s.globalFontSize)
  const globalLineHeight = useAppStore((s) => s.globalLineHeight)
  const globalLetterSpacing = useAppStore((s) => s.globalLetterSpacing)
  const reducedMotion = useAppStore((s) => s.reducedMotion)
  const highlightFocusIndicators = useAppStore((s) => s.highlightFocusIndicators)

  const [customThemesTick, setCustomThemesTick] = useState(0)
  const [clockTick, setClockTick] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const handler = () => setCustomThemesTick((tick) => tick + 1)
    window.addEventListener(CUSTOM_THEMES_CHANGED_EVENT, handler)
    return () => window.removeEventListener(CUSTOM_THEMES_CHANGED_EVENT, handler)
  }, [])

  useEffect(() => onSystemThemeChange(() => setClockTick((tick) => tick + 1)), [])

  useEffect(() => {
    if (!scheduledDarkModeEnabled) return
    const id = window.setInterval(() => setClockTick((tick) => tick + 1), 60_000)
    return () => window.clearInterval(id)
  }, [scheduledDarkModeEnabled])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const customThemes = useMemo(() => loadCustomThemes(), [customThemesTick])

  const appearance = useMemo(
    () =>
      resolveAppearance(
        {
          theme,
          themeLight,
          themeDark,
          accentColor,
          themeMode,
          useSystemThemePreference,
          scheduledDarkModeEnabled,
          scheduledDarkModeStart,
          scheduledDarkModeEnd,
          accessibilityMode
        },
        customThemes
      ),
    [
      theme,
      themeLight,
      themeDark,
      accentColor,
      themeMode,
      useSystemThemePreference,
      scheduledDarkModeEnabled,
      scheduledDarkModeStart,
      scheduledDarkModeEnd,
      accessibilityMode,
      customThemes,
      clockTick
    ]
  )

  const fonts = useMemo<FontPreferences>(
    () => ({ uiFontSize, globalFontSize, globalLineHeight, globalLetterSpacing, editorFont }),
    [uiFontSize, globalFontSize, globalLineHeight, globalLetterSpacing, editorFont]
  )

  useEffect(() => {
    applyAppearanceToDocument(appearance, fonts)
  }, [appearance, fonts])

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion || prefersReducedMotion)
  }, [reducedMotion, prefersReducedMotion])

  useEffect(() => {
    document.documentElement.classList.toggle('highlight-focus', highlightFocusIndicators)
  }, [highlightFocusIndicators])

  const muiTheme = useMemo(() => buildMuiTheme(appearance), [appearance])

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  )
}
