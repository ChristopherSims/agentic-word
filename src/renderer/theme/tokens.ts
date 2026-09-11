/**
 * Appearance tokens - single source of truth for UI color, type, space,
 * radius, shadow, motion, and layering values.
 *
 * Rules:
 * - `--ui-*` tokens style the application interface only.
 * - `--doc-*` tokens style the editor viewing surface.
 * - Authored document formatting and export/print styles never read UI tokens.
 */

import { getRelativeLuminance, getRGBFromHex } from '../utils/theme-manager'

export type ThemeMode = 'light' | 'dark'

export interface SemanticTokens {
  /** Workspace behind the document */
  canvas: string
  /** Toolbar and inspector */
  surface: string
  /** Default editing surface */
  document: string
  /** Menus and dialogs */
  elevated: string
  /** Main UI text */
  text: string
  /** Supporting labels */
  textSecondary: string
  /** Readable metadata, not disabled text */
  textMuted: string
  /** Decorative separators */
  borderSubtle: string
  /** Boundaries needed to identify controls */
  borderControl: string
  /** Primary action, selected state, focus */
  accent: string
  /** Accent hover/pressed companion */
  accentHover: string
  /** Text on a solid accent button */
  onAccent: string
  /** Selected-item background */
  accentSoft: string
  success: string
  warning: string
  danger: string
}

export interface ThemeScales {
  space: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl', string>
  radius: Record<'control' | 'surface' | 'dialog' | 'pill', string>
  type: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', string>
  shadows: Record<'raised' | 'soft' | 'inset' | 'overlay', string>
  motion: { fast: string; base: string; slow: string; ease: string }
  zIndex: Record<
    'docked' | 'sticky' | 'menu' | 'drawer' | 'modal' | 'popover' | 'tooltip' | 'toast' | 'contextMenu',
    number
  >
}

export const PAPER_TOKENS: SemanticTokens = {
  canvas: '#ECEEF2',
  surface: '#F5F6F8',
  document: '#FFFFFF',
  elevated: '#FFFFFF',
  text: '#20242C',
  textSecondary: '#566171',
  textMuted: '#626C7A',
  borderSubtle: '#D8DDE5',
  borderControl: '#788494',
  accent: '#445CCB',
  accentHover: '#364BB0',
  onAccent: '#FFFFFF',
  accentSoft: '#E8ECFF',
  success: '#216A48',
  warning: '#855C12',
  danger: '#B42338'
}

export const GRAPHITE_TOKENS: SemanticTokens = {
  canvas: '#171B22',
  surface: '#202630',
  document: '#242B36',
  elevated: '#2C3441',
  text: '#EDF1F7',
  textSecondary: '#B5BECC',
  textMuted: '#A7B2C2',
  borderSubtle: '#394454',
  borderControl: '#77869C',
  accent: '#A4B5FF',
  accentHover: '#C0CCFF',
  onAccent: '#151A2B',
  accentSoft: '#303B62',
  success: '#83D6AD',
  warning: '#E9C17A',
  danger: '#FF9CAA'
}

/** UI text stays on the platform system stack - no remote or bundled display fonts. */
export const UI_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const MONO_FONT_STACK =
  '"Cascadia Code", "Fira Code", "JetBrains Mono", "Source Code Pro", Consolas, Monaco, monospace'

export const PROSE_SERIF_STACK = 'Georgia, Cambria, "Times New Roman", Times, serif'
export const PROSE_SANS_STACK = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/** 4/8/12/16/24/32/48 spacing scale (ui-updates.md §3.5). */
export const SPACE_SCALE: ThemeScales['space'] = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px'
}

/** Control 8px, grouped surfaces 12px, dialogs 16px. */
export const RADIUS_SCALE: ThemeScales['radius'] = {
  control: '8px',
  surface: '12px',
  dialog: '16px',
  pill: '999px'
}

/** rem-based UI type scale - scales with the root font size (uiFontSize). */
export const TYPE_SCALE: ThemeScales['type'] = {
  xs: '0.75rem',
  sm: '0.8125rem',
  md: '0.875rem',
  lg: '1rem',
  xl: '1.25rem',
  '2xl': '1.375rem'
}

export const SHADOW_SCALES: Record<ThemeMode, ThemeScales['shadows']> = {
  light: {
    raised: '0 3px 12px rgb(29 42 64 / 8%)',
    soft: '3px 3px 8px rgb(29 42 64 / 9%), -3px -3px 8px rgb(255 255 255 / 80%)',
    inset: 'inset 1px 1px 3px rgb(29 42 64 / 10%), inset -1px -1px 2px rgb(255 255 255 / 75%)',
    overlay: '0 12px 32px rgb(29 42 64 / 16%)'
  },
  dark: {
    raised: '0 4px 14px rgb(0 0 0 / 20%)',
    soft: '3px 3px 8px rgb(0 0 0 / 20%), -2px -2px 6px rgb(255 255 255 / 2%)',
    inset: 'inset 1px 1px 3px rgb(0 0 0 / 25%), inset -1px -1px 2px rgb(255 255 255 / 3%)',
    overlay: '0 16px 40px rgb(0 0 0 / 45%)'
  }
}

export const MOTION_SCALE: ThemeScales['motion'] = {
  fast: '140ms',
  base: '180ms',
  slow: '220ms',
  ease: 'cubic-bezier(0.2, 0, 0, 1)'
}

export const Z_INDEX_SCALE: ThemeScales['zIndex'] = {
  docked: 10,
  sticky: 40,
  menu: 1000,
  drawer: 1200,
  modal: 1300,
  popover: 1400,
  tooltip: 1500,
  toast: 1600,
  contextMenu: 1700
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim())
}

/** Pick readable text for a solid background. Falls back to white for non-hex input. */
export function bestOnColor(background: string): string {
  if (!isHexColor(background)) return '#FFFFFF'
  const luminance = getRelativeLuminance(getRGBFromHex(background))
  return luminance > 0.179 ? '#151A2B' : '#FFFFFF'
}

/** Blend two hex colors. Returns `from` unchanged if either input is not hex. */
export function mixHex(from: string, to: string, ratio: number): string {
  if (!isHexColor(from) || !isHexColor(to)) return from
  const a = getRGBFromHex(from)
  const b = getRGBFromHex(to)
  const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * ratio))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** Derive a soft selected-item background from an accent and surface. */
export function deriveAccentSoft(accent: string, surface: string): string {
  return `color-mix(in oklab, ${accent} 16%, ${surface})`
}

/**
 * Map a legacy `--bg-*`/`--text-*` theme palette onto semantic tokens.
 * Used for the six existing built-in themes and for custom themes while the
 * semantic custom-theme editor is still pending.
 */
export function legacyVarsToTokens(vars: Record<string, string>, mode: ThemeMode): SemanticTokens {
  const base = mode === 'dark' ? GRAPHITE_TOKENS : PAPER_TOKENS
  const read = (key: string, fallback: string) => vars[key] || fallback

  const canvas = read('--bg-primary', base.canvas)
  const surface = read('--bg-secondary', base.surface)
  const elevated = read('--bg-surface', base.elevated)
  const accent = read('--accent', base.accent)
  const accentHover = read('--accent-hover', accent)

  return {
    canvas,
    surface,
    document: read('--bg-primary', base.document),
    elevated,
    text: read('--text-primary', base.text),
    textSecondary: read('--text-secondary', base.textSecondary),
    textMuted: read('--text-muted', base.textMuted),
    borderSubtle: read('--border', base.borderSubtle),
    borderControl: read('--border', base.borderControl),
    accent,
    accentHover,
    onAccent: bestOnColor(accent),
    accentSoft: deriveAccentSoft(accent, surface),
    success: read('--success', base.success),
    warning: read('--warning', base.warning),
    danger: read('--danger', base.danger)
  }
}
