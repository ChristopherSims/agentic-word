/**
 * Theme Manager - Handles dark mode detection, scheduling, and WCAG compliance
 */

export type ThemeMode = 'light' | 'dark' | 'auto'
export type AccessibilityMode = 'normal' | 'high-contrast' | 'eye-comfort' | 'deuteranopia' | 'protanopia' | 'tritanopia'

interface ThemeConfig {
  mode: ThemeMode
  useSystemPreference?: boolean
  scheduledDarkModeStart?: number
  scheduledDarkModeEnd?: number
}

/**
 * Detect system preference for dark mode
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  return darkModeQuery.matches ? 'dark' : 'light'
}

/**
 * Check if current time falls within scheduled dark mode window
 * Handles overnight schedules (e.g., 22:00 to 07:00)
 */
export function isInScheduledDarkMode(startHour: number, endHour: number): boolean {
  const now = new Date()
  const currentHour = now.getHours()

  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour
  } else {
    // Overnight window (e.g., 22:00 to 07:00)
    return currentHour >= startHour || currentHour < endHour
  }
}

/**
 * Get effective theme based on configuration
 */
export function getEffectiveTheme(config: ThemeConfig): 'light' | 'dark' {
  const { mode, useSystemPreference, scheduledDarkModeStart, scheduledDarkModeEnd } = config

  // Check scheduled dark mode if enabled
  if (scheduledDarkModeStart !== undefined && scheduledDarkModeEnd !== undefined) {
    if (isInScheduledDarkMode(scheduledDarkModeStart, scheduledDarkModeEnd)) {
      return 'dark'
    }
  }

  // Check explicit mode setting
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'

  // Auto mode: use system preference if enabled
  if (useSystemPreference) {
    return getSystemTheme()
  }

  return 'light'
}

/**
 * Get minutes until next theme change (for scheduling updates)
 */
export function getTimeUntilNextThemeChange(startHour: number, endHour: number): number {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  const nextChangeHour = isInScheduledDarkMode(startHour, endHour) ? endHour : startHour
  const minutesSinceHour = currentMinute
  const hoursUntilChange = (nextChangeHour - currentHour + 24) % 24

  return hoursUntilChange * 60 + (60 - minutesSinceHour)
}

/**
 * Listen for system theme changes
 */
export function onSystemThemeChange(callback: (theme: 'light' | 'dark') => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  
  const listener = (e: MediaQueryListEvent | MediaQueryList) => {
    callback(e.matches ? 'dark' : 'light')
  }

  // Support both modern and legacy API
  if (darkModeQuery.addEventListener) {
    darkModeQuery.addEventListener('change', listener as (e: MediaQueryListEvent) => void)
  } else {
    darkModeQuery.addListener(listener)
  }

  return () => {
    if (darkModeQuery.removeEventListener) {
      darkModeQuery.removeEventListener('change', listener as (e: MediaQueryListEvent) => void)
    } else {
      darkModeQuery.removeListener(listener)
    }
  }
}

/**
 * Convert hex color to RGB tuple
 */
export function getRGBFromHex(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 0]
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
}

/**
 * Calculate relative luminance per WCAG formula
 */
export function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(c => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Get contrast ratio between two colors (e.g., "7.5:1")
 */
export function getContrastRatio(foreground: string, background: string): string {
  const fgLuminance = getRelativeLuminance(getRGBFromHex(foreground))
  const bgLuminance = getRelativeLuminance(getRGBFromHex(background))

  const lighter = Math.max(fgLuminance, bgLuminance)
  const darker = Math.min(fgLuminance, bgLuminance)

  const ratio = (lighter + 0.05) / (darker + 0.05)
  return `${ratio.toFixed(1)}:1`
}

/**
 * Check WCAG AA compliance (4.5:1 normal, 3:1 large text)
 */
export function isWCAGAACompliant(foreground: string, background: string, isLargeText = false): boolean {
  const fgLuminance = getRelativeLuminance(getRGBFromHex(foreground))
  const bgLuminance = getRelativeLuminance(getRGBFromHex(background))

  const lighter = Math.max(fgLuminance, bgLuminance)
  const darker = Math.min(fgLuminance, bgLuminance)

  const ratio = (lighter + 0.05) / (darker + 0.05)
  const minRatio = isLargeText ? 3 : 4.5

  return ratio >= minRatio
}

/**
 * Check WCAG AAA compliance (7:1 normal, 4.5:1 large text)
 */
export function isWCAGAAACompliant(foreground: string, background: string, isLargeText = false): boolean {
  const fgLuminance = getRelativeLuminance(getRGBFromHex(foreground))
  const bgLuminance = getRelativeLuminance(getRGBFromHex(background))

  const lighter = Math.max(fgLuminance, bgLuminance)
  const darker = Math.min(fgLuminance, bgLuminance)

  const ratio = (lighter + 0.05) / (darker + 0.05)
  const minRatio = isLargeText ? 4.5 : 7

  return ratio >= minRatio
}

/**
 * Apply theme colors as CSS custom properties
 */
export function applyThemeVariables(colors: Record<string, string>): void {
  if (typeof document === 'undefined') return

  Object.entries(colors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--color-${key}`, value)
  })
}

/**
 * Validate accessibility configuration
 */
export function validateAccessibilityConfig(config: ThemeConfig): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []

  if (config.scheduledDarkModeStart !== undefined && config.scheduledDarkModeEnd !== undefined) {
    if (config.scheduledDarkModeStart === config.scheduledDarkModeEnd) {
      warnings.push('Scheduled dark mode start and end times are the same')
    }
  }

  return { valid: warnings.length === 0, warnings }
}
