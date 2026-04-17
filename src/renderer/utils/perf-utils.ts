/**
 * Performance Utilities
 * Debouncing, throttling, and lazy loading helpers
 */

/**
 * Debounce function calls
 * Waits `delay` ms after last invocation before executing
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      func(...args)
      timeoutId = null
    }, delay)
  }
}

/**
 * Debounce with promise (for async functions)
 */
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  func: T,
  delay: number
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastPromise: Promise<any> | null = null

  return async function debounced(...args: Parameters<T>): Promise<any> {
    if (timeoutId) clearTimeout(timeoutId)

    return new Promise((resolve) => {
      timeoutId = setTimeout(async () => {
        try {
          lastPromise = func(...args)
          const result = await lastPromise
          resolve(result)
        } catch (error) {
          console.error('Debounced async function error:', error)
        }
        timeoutId = null
      }, delay)
    })
  }
}

/**
 * Throttle function calls
 * Executes at most once every `delay` ms
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0

  return function throttled(...args: Parameters<T>) {
    const now = Date.now()
    if (now - lastCall >= delay) {
      func(...args)
      lastCall = now
    }
  }
}

/**
 * Batch function calls
 * Collects calls and executes once per animation frame
 */
export function batch<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => void {
  let pending = false
  let lastArgs: Parameters<T> | null = null

  return function batched(...args: Parameters<T>) {
    lastArgs = args

    if (!pending) {
      pending = true
      requestAnimationFrame(() => {
        if (lastArgs) {
          func(...lastArgs)
        }
        pending = false
      })
    }
  }
}

/**
 * Memoize function results (cache based on arguments)
 */
export function memoize<T extends (...args: any[]) => any>(
  func: T,
  options?: { maxSize?: number; ttl?: number }
): T {
  const cache = new Map<string, { value: any; timestamp: number }>()
  const maxSize = options?.maxSize ?? 100
  const ttl = options?.ttl ?? Infinity

  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args)
    const cached = cache.get(key)

    if (cached) {
      const age = Date.now() - cached.timestamp
      if (age < ttl) {
        return cached.value
      }
      cache.delete(key)
    }

    const result = func(...args)
    cache.set(key, { value: result, timestamp: Date.now() })

    // LRU eviction
    if (cache.size > maxSize) {
      const firstKey = cache.keys().next().value
      cache.delete(firstKey)
    }

    return result
  }) as T
}

/**
 * Lazy load element (Intersection Observer)
 * Useful for images/iframes/heavy content
 */
export function lazyLoad(
  element: HTMLElement,
  onVisible: () => void | Promise<void>,
  options?: IntersectionObserverInit
): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          onVisible()
          observer.unobserve(element)
        }
      })
    },
    {
      rootMargin: '50px',
      ...options
    }
  )

  observer.observe(element)

  // Return cleanup function
  return () => observer.disconnect()
}

/**
 * Request idle callback polyfill
 * Schedules work during idle time
 */
export function scheduleIdleWork(callback: () => void): number {
  if ('requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(callback)
  } else {
    return setTimeout(callback, 0)
  }
}

/**
 * Cancel idle work
 */
export function cancelIdleWork(id: number): void {
  if ('cancelIdleCallback' in window) {
    (window as any).cancelIdleCallback(id)
  } else {
    clearTimeout(id)
  }
}

/**
 * Measure performance of a function
 */
export async function measurePerf<T>(
  name: string,
  fn: () => Promise<T> | T
): Promise<{ result: T; duration: number }> {
  const start = performance.now()
  const result = await Promise.resolve().then(() => fn())
  const duration = performance.now() - start
  
  console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`)
  
  return { result, duration }
}
