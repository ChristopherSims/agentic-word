import { useRef, useCallback } from 'react'

/**
 * Caches a value and only reports changes when the value differs from previous.
 * Prevents unnecessary re-renders and IPC calls from repeated identical payloads.
 *
 * Usage:
 *   const cached = useCachedValue<string>()
 *   if (cached.hasChanged(newValue)) {
 *     cached.update(newValue)
 *     // trigger side effect
 *   }
 */
export function useCachedValue<T>() {
  const valueRef = useRef<T | undefined>(undefined)

  const hasChanged = useCallback((next: T): boolean => {
    return valueRef.current !== next
  }, [])

  const update = useCallback((next: T) => {
    valueRef.current = next
  }, [])

  const get = useCallback((): T | undefined => {
    return valueRef.current
  }, [])

  return { hasChanged, update, get }
}
