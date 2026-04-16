import { useState, useCallback } from 'react'
import { loadSetting, saveSetting } from '../utils'

/**
 * React hook for state that is persisted to localStorage under the 'aw-' prefix.
 * Replaces the repeated loadSetting + setState + localStorage.setItem pattern.
 *
 * @param key - Setting key (auto-prefixed with 'aw-')
 * @param fallback - Default value when no stored value exists
 * @returns [value, setValue] — setValue persists to localStorage on every call
 */
export function usePersistedState<T>(
  key: string,
  fallback: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => loadSetting(key, fallback))

  const setAndPersist = useCallback(
    (update: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = update instanceof Function ? update(prev) : update
        saveSetting(key, next, () => {}, {})
        return next
      })
    },
    [key]
  )

  return [value, setAndPersist]
}
