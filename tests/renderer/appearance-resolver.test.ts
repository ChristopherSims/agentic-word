/**
 * Foundation tests for the appearance resolver and semantic tokens.
 * Pure logic, no DOM required (ui-updates.md P0 foundation exit gate).
 */

import { describe, expect, it } from 'vitest'
import {
  inferThemeMode,
  resolveAppearance,
  resolveMode,
  type AppearancePreferences
} from '../../src/renderer/theme/resolver'
import {
  bestOnColor,
  GRAPHITE_TOKENS,
  legacyVarsToTokens,
  mixHex,
  PAPER_TOKENS
} from '../../src/renderer/theme/tokens'
import type { ThemeDefinition } from '../../src/renderer/themes'

const basePreferences: AppearancePreferences = {
  theme: 'paper',
  accentColor: '',
  themeMode: 'light',
  useSystemThemePreference: true,
  scheduledDarkModeEnabled: false,
  scheduledDarkModeStart: 22,
  scheduledDarkModeEnd: 7,
  accessibilityMode: 'normal'
}

const customTheme: ThemeDefinition = {
  name: 'custom-test',
  label: 'Custom Test',
  mode: 'light',
  vars: {
    '--bg-primary': '#f4ecd8',
    '--bg-secondary': '#efe5cc',
    '--bg-surface': '#e6d9b8',
    '--text-primary': '#3e3d37',
    '--text-secondary': '#6b6455',
    '--text-muted': '#8a8272',
    '--accent': '#a65a2e',
    '--accent-hover': '#8f4c26',
    '--success': '#5f7a3f',
    '--warning': '#a07820',
    '--danger': '#a03a2e',
    '--border': '#cbbf9f'
  }
}

describe('resolveMode', () => {
  it('honors an explicit light or dark mode', () => {
    expect(resolveMode({ ...basePreferences, themeMode: 'dark' })).toBe('dark')
    expect(resolveMode({ ...basePreferences, themeMode: 'light' })).toBe('light')
  })

  it('lets an enabled schedule override an explicit mode', () => {
    expect(
      resolveMode({
        ...basePreferences,
        themeMode: 'light',
        scheduledDarkModeEnabled: true,
        scheduledDarkModeStart: 0,
        scheduledDarkModeEnd: 24
      })
    ).toBe('dark')
  })

  it('falls back to light when no window and no explicit mode', () => {
    expect(resolveMode({ ...basePreferences, themeMode: 'auto' })).toBe('light')
  })
})

describe('resolveAppearance', () => {
  it('resolves the Paper reference theme', () => {
    const resolved = resolveAppearance({ ...basePreferences, theme: 'paper' })
    expect(resolved.mode).toBe('light')
    expect(resolved.themeId).toBe('paper')
    expect(resolved.tokens.canvas).toBe(PAPER_TOKENS.canvas)
    expect(resolved.isCustom).toBe(false)
  })

  it('resolves the Graphite reference theme', () => {
    const resolved = resolveAppearance({ ...basePreferences, theme: 'graphite' })
    expect(resolved.mode).toBe('dark')
    expect(resolved.tokens.canvas).toBe(GRAPHITE_TOKENS.canvas)
    expect(resolved.tokens.onAccent).toBe(GRAPHITE_TOKENS.onAccent)
  })

  it('falls back to the default theme for an unknown id', () => {
    const resolved = resolveAppearance({ ...basePreferences, theme: 'does-not-exist' })
    expect(resolved.themeId).toBe('catppuccin-mocha')
  })

  it('applies a custom theme through the same path', () => {
    const resolved = resolveAppearance({ ...basePreferences, theme: 'custom-test' }, [customTheme])
    expect(resolved.themeId).toBe('custom-test')
    expect(resolved.isCustom).toBe(true)
    expect(resolved.mode).toBe('light')
    expect(resolved.tokens.canvas).toBe('#f4ecd8')
    expect(resolved.tokens.accent).toBe('#a65a2e')
  })

  it('derives hover, on-accent, and soft states from a custom accent', () => {
    const resolved = resolveAppearance({ ...basePreferences, accentColor: '#ff0000' })
    expect(resolved.tokens.accent).toBe('#ff0000')
    // Dark text beats white on pure red (5.25:1 vs 4.0:1).
    expect(resolved.tokens.onAccent).toBe('#151A2B')
    expect(resolved.tokens.accentHover.startsWith('#')).toBe(true)
    expect(resolved.tokens.accentSoft).toContain('color-mix')
  })

  it('keeps the palette mode aligned with the selected theme', () => {
    const resolved = resolveAppearance({ ...basePreferences, theme: 'graphite', themeMode: 'light' })
    expect(resolved.mode).toBe('dark')
    expect(resolved.preferenceMode).toBe('light')
  })

  it('replaces the palette for accessibility modes using the preference mode', () => {
    const resolved = resolveAppearance({
      ...basePreferences,
      theme: 'paper',
      themeMode: 'light',
      accessibilityMode: 'high-contrast'
    })
    expect(resolved.mode).toBe('light')
    expect(resolved.tokens.text).toBe('#000000')
    expect(resolved.tokens.accent).toBe('#0033CC')
  })
})

describe('resolveAppearance per-mode themes', () => {
  it('selects the theme chosen for the resolved mode', () => {
    const prefs = { ...basePreferences, themeLight: 'paper', themeDark: 'graphite' }
    expect(resolveAppearance({ ...prefs, themeMode: 'dark' }).themeId).toBe('graphite')
    expect(resolveAppearance({ ...prefs, themeMode: 'light' }).themeId).toBe('paper')
  })

  it('uses the dark slot when a schedule forces dark', () => {
    const resolved = resolveAppearance({
      ...basePreferences,
      themeLight: 'paper',
      themeDark: 'dracula',
      themeMode: 'light',
      scheduledDarkModeEnabled: true,
      scheduledDarkModeStart: 0,
      scheduledDarkModeEnd: 24
    })
    expect(resolved.themeId).toBe('dracula')
    expect(resolved.mode).toBe('dark')
  })

  it('resolves a custom theme placed in the dark slot', () => {
    const customDark: ThemeDefinition = {
      ...customTheme,
      name: 'custom-dark',
      mode: 'dark',
      vars: { ...customTheme.vars, '--bg-primary': '#101014', '--text-primary': '#f0f0f0' }
    }
    const resolved = resolveAppearance({ ...basePreferences, themeDark: 'custom-dark', themeMode: 'dark' }, [customDark])
    expect(resolved.themeId).toBe('custom-dark')
    expect(resolved.mode).toBe('dark')
    expect(resolved.tokens.canvas).toBe('#101014')
  })
})

describe('token helpers', () => {
  it('maps legacy palette vars to semantic tokens', () => {
    const tokens = legacyVarsToTokens(customTheme.vars, 'light')
    expect(tokens.canvas).toBe('#f4ecd8')
    expect(tokens.document).toBe('#f4ecd8')
    expect(tokens.accent).toBe('#a65a2e')
    expect(tokens.onAccent).toBe('#FFFFFF')
  })

  it('picks readable text for light and dark backgrounds', () => {
    expect(bestOnColor('#FFFFFF')).toBe('#151A2B')
    expect(bestOnColor('#000000')).toBe('#FFFFFF')
    expect(bestOnColor('color-mix(in oklab, red, blue)')).toBe('#FFFFFF')
  })

  it('mixes hex colors and passes non-hex input through', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('rgb(0, 0, 0)', '#ffffff', 0.5)).toBe('rgb(0, 0, 0)')
  })

  it('infers a theme mode from a background color', () => {
    expect(inferThemeMode({ '--bg-primary': '#ffffff' })).toBe('light')
    expect(inferThemeMode({ '--bg-primary': '#111111' })).toBe('dark')
  })
})
