/**
 * Appearance resolver - turns saved preferences into one resolved
 * { mode, theme, tokens } object. Pure functions, no DOM access.
 *
 * Precedence (preserved from the previous implementation):
 * 1. Scheduled dark mode (when enabled)
 * 2. Explicit light/dark mode
 * 3. System preference (auto mode)
 * 4. Light
 */

import { DEFAULT_THEME_ID, THEMES, type ThemeDefinition } from '../themes'
import { getEffectiveTheme } from '../utils/theme-manager'
import { getColorPalette, type ColorPalette } from '../utils/accessibility-utils'
import { getRGBFromHex, getRelativeLuminance } from '../utils/theme-manager'
import {
  bestOnColor,
  deriveAccentSoft,
  isHexColor,
  legacyVarsToTokens,
  mixHex,
  type SemanticTokens,
  type ThemeMode
} from './tokens'

export const CUSTOM_THEMES_STORAGE_KEY = 'customThemes'

/** Same-window notification used to re-resolve appearance after theme edits. */
export const CUSTOM_THEMES_CHANGED_EVENT = 'lexicon:custom-themes-changed'

export interface AppearancePreferences {
  /** Legacy single theme; used as a fallback when a per-mode slot is unset. */
  theme: string
  /** Theme chosen for the light mode (System/Light/Dark selection). */
  themeLight?: string
  /** Theme chosen for the dark mode. */
  themeDark?: string
  accentColor: string
  themeMode: 'light' | 'dark' | 'auto'
  useSystemThemePreference: boolean
  scheduledDarkModeEnabled: boolean
  scheduledDarkModeStart: number
  scheduledDarkModeEnd: number
  accessibilityMode: string
}

export interface ResolvedAppearance {
  /** Palette light/dark. Drives color-scheme, MUI mode, and CSS `data-mode`. */
  mode: ThemeMode
  /** Requested light/dark from settings, system, or schedule. */
  preferenceMode: ThemeMode
  themeId: string
  themeLabel: string
  isCustom: boolean
  tokens: SemanticTokens
}

interface StoredCustomTheme {
  name: string
  label?: string
  mode?: string
  vars?: Record<string, string>
}

function isLightBackground(color: string | undefined): boolean {
  if (!color || !isHexColor(color)) return true
  return getRelativeLuminance(getRGBFromHex(color)) > 0.5
}

/** Infer a theme mode from a legacy custom-theme palette. */
export function inferThemeMode(vars: Record<string, string>): ThemeMode {
  return isLightBackground(vars['--bg-primary']) ? 'light' : 'dark'
}

/**
 * Read custom themes from localStorage. Accepts the legacy v1 shape
 * (name/label/vars) and normalizes it into a ThemeDefinition. Invalid
 * entries are dropped rather than crashing the app.
 */
export function loadCustomThemes(): ThemeDefinition[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (entry): entry is StoredCustomTheme =>
          Boolean(entry) && typeof entry === 'object' && typeof (entry as StoredCustomTheme).name === 'string'
      )
      .filter((entry) => Boolean(entry.vars) && typeof entry.vars === 'object')
      .map((entry) => ({
        name: entry.name,
        label: entry.label || entry.name,
        mode:
          entry.mode === 'light' || entry.mode === 'dark' ? entry.mode : inferThemeMode(entry.vars ?? {}),
        vars: entry.vars as Record<string, string>
      }))
  } catch {
    return []
  }
}

export function resolveMode(preferences: AppearancePreferences): ThemeMode {
  return getEffectiveTheme({
    mode: preferences.themeMode,
    useSystemPreference: preferences.useSystemThemePreference,
    scheduledDarkModeStart: preferences.scheduledDarkModeEnabled ? preferences.scheduledDarkModeStart : undefined,
    scheduledDarkModeEnd: preferences.scheduledDarkModeEnabled ? preferences.scheduledDarkModeEnd : undefined
  })
}

function applyAccent(tokens: SemanticTokens, accent: string): SemanticTokens {
  if (!accent) return tokens
  return {
    ...tokens,
    accent,
    accentHover: mixHex(accent, tokens.text, 0.18),
    onAccent: bestOnColor(accent),
    accentSoft: deriveAccentSoft(accent, tokens.surface)
  }
}

/** Accessibility modes replace the palette entirely, as before. */
function paletteToTokens(palette: ColorPalette): SemanticTokens {
  return {
    canvas: palette.background,
    surface: palette.surface,
    document: palette.background,
    elevated: palette.surface,
    text: palette.text,
    textSecondary: palette.textSecondary,
    textMuted: palette.textSecondary,
    borderSubtle: palette.border,
    borderControl: palette.border,
    accent: palette.primary,
    accentHover: palette.secondary,
    onAccent: bestOnColor(palette.primary),
    accentSoft: deriveAccentSoft(palette.primary, palette.background),
    success: palette.success,
    warning: palette.warning,
    danger: palette.error
  }
}

export function resolveAppearance(
  preferences: AppearancePreferences,
  customThemes: ThemeDefinition[] = loadCustomThemes()
): ResolvedAppearance {
  const preferenceMode = resolveMode(preferences)
  const allThemes = [...THEMES, ...customThemes]
  const themeName = preferenceMode === 'light'
    ? (preferences.themeLight || preferences.theme)
    : (preferences.themeDark || preferences.theme)
  const selected =
    allThemes.find((theme) => theme.name === themeName) ??
    THEMES.find((theme) => theme.name === DEFAULT_THEME_ID) ??
    THEMES.find((theme) => theme.mode === preferenceMode) ??
    THEMES[0]

  let tokens = selected.tokens ?? legacyVarsToTokens(selected.vars, selected.mode)
  let mode = selected.mode

  if (preferences.accessibilityMode && preferences.accessibilityMode !== 'normal') {
    tokens = paletteToTokens(getColorPalette(preferenceMode, preferences.accessibilityMode))
    mode = preferenceMode
  }

  tokens = applyAccent(tokens, preferences.accentColor)

  return {
    mode,
    preferenceMode,
    themeId: selected.name,
    themeLabel: selected.label,
    isCustom: customThemes.some((theme) => theme.name === selected.name),
    tokens
  }
}
