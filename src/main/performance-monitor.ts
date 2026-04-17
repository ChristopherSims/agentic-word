/**
 * Performance Monitoring Service
 * Tracks metrics: memory usage, load times, document size, save times
 * Provides analytics and historical data
 */

export interface PerformanceMetric {
  timestamp: number
  name: string
  value: number
  unit: string // 'ms', 'bytes', 'mb', '%'
  context?: string // document name, operation type
}

export interface MemoryMetrics {
  timestamp: number
  heapUsed: number // bytes
  heapTotal: number // bytes
  external: number // bytes
  rss: number // resident set size
  percentage: number // percentage of available memory
}

export interface LoadTimeMetric {
  timestamp: number
  documentName: string
  loadTime: number // ms
  fileSizeBytes: number
  compressionRatio: number
}

export interface SaveMetric {
  timestamp: number
  documentName: string
  saveTime: number // ms
  fileSizeBytes: number
  changesSizeBytes: number // incremental save only
  compressionRatio: number
}

export interface PerformanceStats {
  totalMetrics: number
  avgMemoryUsage: number
  peakMemoryUsage: number
  avgLoadTime: number
  avgSaveTime: number
  totalDocumentsProcessed: number
  memoryMetrics: MemoryMetrics[]
  loadMetrics: LoadTimeMetric[]
  saveMetrics: SaveMetric[]
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private memoryMetrics: MemoryMetrics[] = []
  private loadMetrics: LoadTimeMetric[] = []
  private saveMetrics: SaveMetric[] = []
  private maxHistorySize = 10000 // Keep last 10k metrics

  private memoryCheckInterval: NodeJS.Timer | null = null
  private memoryCheckIntervalMs = 5000 // Check every 5 seconds

  constructor() {
    this.startMemoryTracking()
  }

  /**
   * Start continuous memory tracking
   */
  private startMemoryTracking(): void {
    this.memoryCheckInterval = setInterval(() => {
      this.captureMemorySnapshot()
    }, this.memoryCheckIntervalMs)
  }

  /**
   * Capture current memory snapshot
   */
  private captureMemorySnapshot(): void {
    const memUsage = process.memoryUsage()
    const totalMemory = require('os').totalmem()
    const freeMemory = require('os').freemem()

    const metric: MemoryMetrics = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      percentage: ((memUsage.heapUsed / totalMemory) * 100)
    }

    this.memoryMetrics.push(metric)
    this.pruneIfNeeded()
  }

  /**
   * Track document load time
   */
  trackLoadTime(
    documentName: string,
    loadTimeMs: number,
    fileSizeBytes: number,
    compressionRatio: number = 1
  ): void {
    const metric: LoadTimeMetric = {
      timestamp: Date.now(),
      documentName,
      loadTime: loadTimeMs,
      fileSizeBytes,
      compressionRatio
    }
    this.loadMetrics.push(metric)
    this.pruneIfNeeded()
  }

  /**
   * Track document save time
   */
  trackSaveTime(
    documentName: string,
    saveTimeMs: number,
    fileSizeBytes: number,
    changesSizeBytes: number = 0,
    compressionRatio: number = 1
  ): void {
    const metric: SaveMetric = {
      timestamp: Date.now(),
      documentName,
      saveTime: saveTimeMs,
      fileSizeBytes,
      changesSizeBytes,
      compressionRatio
    }
    this.saveMetrics.push(metric)
    this.pruneIfNeeded()
  }

  /**
   * Track custom performance metric
   */
  trackMetric(
    name: string,
    value: number,
    unit: string = 'ms',
    context?: string
  ): void {
    const metric: PerformanceMetric = {
      timestamp: Date.now(),
      name,
      value,
      unit,
      context
    }
    this.metrics.push(metric)
    this.pruneIfNeeded()
  }

  /**
   * Get current memory usage
   */
  getCurrentMemory(): MemoryMetrics | undefined {
    return this.memoryMetrics.length > 0
      ? this.memoryMetrics[this.memoryMetrics.length - 1]
      : undefined
  }

  /**
   * Get memory metrics for time range
   */
  getMemoryRange(startTime: number, endTime: number): MemoryMetrics[] {
    return this.memoryMetrics.filter(m => m.timestamp >= startTime && m.timestamp <= endTime)
  }

  /**
   * Get load metrics for document
   */
  getLoadMetricsForDocument(documentName: string): LoadTimeMetric[] {
    return this.loadMetrics.filter(m => m.documentName === documentName)
  }

  /**
   * Get save metrics for document
   */
  getSaveMetricsForDocument(documentName: string): SaveMetric[] {
    return this.saveMetrics.filter(m => m.documentName === documentName)
  }

  /**
   * Get performance statistics
   */
  getStats(): PerformanceStats {
    const memoryValues = this.memoryMetrics.map(m => m.heapUsed)
    const loadTimes = this.loadMetrics.map(m => m.loadTime)
    const saveTimes = this.saveMetrics.map(m => m.saveTime)

    return {
      totalMetrics: this.metrics.length + this.memoryMetrics.length,
      avgMemoryUsage: memoryValues.length > 0
        ? memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length
        : 0,
      peakMemoryUsage: memoryValues.length > 0
        ? Math.max(...memoryValues)
        : 0,
      avgLoadTime: loadTimes.length > 0
        ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length
        : 0,
      avgSaveTime: saveTimes.length > 0
        ? saveTimes.reduce((a, b) => a + b, 0) / saveTimes.length
        : 0,
      totalDocumentsProcessed: new Set(this.loadMetrics.map(m => m.documentName)).size,
      memoryMetrics: this.memoryMetrics.slice(-100), // Last 100
      loadMetrics: this.loadMetrics.slice(-50), // Last 50
      saveMetrics: this.saveMetrics.slice(-50) // Last 50
    }
  }

  /**
   * Get recent metrics (last N)
   */
  getRecentMetrics(count: number = 50): PerformanceMetric[] {
    return this.metrics.slice(-count)
  }

  /**
   * Clear old metrics
   */
  private pruneIfNeeded(): void {
    const totalSize = this.metrics.length + this.memoryMetrics.length + this.loadMetrics.length + this.saveMetrics.length
    if (totalSize > this.maxHistorySize) {
      const keepRatio = 0.8
      const keepCount = Math.floor(this.maxHistorySize * keepRatio)
      
      if (this.metrics.length > keepCount) {
        this.metrics = this.metrics.slice(-keepCount)
      }
      if (this.memoryMetrics.length > keepCount) {
        this.memoryMetrics = this.memoryMetrics.slice(-keepCount)
      }
      if (this.loadMetrics.length > keepCount) {
        this.loadMetrics = this.loadMetrics.slice(-keepCount)
      }
      if (this.saveMetrics.length > keepCount) {
        this.saveMetrics = this.saveMetrics.slice(-keepCount)
      }
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = []
    this.memoryMetrics = []
    this.loadMetrics = []
    this.saveMetrics = []
  }

  /**
   * Stop monitoring
   */
  destroy(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval)
      this.memoryCheckInterval = null
    }
  }

  /**
   * Export stats as JSON
   */
  exportStats(): string {
    return JSON.stringify(this.getStats(), null, 2)
  }

  /**
   * Get memory usage as percentage string
   */
  getMemoryPercentage(): string {
    const current = this.getCurrentMemory()
    return current ? `${current.percentage.toFixed(2)}%` : 'N/A'
  }
}

// Singleton instance
let performanceMonitor: PerformanceMonitor | null = null

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor()
  }
  return performanceMonitor
}

export function destroyPerformanceMonitor(): void {
  if (performanceMonitor) {
    performanceMonitor.destroy()
    performanceMonitor = null
  }
}
