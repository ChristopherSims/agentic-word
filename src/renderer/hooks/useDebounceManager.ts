import { useRef, useEffect, useCallback } from 'react'

type TimerKey = string

interface DebounceEntry {
  timer: ReturnType<typeof setTimeout> | null
  callback: (() => void) | null
}

/**
 * Manages multiple named debounce timers with automatic cleanup on unmount.
 * Replaces scattered useRef<ReturnType<typeof setTimeout>> patterns.
 *
 * Usage:
 *   const timers = useDebounceManager()
 *   timers.schedule('contentSync', () => saveContent(), 200)
 *   timers.schedule('stats', () => computeStats(), 1500)
 */
export function useDebounceManager() {
  const timers = useRef<Map<TimerKey, DebounceEntry>>(new Map())

  const schedule = useCallback((key: TimerKey, callback: () => void, delayMs: number) => {
    const entry = timers.current.get(key)
    if (entry?.timer) clearTimeout(entry.timer)
    timers.current.set(key, {
      timer: setTimeout(callback, delayMs),
      callback,
    })
  }, [])

  const cancel = useCallback((key: TimerKey) => {
    const entry = timers.current.get(key)
    if (entry?.timer) {
      clearTimeout(entry.timer)
      timers.current.delete(key)
    }
  }, [])

  const cancelAll = useCallback(() => {
    for (const [, entry] of timers.current) {
      if (entry.timer) clearTimeout(entry.timer)
    }
    timers.current.clear()
  }, [])

  useEffect(() => {
    return () => cancelAll()
  }, [cancelAll])

  return { schedule, cancel, cancelAll }
}
