import { useRef, useCallback, useEffect } from 'react'

/**
 * Auto-dismiss a dropdown/menu when the mouse leaves it for `durationMs`.
 * Returns { onMouseEnter, onMouseLeave } handlers to attach to the menu element.
 * Pass a `close` function that dismisses the menu.
 */
export function useHoverDismiss(close: () => void, durationMs: number = 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onMouseEnter = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onMouseLeave = useCallback(() => {
    timerRef.current = setTimeout(() => {
      close()
    }, durationMs)
  }, [close, durationMs])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { onMouseEnter, onMouseLeave }
}
