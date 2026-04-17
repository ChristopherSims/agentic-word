/**
 * Accessibility Utilities - Color palettes for different accessibility needs
 */

import { getContrastRatio, isWCAGAACompliant, getRGBFromHex, getRelativeLuminance } from './theme-manager'

export interface ColorPalette {
  primary: string
  secondary: string
  tertiary: string
  background: string
  surface: string
  text: string
  textSecondary: string
  success: string
  warning: string
  error: string
  border: string
}

// Standard color palettes
const normalLight: ColorPalette = {
  primary: '#2196F3',
  secondary: '#03DAC6',
  tertiary: '#03DAC6',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#1F1F1F',
  textSecondary: '#666666',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  border: '#CCCCCC'
}

const normalDark: ColorPalette = {
  primary: '#64B5F6',
  secondary: '#4DD0E1',
  tertiary: '#4DD0E1',
  background: '#121212',
  surface: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  success: '#81C784',
  warning: '#FFB74D',
  error: '#EF5350',
  border: '#444444'
}

// High contrast palettes (WCAG AAA)
const highContrastLight: ColorPalette = {
  primary: '#0033CC',
  secondary: '#006600',
  tertiary: '#0033CC',
  background: '#FFFFFF',
  surface: '#F2F2F2',
  text: '#000000',
  textSecondary: '#1F1F1F',
  success: '#008000',
  warning: '#CC6600',
  error: '#CC0000',
  border: '#000000'
}

const highContrastDark: ColorPalette = {
  primary: '#FFFF00',
  secondary: '#00FF00',
  tertiary: '#00FFFF',
  background: '#000000',
  surface: '#1F1F1F',
  text: '#FFFFFF',
  textSecondary: '#FFFF00',
  success: '#00FF00',
  warning: '#FFFF00',
  error: '#FF0000',
  border: '#FFFFFF'
}

// Eye comfort palettes (warm, reduced blue light)
const eyeComfortLight: ColorPalette = {
  primary: '#D4A574',
  secondary: '#B8956A',
  tertiary: '#B8956A',
  background: '#FFFEF0',
  surface: '#FFF8E1',
  text: '#5C4A3A',
  textSecondary: '#8B7355',
  success: '#6B8E23',
  warning: '#CD853F',
  error: '#A0522D',
  border: '#D2B48C'
}

const eyeComfortDark: ColorPalette = {
  primary: '#D4A574',
  secondary: '#B8956A',
  tertiary: '#B8956A',
  background: '#1A1410',
  surface: '#2A2420',
  text: '#E8DCC4',
  textSecondary: '#BBA896',
  success: '#8BBF6B',
  warning: '#CD853F',
  error: '#D97560',
  border: '#8B7355'
}

// Color blind modes
const deuteranopiaLight: ColorPalette = {
  primary: '#0072B2',
  secondary: '#009E73',
  tertiary: '#0072B2',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#1F1F1F',
  textSecondary: '#666666',
  success: '#009E73',
  warning: '#E69F00',
  error: '#D55E00',
  border: '#CCCCCC'
}

const protanopiaLight: ColorPalette = {
  primary: '#005F87',
  secondary: '#00A86B',
  tertiary: '#005F87',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#1F1F1F',
  textSecondary: '#666666',
  success: '#00A86B',
  warning: '#F0AD4E',
  error: '#D74E09',
  border: '#CCCCCC'
}

const tritanopiaLight: ColorPalette = {
  primary: '#E81416',
  secondary: '#0072BA',
  tertiary: '#0072BA',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#1F1F1F',
  textSecondary: '#666666',
  success: '#00A651',
  warning: '#FFB81C',
  error: '#F0AD4E',
  border: '#CCCCCC'
}

/**
 * Get appropriate color palette for theme and accessibility mode
 */
export function getColorPalette(
  theme: 'light' | 'dark',
  accessibilityMode: string
): ColorPalette {
  if (accessibilityMode === 'high-contrast') {
    return theme === 'light' ? highContrastLight : highContrastDark
  }
  if (accessibilityMode === 'eye-comfort') {
    return theme === 'light' ? eyeComfortLight : eyeComfortDark
  }
  if (accessibilityMode === 'deuteranopia') {
    return deuteranopiaLight
  }
  if (accessibilityMode === 'protanopia') {
    return protanopiaLight
  }
  if (accessibilityMode === 'tritanopia') {
    return tritanopiaLight
  }

  return theme === 'light' ? normalLight : normalDark
}

/**
 * Validate palette contrast compliance for a specific WCAG level
 */
export function validatePaletteContrast(
  palette: ColorPalette,
  wcagLevel: 'AA' | 'AAA' = 'AA'
): { compliant: boolean; issues: string[] } {
  const issues: string[] = []
  const isAAA = wcagLevel === 'AAA'

  // Check main text contrast
  const textContrast = getContrastRatio(palette.text, palette.background)
  const textLum = getRelativeLuminance(getRGBFromHex(palette.text))
  const bgLum = getRelativeLuminance(getRGBFromHex(palette.background))
  const contrast = (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05)

  if (isAAA && contrast < 7) {
    issues.push(`Primary text contrast (${textContrast}) below AAA (7:1)`)
  } else if (!isAAA && contrast < 4.5) {
    issues.push(`Primary text contrast (${textContrast}) below AA (4.5:1)`)
  }

  return { compliant: issues.length === 0, issues }
}

/**
 * Convert palette to CSS variable string
 */
export function paletteToCSS(palette: ColorPalette): string {
  return Object.entries(palette)
    .map(([key, value]) => `--color-${key}: ${value};`)
    .join('\n')
}

/**
 * Get a screen reader friendly announcement when theme changes
 */
export function getThemeChangeAnnouncement(theme: 'light' | 'dark', mode: string): string {
  const themeName = theme === 'light' ? 'Light' : 'Dark'
  const modeName = mode === 'normal' ? 'normal' : mode.replace(/-/g, ' ')
  return `Theme changed to ${themeName} mode with ${modeName} accessibility settings`
}
