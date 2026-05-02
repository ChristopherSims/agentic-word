/**
 * Debounced callback hook — delays execution until `delayMs` after the last invocation.
 * Useful for auto-save, search-as-you-type, and sync throttling.
 *
 * Usage:
 *   const debouncedSave = useDebouncedCallback(saveDocument, 2000)
 *   // Call as often as you want — saveDocument only fires after 2s of inactivity
 */

import { useRef, useCallback } from 'react'

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delayMs: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return useCallback(
    ((...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => callback(...args), delayMs)
    }) as T,
    [callback, delayMs],
  )
}
