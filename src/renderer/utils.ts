/**
 * Shared utility functions for the renderer process.
 * Extracted from duplicated patterns across components and store.
 */

/**
 * Format a timestamp into a localized date + short time string.
 * Used in VcsPanel, CommentPanel, AgentWorkspacePanel.
 */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5)
}

/**
 * Count words and characters in an HTML string by stripping tags first.
 * Used in app-store (document content updates, pending changes, tab switching).
 */
export function countWords(html: string): { words: number; chars: number } {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text ? text.split(' ').filter((w) => w.length > 0).length : 0
  const chars = text.length
  return { words, chars }
}

/**
 * Load a persisted setting from localStorage with a typed fallback.
 * Keys are prefixed with 'aw-' automatically.
 */
export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`aw-${key}`)
    if (stored !== null) return JSON.parse(stored) as T
  } catch { /* localStorage may be unavailable or contain corrupt JSON — fall back to default */ }
  return fallback
}

/**
 * Save a setting to localStorage and return the zustand setter callback.
 * Keys are prefixed with 'aw-' automatically.
 * Usage: setTheme: (theme) => saveSetting('theme', theme, set, { theme })
 */
export function saveSetting<T>(
  key: string,
  value: T,
  set: (partial: Record<string, unknown>) => void,
  stateFragment: Record<string, unknown>
): void {
  localStorage.setItem(`aw-${key}`, JSON.stringify(value))
  set(stateFragment)
}
