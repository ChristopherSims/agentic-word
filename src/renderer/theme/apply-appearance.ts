/**
 * Applies resolved appearance tokens to the document root as CSS custom
 * properties, plus temporary legacy aliases so existing styles continue to
 * work during the migration (ui-updates.md §9.1).
 */

import type { ResolvedAppearance } from './resolver'
import {
  mixHex,
  MONO_FONT_STACK,
  MOTION_SCALE,
  RADIUS_SCALE,
  SHADOW_SCALES,
  SPACE_SCALE,
  TYPE_SCALE,
  UI_FONT_STACK,
  Z_INDEX_SCALE
} from './tokens'

export interface FontPreferences {
  uiFontSize: number
  globalFontSize: number
  globalLineHeight: number
  globalLetterSpacing: number
  editorFont: string
}

/** Baseline UI font size in px. Root font-size is expressed relative to it. */
export const UI_FONT_BASE_SIZE = 14

function setVars(root: HTMLElement, vars: Record<string, string>): void {
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
}

function semanticVars(appearance: ResolvedAppearance): Record<string, string> {
  const { tokens } = appearance
  return {
    '--ui-canvas': tokens.canvas,
    '--ui-surface': tokens.surface,
    '--ui-document': tokens.document,
    '--ui-elevated': tokens.elevated,
    '--ui-text': tokens.text,
    '--ui-text-secondary': tokens.textSecondary,
    '--ui-text-muted': tokens.textMuted,
    '--ui-border-subtle': tokens.borderSubtle,
    '--ui-border-control': tokens.borderControl,
    '--ui-accent': tokens.accent,
    '--ui-accent-hover': tokens.accentHover,
    '--ui-on-accent': tokens.onAccent,
    '--ui-accent-soft': tokens.accentSoft,
    '--ui-success': tokens.success,
    '--ui-warning': tokens.warning,
    '--ui-danger': tokens.danger,
    /* Desk around the page: document color darkened by 50%. */
    '--doc-desk': mixHex(tokens.document, '#000000', 0.5)
  }
}

/** Legacy `--bg-*`/`--text-*` family used across the editor and toolbar CSS. */
const LEGACY_COLOR_ALIASES: Record<string, string> = {
  '--bg-primary': 'var(--ui-canvas)',
  '--bg-secondary': 'var(--ui-surface)',
  '--bg-surface': 'var(--ui-elevated)',
  '--bg-elevated': 'var(--ui-elevated)',
  '--text-primary': 'var(--ui-text)',
  '--text-secondary': 'var(--ui-text-secondary)',
  '--text-muted': 'var(--ui-text-muted)',
  '--accent': 'var(--ui-accent)',
  '--accent-hover': 'var(--ui-accent-hover)',
  '--accent-muted': 'var(--ui-accent-soft)',
  '--success': 'var(--ui-success)',
  '--warning': 'var(--ui-warning)',
  '--danger': 'var(--ui-danger)',
  '--border': 'var(--ui-border-subtle)'
}

/** `--color-*` family used by panel stylesheets. */
const COLOR_ALIASES: Record<string, string> = {
  '--color-bg-primary': 'var(--ui-canvas)',
  '--color-bg-secondary': 'var(--ui-surface)',
  '--color-bg-surface': 'var(--ui-elevated)',
  '--color-bg-elevated': 'var(--ui-elevated)',
  '--color-text-primary': 'var(--ui-text)',
  '--color-text-secondary': 'var(--ui-text-secondary)',
  '--color-text-muted': 'var(--ui-text-muted)',
  '--color-accent': 'var(--ui-accent)',
  '--color-accent-hover': 'var(--ui-accent-hover)',
  '--color-accent-bright': 'var(--ui-accent)',
  '--color-primary': 'var(--ui-accent)',
  '--color-secondary': 'var(--ui-accent-hover)',
  '--color-tertiary': 'var(--ui-accent)',
  '--color-background': 'var(--ui-canvas)',
  '--color-background-secondary': 'var(--ui-surface)',
  '--color-surface': 'var(--ui-surface)',
  '--color-surface-dark': 'var(--ui-surface)',
  '--color-text': 'var(--ui-text)',
  '--color-textSecondary': 'var(--ui-text-secondary)',
  '--color-success': 'var(--ui-success)',
  '--color-warning': 'var(--ui-warning)',
  '--color-error': 'var(--ui-danger)',
  '--color-info': 'var(--ui-accent)',
  '--color-border': 'var(--ui-border-subtle)'
}

/**
 * Temporary aliases for the orphaned `--vscode-*` family. These should be
 * replaced with `--ui-*` tokens in the owning stylesheets and then deleted.
 */
const VSCODE_ALIASES: Record<string, string> = {
  '--vscode-button-background': 'var(--ui-accent)',
  '--vscode-button-foreground': 'var(--ui-on-accent)',
  '--vscode-button-hoverBackground': 'var(--ui-accent-hover)',
  '--vscode-button-secondaryBackground': 'var(--ui-elevated)',
  '--vscode-button-secondaryForeground': 'var(--ui-text)',
  '--vscode-button-secondaryHoverBackground': 'var(--ui-surface)',
  '--vscode-descriptionForeground': 'var(--ui-text-secondary)',
  '--vscode-editor-background': 'var(--ui-canvas)',
  '--vscode-editor-foreground': 'var(--ui-text)',
  '--vscode-focusBorder': 'var(--ui-accent)',
  '--vscode-font-family': UI_FONT_STACK,
  '--vscode-foreground': 'var(--ui-text)',
  '--vscode-input-background': 'var(--ui-surface)',
  '--vscode-input-border': 'var(--ui-border-control)',
  '--vscode-list-activeSelectionBackground': 'var(--ui-accent-soft)',
  '--vscode-list-hoverBackground': 'var(--ui-surface)',
  '--vscode-panel-border': 'var(--ui-border-subtle)',
  '--vscode-sideBar-background': 'var(--ui-surface)',
  '--vscode-sideBar-foreground': 'var(--ui-text)',
  '--vscode-toolbar-hoverBackground': 'var(--ui-surface)'
}

function scaleVars(mode: 'light' | 'dark'): Record<string, string> {
  const shadows = SHADOW_SCALES[mode]
  return {
    '--space-xs': SPACE_SCALE.xs,
    '--space-sm': SPACE_SCALE.sm,
    '--space-md': SPACE_SCALE.md,
    '--space-lg': SPACE_SCALE.lg,
    '--space-xl': SPACE_SCALE.xl,
    '--space-2xl': SPACE_SCALE['2xl'],
    '--space-3xl': SPACE_SCALE['3xl'],
    '--radius-control': RADIUS_SCALE.control,
    '--radius-surface': RADIUS_SCALE.surface,
    '--radius-dialog': RADIUS_SCALE.dialog,
    '--radius-pill': RADIUS_SCALE.pill,
    '--font-ui-xs': TYPE_SCALE.xs,
    '--font-ui-sm': TYPE_SCALE.sm,
    '--font-ui-md': TYPE_SCALE.md,
    '--font-ui-lg': TYPE_SCALE.lg,
    '--font-ui-xl': TYPE_SCALE.xl,
    '--font-ui-2xl': TYPE_SCALE['2xl'],
    '--ui-shadow-raised': shadows.raised,
    '--ui-shadow-soft': shadows.soft,
    '--ui-shadow-inset': shadows.inset,
    '--ui-shadow-overlay': shadows.overlay,
    '--shadow-sm': shadows.raised,
    '--shadow-md': shadows.raised,
    '--shadow-lg': shadows.overlay,
    '--shadow-xl': shadows.overlay,
    '--shadow-inner': shadows.inset,
    '--ui-motion-fast': MOTION_SCALE.fast,
    '--ui-motion-base': MOTION_SCALE.base,
    '--ui-motion-slow': MOTION_SCALE.slow,
    '--ui-motion-ease': MOTION_SCALE.ease,
    '--transition-fast': `${MOTION_SCALE.fast} ${MOTION_SCALE.ease}`,
    '--transition-base': `${MOTION_SCALE.base} ${MOTION_SCALE.ease}`,
    '--transition-slow': `${MOTION_SCALE.slow} ${MOTION_SCALE.ease}`,
    '--z-docked': String(Z_INDEX_SCALE.docked),
    '--z-sticky': String(Z_INDEX_SCALE.sticky),
    '--z-menu': String(Z_INDEX_SCALE.menu),
    '--z-drawer': String(Z_INDEX_SCALE.drawer),
    '--z-modal': String(Z_INDEX_SCALE.modal),
    '--z-popover': String(Z_INDEX_SCALE.popover),
    '--z-tooltip': String(Z_INDEX_SCALE.tooltip),
    '--z-toast': String(Z_INDEX_SCALE.toast),
    '--z-context-menu': String(Z_INDEX_SCALE.contextMenu)
  }
}

export function fontVars(fonts: FontPreferences): Record<string, string> {
  const baseSize = Math.round((16 * fonts.globalFontSize) / 100)
  const editorStack = `"${fonts.editorFont}", ${MONO_FONT_STACK}`
  return {
    '--font-size-base': `${baseSize}px`,
    '--line-height-base': String(fonts.globalLineHeight),
    '--letter-spacing-base': `${fonts.globalLetterSpacing}px`,
    '--font-family': UI_FONT_STACK,
    '--font-editor': editorStack,
    '--doc-font-family': editorStack,
    '--doc-font-size': '17px',
    '--doc-line-height': '1.65',
    '--doc-measure': '70ch'
  }
}

export function applyAppearanceToDocument(appearance: ResolvedAppearance, fonts: FontPreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const { mode } = appearance

  setVars(root, semanticVars(appearance))
  setVars(root, scaleVars(mode))
  setVars(root, LEGACY_COLOR_ALIASES)
  setVars(root, COLOR_ALIASES)
  setVars(root, VSCODE_ALIASES)
  setVars(root, fontVars(fonts))

  root.style.colorScheme = mode
  root.style.fontSize = `${Math.round((fonts.uiFontSize / UI_FONT_BASE_SIZE) * 1000) / 10}%`
  root.dataset.mode = mode
  root.dataset.theme = mode
  root.dataset.themeId = appearance.themeId
  root.dataset.uiScheme = mode === 'dark' ? 'graphite' : 'paper'
}
