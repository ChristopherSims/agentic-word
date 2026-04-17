import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import '../styles/backup-management.css'

interface BackupVersion {
  id: string
  timestamp: number
  documentTitle: string
  size: number
  version: string
  description?: string
}

export const BackupManagementPanel: React.FC = () => {
  const store = useAppStore()
  const [backups, setBackups] = useState<BackupVersion[]>([])
  const [selectedBackup, setSelectedBackup] = useState<BackupVersion | null>(null)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(store.autoBackupEnabled || false)
  const [backupFrequency, setBackupFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    store.backupFrequency || 'daily'
  )
  const [maxVersions, setMaxVersions] = useState(store.maxBackupVersions || 30)
  const [retentionDays, setRetentionDays] = useState(store.backupRetentionDays || 90)
  const [isRestoring, setIsRestoring] = useState(false)
  const [compareWith, setCompareWith] = useState<BackupVersion | null>(null)

  useEffect(() => {
    // Load backups
    loadBackups()
  }, [])

  const loadBackups = async () => {
    // In production, fetch from backup service
    const mockBackups: BackupVersion[] = [
      {
        id: 'backup_1',
        timestamp: Date.now() - 1000 * 60 * 60,
        documentTitle: 'Project Report',
        size: 45000,
        version: new Date(Date.now() - 1000 * 60 * 60).toLocaleString(),
      },
      {
        id: 'backup_2',
        timestamp: Date.now() - 1000 * 60 * 60 * 24,
        documentTitle: 'Project Report',
        size: 42000,
        version: new Date(Date.now() - 1000 * 60 * 60 * 24).toLocaleString(),
      },
      {
        id: 'backup_3',
        timestamp: Date.now() - 1000 * 60 * 60 * 48,
        documentTitle: 'Project Report',
        size: 38000,
        version: new Date(Date.now() - 1000 * 60 * 60 * 48).toLocaleString(),
      },
    ]
    setBackups(mockBackups)
  }

  const handleRestore = async (backup: BackupVersion) => {
    if (!window.confirm(`Restore backup from ${backup.version}?`)) {
      return
    }

    setIsRestoring(true)
    try {
      console.log(`Restoring backup ${backup.id}...`)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      store.addToast('success', `Restored backup from ${backup.version}`)
      setSelectedBackup(null)
    } catch (error) {
      store.addToast('error', 'Failed to restore backup')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleDeleteBackup = async (backup: BackupVersion) => {
    if (!window.confirm(`Delete backup from ${backup.version}?`)) {
      return
    }

    try {
      setBackups((prev) => prev.filter((b) => b.id !== backup.id))
      if (selectedBackup?.id === backup.id) {
        setSelectedBackup(null)
      }
      store.addToast('success', 'Backup deleted')
    } catch (error) {
      store.addToast('error', 'Failed to delete backup')
    }
  }

  const handleExportBackup = (backup: BackupVersion) => {
    try {
      const data = JSON.stringify(backup, null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_${backup.id}.json`
      a.click()
      URL.revokeObjectURL(url)
      store.addToast('success', 'Backup exported')
    } catch (error) {
      store.addToast('error', 'Failed to export backup')
    }
  }

  const handleToggleAutoBackup = () => {
    setAutoBackupEnabled(!autoBackupEnabled)
    store.setAutoBackupEnabled(!autoBackupEnabled)
  }

  const getBackupStats = () => {
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0)
    return {
      total: backups.length,
      size: totalSize,
      oldest: backups[backups.length - 1]?.version,
      newest: backups[0]?.version,
    }
  }

  const stats = getBackupStats()
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="backup-management-panel">
      <div className="panel-header">
        <h2>Backup Management</h2>
        <button
          className="close-btn"
          onClick={() => store.setBackupManagementPanelOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="settings-section">
        <h3>Backup Schedule</h3>
        <div className="setting-group">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={autoBackupEnabled}
              onChange={handleToggleAutoBackup}
            />
            Enable Automatic Backups
          </label>
          <p className="setting-description">
            Automatically create backups on a regular schedule
          </p>
        </div>

        {autoBackupEnabled && (
          <>
            <div className="setting-group">
              <label>Backup Frequency</label>
              <select
                value={backupFrequency}
                onChange={(e) => {
                  const freq = e.target.value as 'daily' | 'weekly' | 'monthly'
                  setBackupFrequency(freq)
                  store.setBackupFrequency(freq)
                }}
                className="input-field"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="setting-group">
              <label>Maximum Versions to Keep</label>
              <input
                type="number"
                min="1"
                max="100"
                value={maxVersions}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  setMaxVersions(val)
                  store.setMaxBackupVersions(val)
                }}
                className="input-field"
              />
              <p className="setting-description">
                Older backups will be automatically deleted
              </p>
            </div>

            <div className="setting-group">
              <label>Retention Period (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={retentionDays}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  setRetentionDays(val)
                  store.setBackupRetentionDays(val)
                }}
                className="input-field"
              />
              <p className="setting-description">
                Delete backups older than this period
              </p>
            </div>
          </>
        )}
      </div>

      <div className="settings-section">
        <h3>Backup Statistics</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Backups</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Size</div>
            <div className="stat-value">{formatBytes(stats.size)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Newest Backup</div>
            <div className="stat-value text-sm">{stats.newest}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Oldest Backup</div>
            <div className="stat-value text-sm">{stats.oldest}</div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Backup History</h3>
        <div className="backups-list">
          {backups.length === 0 ? (
            <p className="empty-state">No backups yet</p>
          ) : (
            backups.map((backup) => (
              <div
                key={backup.id}
                className={`backup-item ${selectedBackup?.id === backup.id ? 'selected' : ''}`}
                onClick={() => setSelectedBackup(backup)}
              >
                <div className="backup-info">
                  <div className="backup-time">{backup.version}</div>
                  <div className="backup-size">{formatBytes(backup.size)}</div>
                </div>
                <div className="backup-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRestore(backup)
                    }}
                    disabled={isRestoring}
                    title="Restore this backup"
                  >
                    Restore
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExportBackup(backup)
                    }}
                    title="Download backup file"
                  >
                    Export
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteBackup(backup)
                    }}
                    title="Delete this backup"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedBackup && compareWith && (
        <div className="settings-section">
          <h3>Backup Comparison</h3>
          <p className="setting-description">
            Comparing {selectedBackup.version} with {compareWith.version}
          </p>
          <div className="comparison-info">
            <div className="comparison-item">
              <strong>Size Difference:</strong>
              {formatBytes(Math.abs(selectedBackup.size - compareWith.size))}
            </div>
            <div className="comparison-item">
              <strong>Time Difference:</strong>
              {Math.round((selectedBackup.timestamp - compareWith.timestamp) / (1000 * 60))} minutes
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BackupManagementPanel
