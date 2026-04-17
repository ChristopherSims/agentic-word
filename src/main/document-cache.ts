/**
 * Smart Document Cache
 * LRU cache with memory management
 */

export interface CacheEntry<T> {
  key: string
  value: T
  size: number
  lastAccess: number
  accessCount: number
  metadata?: Record<string, any>
}

export interface CacheStats {
  entries: number
  totalSize: number
  hitRate: number
  missRate: number
  avgAccessCount: number
}

export class DocumentCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number
  private hits = 0
  private misses = 0

  constructor(maxSizeBytes: number = 100 * 1024 * 1024) {
    // Default 100MB
    this.maxSize = maxSizeBytes
  }

  /**
   * Set cache entry
   */
  set(key: string, value: T, size: number, metadata?: Record<string, any>): void {
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      size,
      lastAccess: Date.now(),
      accessCount: 0,
      metadata
    }

    this.cache.set(key, entry)
    this.evictIfNeeded()
  }

  /**
   * Get cache entry
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key)

    if (entry) {
      entry.lastAccess = Date.now()
      entry.accessCount++
      this.hits++
      return entry.value
    }

    this.misses++
    return undefined
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key)
  }

  /**
   * Delete cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalSize = 0
    let totalAccess = 0
    const entries = this.cache.size

    this.cache.forEach((entry) => {
      totalSize += entry.size
      totalAccess += entry.accessCount
    })

    const totalRequests = this.hits + this.misses
    return {
      entries,
      totalSize,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.misses / totalRequests : 0,
      avgAccessCount: entries > 0 ? totalAccess / entries : 0
    }
  }

  /**
   * Get cache size in bytes
   */
  getTotalSize(): number {
    let total = 0
    this.cache.forEach((entry) => {
      total += entry.size
    })
    return total
  }

  /**
   * Get cached keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Evict entries if cache exceeds max size (LRU)
   */
  private evictIfNeeded(): void {
    let totalSize = this.getTotalSize()

    if (totalSize <= this.maxSize) return

    // Sort by last access (LRU)
    const entries = Array.from(this.cache.values()).sort(
      (a, b) => a.lastAccess - b.lastAccess
    )

    // Evict least recently used until under threshold
    const targetSize = this.maxSize * 0.8 // Keep at 80%
    for (const entry of entries) {
      if (totalSize <= targetSize) break
      this.cache.delete(entry.key)
      totalSize -= entry.size
    }
  }

  /**
   * Cleanup old entries (older than maxAge)
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs
    const keysToDelete: string[] = []

    this.cache.forEach((entry, key) => {
      if (entry.lastAccess < cutoff) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach((key) => this.cache.delete(key))
  }

  /**
   * Warm cache from array of entries
   */
  warmCache(entries: Array<{ key: string; value: T; size: number; metadata?: Record<string, any> }>): void {
    entries.forEach((entry) => {
      this.set(entry.key, entry.value, entry.size, entry.metadata)
    })
  }

  /**
   * Export cache for persistence
   */
  export(): Array<{ key: string; value: T; size: number; metadata?: Record<string, any> }> {
    return Array.from(this.cache.values()).map((entry) => ({
      key: entry.key,
      value: entry.value,
      size: entry.size,
      metadata: entry.metadata
    }))
  }
}

/**
 * Global document cache instance
 */
let globalCache: DocumentCache<any> | null = null

export function getDocumentCache(): DocumentCache<any> {
  if (!globalCache) {
    globalCache = new DocumentCache(100 * 1024 * 1024) // 100MB
  }
  return globalCache
}

export function resetDocumentCache(): void {
  if (globalCache) {
    globalCache.clear()
  }
}
