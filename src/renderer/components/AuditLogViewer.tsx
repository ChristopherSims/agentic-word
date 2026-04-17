import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import { accessControlService } from '../../main/access-control-service'
import '../styles/audit-log-viewer.css'

interface AuditLogEntry {
  timestamp: number
  email: string
  action: string
  metadata?: Record<string, any>
}

export function AuditLogViewer() {
  const store = useAppStore()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([])
  const [actionFilter, setActionFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [stats, setStats] = useState<any>(null)
  const [selectedLog, setSelectedLog] = useState<number | null>(null)

  useEffect(() => {
    // Load audit logs
    const auditLogs = accessControlService.getAuditLog('current_doc', 1000)
    const formattedLogs = auditLogs.map((log) => ({
      timestamp: log.timestamp,
      email: log.userEmail,
      action: log.action,
      metadata: log.metadata,
    }))
    setLogs(formattedLogs)

    // Load statistics
    const auditStats = accessControlService.getAuditStats('current_doc')
    setStats(auditStats)

    // Apply filters
    applyFilters(formattedLogs, actionFilter, dateFilter)
  }, [])

  const applyFilters = (
    logsToFilter: AuditLogEntry[],
    action: string,
    date: string
  ) => {
    let filtered = logsToFilter

    // Action filter
    if (action !== 'all') {
      filtered = filtered.filter((log) => log.action === action)
    }

    // Date filter
    if (date !== 'all') {
      const now = Date.now()
      let cutoff = 0

      switch (date) {
        case '24h':
          cutoff = now - 24 * 60 * 60 * 1000
          break
        case '7d':
          cutoff = now - 7 * 24 * 60 * 60 * 1000
          break
        case '30d':
          cutoff = now - 30 * 24 * 60 * 60 * 1000
          break
      }

      filtered = filtered.filter((log) => log.timestamp >= cutoff)
    }

    setFilteredLogs(filtered)
  }

  const handleActionFilterChange = (action: string) => {
    setActionFilter(action)
    applyFilters(logs, action, dateFilter)
  }

  const handleDateFilterChange = (date: string) => {
    setDateFilter(date)
    applyFilters(logs, actionFilter, date)
  }

  const handleExportLog = () => {
    const csv = accessControlService.exportAuditLog('current_doc')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getActionIcon = (action: string) => {
    const icons: Record<string, string> = {
      view: '👁',
      edit: '✏',
      download: '⬇',
      share: '👥',
      permission_changed: '🔑',
      access_revoked: '🚫',
    }
    return icons[action] || '📝'
  }

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      view: 'Viewed document',
      edit: 'Edited document',
      download: 'Downloaded document',
      share: 'Shared document',
      permission_changed: 'Permission changed',
      access_revoked: 'Access revoked',
    }
    return labels[action] || action
  }

  return (
    <div className="audit-log-viewer">
      <div className="panel-header">
        <h2>Audit Log</h2>
        <button
          className="close-btn"
          onClick={() => store.setAuditLogViewerOpen(false)}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="panel-content">
        {/* Statistics */}
        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalAccess}</div>
              <div className="stat-label">Total Access Events</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.uniqueUsers}</div>
              <div className="stat-label">Unique Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {stats.lastAccess
                  ? Math.round((Date.now() - stats.lastAccess) / 60000)
                  : '-'}
              </div>
              <div className="stat-label">Last Access (min ago)</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="filter-bar">
          <div className="filter-group">
            <label>Action</label>
            <select
              value={actionFilter}
              onChange={(e) => handleActionFilterChange(e.target.value)}
              className="filter-select"
            >
              <option value="all">All actions</option>
              <option value="view">Viewed</option>
              <option value="edit">Edited</option>
              <option value="download">Downloaded</option>
              <option value="share">Shared</option>
              <option value="permission_changed">Permission changed</option>
              <option value="access_revoked">Access revoked</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Date Range</label>
            <select
              value={dateFilter}
              onChange={(e) => handleDateFilterChange(e.target.value)}
              className="filter-select"
            >
              <option value="all">All time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>

          <button className="btn btn-secondary" onClick={handleExportLog}>
            📥 Export CSV
          </button>
        </div>

        {/* Log List */}
        <div className="audit-log-list">
          {filteredLogs.length === 0 ? (
            <div className="empty-state">
              <p>No audit log entries found</p>
            </div>
          ) : (
            <>
              <div className="log-count">
                Showing {filteredLogs.length} of {logs.length} entries
              </div>
              {filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`log-entry ${selectedLog === index ? 'selected' : ''}`}
                  onClick={() => setSelectedLog(selectedLog === index ? null : index)}
                >
                  <div className="entry-icon">{getActionIcon(log.action)}</div>
                  <div className="entry-main">
                    <div className="entry-action">
                      <strong>{getActionLabel(log.action)}</strong>
                    </div>
                    <div className="entry-user">{log.email}</div>
                    <div className="entry-time">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="entry-arrow">
                    {selectedLog === index ? '▼' : '▶'}
                  </div>
                </div>
              ))}

              {selectedLog !== null && (
                <div className="log-details">
                  <h4>Details</h4>
                  <div className="details-content">
                    <p><strong>Action:</strong> {getActionLabel(filteredLogs[selectedLog].action)}</p>
                    <p><strong>User:</strong> {filteredLogs[selectedLog].email}</p>
                    <p>
                      <strong>Timestamp:</strong>{' '}
                      {new Date(filteredLogs[selectedLog].timestamp).toLocaleString()}
                    </p>
                    {filteredLogs[selectedLog].metadata && (
                      <div className="metadata">
                        <strong>Metadata:</strong>
                        <pre>{JSON.stringify(filteredLogs[selectedLog].metadata, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="section info-box">
          <h4>📋 Audit Log Information</h4>
          <ul>
            <li>All document access is logged automatically</li>
            <li>Logs are stored locally for privacy</li>
            <li>Export logs for compliance and analysis</li>
            <li>Retention period: 90 days (configurable)</li>
            <li>Logs cannot be edited or deleted manually</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
