/**
 * Tracks intervals and timeouts for cleanup.
 * Prevents memory leaks from undisposed timers.
 *
 * Usage:
 *   import { globalIntervalManager } from './interval-manager'
 *   const timer = globalIntervalManager.setInterval(() => { ... }, 5000)
 *   // On app quit: globalIntervalManager.clearAll()
 */
export class IntervalManager {
  private intervals: Set<ReturnType<typeof setInterval>> = new Set()
  private timeouts: Set<ReturnType<typeof setTimeout>> = new Set()

  setInterval(callback: () => void, ms: number): ReturnType<typeof setInterval> {
    const id = globalThis.setInterval(callback, ms)
    this.intervals.add(id)
    return id
  }

  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = globalThis.setTimeout(callback, ms)
    this.timeouts.add(id)
    return id
  }

  clearInterval(id: ReturnType<typeof setInterval>): void {
    globalThis.clearInterval(id)
    this.intervals.delete(id)
  }

  clearTimeout(id: ReturnType<typeof setTimeout>): void {
    globalThis.clearTimeout(id)
    this.timeouts.delete(id)
  }

  clearAll(): void {
    for (const id of this.intervals) globalThis.clearInterval(id)
    for (const id of this.timeouts) globalThis.clearTimeout(id)
    this.intervals.clear()
    this.timeouts.clear()
  }

  get activeCount(): number {
    return this.intervals.size + this.timeouts.size
  }
}

export const globalIntervalManager = new IntervalManager()
