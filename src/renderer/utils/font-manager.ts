/**
 * Font Manager - Handles font selection, sizing, and accessibility
 */

export interface FontConfig {
  size: number // in pixels
  lineHeight: number // unitless multiplier
  letterSpacing: number // in pixels
}

export const systemFonts = {
  // Serif fonts
  georgia: '"Georgia", "Times New Roman", serif',
  garamond: '"Garamond", serif',
  times: '"Times New Roman", Times, serif',

  // Sans-serif fonts
  arial: '"Arial", Helvetica, sans-serif',
  verdana: '"Verdana", Geneva, sans-serif',
  segoe: '"Segoe UI", Tahoma, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, sans-serif',
  roboto: '"Roboto", sans-serif',

  // Monospace fonts
  monospace: '"Courier New", Courier, monospace',
  consolas: '"Consolas", "Monaco", monospace',
  cascadia: '"Cascadia Code", monospace'
}

/**
 * Predefined font configurations for different accessibility needs
 */
export const accessibleFontConfigs: Record<string, FontConfig> = {
  comfortable: {
    size: 18, // 112.5% of 16px
    lineHeight: 1.8,
    letterSpacing: 0.5
  },
  normal: {
    size: 16,
    lineHeight: 1.6,
    letterSpacing: 0
  },
  compact: {
    size: 14,
    lineHeight: 1.4,
    letterSpacing: -0.3
  },
  dyslexic: {
    size: 16,
    lineHeight: 1.9,
    letterSpacing: 0.1
  },
  lowVision: {
    size: 20,
    lineHeight: 2.0,
    letterSpacing: 0.15
  }
}

/**
 * Validate font configuration
 */
export function validateFontConfig(config: FontConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (config.size < 10 || config.size > 40) {
    errors.push('Font size must be between 10px and 40px')
  }

  if (config.lineHeight < 1.2 || config.lineHeight > 3.0) {
    errors.push('Line height must be between 1.2 and 3.0')
  }

  if (config.letterSpacing < -1 || config.letterSpacing > 2) {
    errors.push('Letter spacing must be between -1px and 2px')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Apply font config to a specific element
 */
export function applyFontConfig(element: HTMLElement, config: FontConfig): void {
  element.style.fontSize = `${config.size}px`
  element.style.lineHeight = `${config.lineHeight}`
  element.style.letterSpacing = `${config.letterSpacing}px`
}

/**
 * Apply font config globally (to document root and all elements)
 */
export function applyFontConfigGlobal(config: FontConfig): void{
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.style.setProperty('--font-size-base', `${config.size}px`)
  root.style.setProperty('--line-height-base', `${config.lineHeight}`)
  root.style.setProperty('--letter-spacing-base', `${config.letterSpacing}px`)

  // Apply to body as fallback
  document.body.style.fontSize = `${config.size}px`
  document.body.style.lineHeight = `${config.lineHeight}`
  document.body.style.letterSpacing = `${config.letterSpacing}px`
}

/**
 * Get recommended line height for a given font size
 */
export function getRecommendedLineHeight(fontSizePx: number): number {
  if (fontSizePx < 14) return 1.8
  if (fontSizePx < 18) return 1.6
  if (fontSizePx < 24) return 1.5
  return 1.4
}

/**
 * Get fonts grouped by category
 */
export function getFontsByCategory(category: 'serif' | 'sans-serif' | 'monospace'): Record<string, string> {
  const fonts = systemFonts as Record<string, string>

  if (category === 'serif') {
    return { georgia: fonts.georgia, garamond: fonts.garamond, times: fonts.times }
  }
  if (category === 'sans-serif') {
    return {
      arial: fonts.arial,
      verdana: fonts.verdana,
      segoe: fonts.segoe,
      helvetica: fonts.helvetica,
      roboto: fonts.roboto
    }
  }
  return { monospace: fonts.monospace, consolas: fonts.consolas, cascadia: fonts.cascadia }
}

/**
 * Calculate relative font size based on scale
 */
export function calculateRelativeSize(baseSizePx: number, scale: 'smallest' | 'smaller' | 'normal' | 'larger' | 'largest'): number {
  const scales: Record<string, number> = {
    smallest: 0.75,
    smaller: 0.875,
    normal: 1,
    larger: 1.25,
    largest: 1.5
  }
  return Math.round(baseSizePx * (scales[scale] || 1))
}

/**
 * Get human-readable accessibility note for a font config
 */
export function getAccessibilityNote(config: FontConfig): string {
  const { size, lineHeight, letterSpacing } = config

  let notes: string[] = []

  if (size >= 18) {
    notes.push('Large text size (18px+)')
  }

  if (lineHeight >= 1.8) {
    notes.push('Generous line spacing')
  }

  if (letterSpacing > 0) {
    notes.push('Increased letter spacing for better readability')
  }

  if (notes.length === 0) {
    notes.push('Standard configuration')
  }

  return notes.join(', ')
}

/**
 * Font size recommendations for different content types
 */
export const fontSizeRecommendations: Record<string, { min: number; recommended: number; max: number }> = {
  body: { min: 14, recommended: 16, max: 20 },
  heading: { min: 20, recommended: 24, max: 32 },
  caption: { min: 12, recommended: 13, max: 14 },
  code: { min: 12, recommended: 14, max: 16 }
}
