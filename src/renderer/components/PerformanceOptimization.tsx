import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import '../styles/performance-optimization.css'

interface PerformanceStats {
  totalMetrics: number
  avgMemoryUsage: number
  peakMemoryUsage: number
  avgLoadTime: number
  avgSaveTime: number
  totalDocumentsProcessed: number
}

export const PerformanceOptimization: React.FC = () => {
  const store = useAppStore()
  const [localStats, setLocalStats] = useState<PerformanceStats>(store.performanceStats)
  const [isMonitoring, setIsMonitoring] = useState(false)

  useEffect(() => {
    if (!isMonitoring) return

    const interval = setInterval(() => {
      // Simulate performance monitoring
      const memoryUsage = Math.random() * 100
      const loadTime = Math.random() * 500
      const saveTime = Math.random() * 300

      setLocalStats((prev) => ({
        ...prev,
        totalMetrics: prev.totalMetrics + 1,
        avgMemoryUsage: (prev.avgMemoryUsage + memoryUsage) / 2,
        peakMemoryUsage: Math.max(prev.peakMemoryUsage, memoryUsage),
        avgLoadTime: (prev.avgLoadTime + loadTime) / 2,
        avgSaveTime: (prev.avgSaveTime + saveTime) / 2,
        totalDocumentsProcessed: prev.totalDocumentsProcessed + 1,
      }))
    }, 2000)

    return () => clearInterval(interval)
  }, [isMonitoring])

  const handleToggleVirtualScrolling = () => {
    store.setVirtualScrollingEnabled(!store.virtualScrollingEnabled)
  }

  const handleToggleLazyLoadMedia = () => {
    store.setLazyLoadMediaEnabled(!store.lazyLoadMediaEnabled)
  }

  const handleToggleDocumentCompression = () => {
    store.setDocumentCompressionEnabled(!store.documentCompressionEnabled)
  }

  const handleStartMonitoring = () => {
    setIsMonitoring(true)
  }

  const handleStopMonitoring = () => {
    setIsMonitoring(false)
  }

  const handleResetStats = () => {
    setLocalStats({
      totalMetrics: 0,
      avgMemoryUsage: 0,
      peakMemoryUsage: 0,
      avgLoadTime: 0,
      avgSaveTime: 0,
      totalDocumentsProcessed: 0,
    })
    store.setPerformanceStats({
      totalMetrics: 0,
      avgMemoryUsage: 0,
      peakMemoryUsage: 0,
      avgLoadTime: 0,
      avgSaveTime: 0,
      totalDocumentsProcessed: 0,
    })
  }

  return (
    <div className="performance-optimization">
      <div className="performance-header">
        <h2>Performance Optimization</h2>
        <button
          className="close-btn"
          onClick={() => store.setPerformanceDashboardOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="performance-section">
        <h3>Optimization Features</h3>
        <div className="feature-toggle">
          <label>
            <input
              type="checkbox"
              checked={store.virtualScrollingEnabled}
              onChange={handleToggleVirtualScrolling}
            />
            Virtual Scrolling
          </label>
          <span className="description">Render only visible content for large documents</span>
        </div>

        <div className="feature-toggle">
          <label>
            <input
              type="checkbox"
              checked={store.lazyLoadMediaEnabled}
              onChange={handleToggleLazyLoadMedia}
            />
            Lazy Load Media
          </label>
          <span className="description">Load images and media on demand</span>
        </div>

        <div className="feature-toggle">
          <label>
            <input
              type="checkbox"
              checked={store.documentCompressionEnabled}
              onChange={handleToggleDocumentCompression}
            />
            Document Compression
          </label>
          <span className="description">Compress documents to reduce memory usage</span>
        </div>
      </div>

      <div className="performance-section">
        <h3>Performance Monitoring</h3>
        <div className="monitoring-controls">
          <button
            className="btn btn-primary"
            onClick={handleStartMonitoring}
            disabled={isMonitoring}
          >
            Start Monitoring
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleStopMonitoring}
            disabled={!isMonitoring}
          >
            Stop Monitoring
          </button>
          <button className="btn btn-danger" onClick={handleResetStats}>
            Reset Stats
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Metrics</div>
            <div className="stat-value">{localStats.totalMetrics}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Avg Memory Usage</div>
            <div className="stat-value">{localStats.avgMemoryUsage.toFixed(2)} MB</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Peak Memory Usage</div>
            <div className="stat-value">{localStats.peakMemoryUsage.toFixed(2)} MB</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Avg Load Time</div>
            <div className="stat-value">{localStats.avgLoadTime.toFixed(2)} ms</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Avg Save Time</div>
            <div className="stat-value">{localStats.avgSaveTime.toFixed(2)} ms</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Documents Processed</div>
            <div className="stat-value">{localStats.totalDocumentsProcessed}</div>
          </div>
        </div>
      </div>

      <div className="performance-section">
        <h3>Cache Management</h3>
        <div className="cache-info">
          <p>Cache Size: {(store.cacheSize / 1024 / 1024).toFixed(2)} MB</p>
          <button className="btn btn-secondary">Clear Cache</button>
        </div>
      </div>
    </div>
  )
}

export default PerformanceOptimization
