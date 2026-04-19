/** Format a timestamp as localized date + short time. */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5)
}

/** Count words and characters in HTML by stripping tags. */
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

/** Load a persisted setting from localStorage with a typed fallback (keys prefixed with 'aw-'). */
export function loadSetting<T extends string | number | boolean | Record<string, unknown> | unknown[] | null | undefined>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`aw-${key}`)
    if (stored !== null) return JSON.parse(stored) as T
  } catch { /* localStorage may be unavailable or contain corrupt JSON — fall back to default */ }
  return fallback
}

/** Save a setting to localStorage (keys prefixed with 'aw-'). Simple overload for Zustand actions. */
export function saveSetting<T extends string | number | boolean | Record<string, unknown> | unknown[] | null | undefined>(key: string, value: T): void
/** Save a setting to localStorage and update state (keys prefixed with 'aw-'). */
export function saveSetting<T extends string | number | boolean | Record<string, unknown> | unknown[] | null | undefined>(
  key: string,
  value: T,
  set: (partial: Record<string, unknown>) => void,
  stateFragment: Record<string, unknown>
): void
export function saveSetting<T extends string | number | boolean | Record<string, unknown> | unknown[] | null | undefined>(
  key: string,
  value: T,
  set?: (partial: Record<string, unknown>) => void,
  stateFragment?: Record<string, unknown>
): void {
  if (value !== undefined) {
    localStorage.setItem(`aw-${key}`, JSON.stringify(value))
  }
  if (set && stateFragment) {
    set(stateFragment)
  }
}

/** Check if a string is not empty after trimming. */
export function validateInput(value: string): boolean {
  return value.trim().length > 0
}
