import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import '../styles/cloud-settings-panel.css'

interface CloudProvider {
  name: string
  displayName: string
  isAuthenticated: boolean
  userEmail?: string
  storageUsed?: number
  storageQuota?: number
}

export const CloudSettingsPanel: React.FC = () => {
  const store = useAppStore()
  const [providers, setProviders] = useState<CloudProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [webdavUrl, setWebdavUrl] = useState('')
  const [webdavUsername, setWebdavUsername] = useState('')
  const [webdavPassword, setWebdavPassword] = useState('')
  const [syncEnabled, setSyncEnabled] = useState(store.autoSyncEnabled || false)
  const [syncInterval, setSyncInterval] = useState(store.syncInterval || 300) // seconds
  const [selectiveSyncFolders, setSelectiveSyncFolders] = useState<string[]>(
    store.selectiveSyncFolders || []
  )
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    // Load providers from service
    // This would be connected to actual cloud storage service
    setProviders([
      { name: 'dropbox', displayName: 'Dropbox', isAuthenticated: false },
      { name: 'google-drive', displayName: 'Google Drive', isAuthenticated: false },
      { name: 'onedrive', displayName: 'OneDrive', isAuthenticated: false },
      { name: 'webdav', displayName: 'Custom WebDAV', isAuthenticated: false },
    ])
  }, [])

  const handleAuthProvider = async (providerName: string) => {
    setIsSyncing(true)
    try {
      // Call cloud service to authenticate
      console.log(`Authenticating with ${providerName}...`)
      // Simulate auth
      await new Promise((resolve) => setTimeout(resolve, 1000))
      
      setSelectedProvider(providerName)
      setProviders((prev) =>
        prev.map((p) =>
          p.name === providerName
            ? { ...p, isAuthenticated: true, userEmail: 'user@example.com' }
            : p
        )
      )
      store.addToast('success', `Connected to ${providerName}`)
    } catch (error) {
      store.addToast('error', `Failed to connect to ${providerName}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDisconnect = async (providerName: string) => {
    try {
      setProviders((prev) =>
        prev.map((p) =>
          p.name === providerName ? { ...p, isAuthenticated: false, userEmail: undefined } : p
        )
      )
      if (selectedProvider === providerName) {
        setSelectedProvider(null)
      }
      store.addToast('success', `Disconnected from ${providerName}`)
    } catch (error) {
      store.addToast('error', 'Failed to disconnect')
    }
  }

  const handleWebDAVConfig = async () => {
    if (!webdavUrl || !webdavUsername || !webdavPassword) {
      store.addToast('error', 'Please fill in all WebDAV fields')
      return
    }

    try {
      setIsSyncing(true)
      // Configure and test WebDAV
      console.log('Configuring WebDAV:', webdavUrl)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      
      setSelectedProvider('webdav')
      setProviders((prev) =>
        prev.map((p) =>
          p.name === 'webdav'
            ? { ...p, isAuthenticated: true, userEmail: webdavUsername }
            : p
        )
      )
      store.addToast('success', 'WebDAV configured successfully')
    } catch (error) {
      store.addToast('error', 'Failed to configure WebDAV')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleToggleSync = () => {
    setSyncEnabled(!syncEnabled)
    store.setAutoSyncEnabled(!syncEnabled)
    if (!syncEnabled) {
      store.addToast('success', 'Auto-sync enabled')
    } else {
      store.addToast('info', 'Auto-sync disabled')
    }
  }

  const handleSyncNow = async () => {
    setIsSyncing(true)
    try {
      console.log('Syncing now...')
      await new Promise((resolve) => setTimeout(resolve, 2000))
      store.addToast('success', 'Sync completed successfully')
    } catch (error) {
      store.addToast('error', 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="cloud-settings-panel">
      <div className="panel-header">
        <h2>Cloud & Sync Settings</h2>
        <button
          className="close-btn"
          onClick={() => store.setCloudSettingsPanelOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="settings-section">
        <h3>Cloud Storage Provider</h3>
        <div className="provider-grid">
          {providers.map((provider) => (
            <div key={provider.name} className="provider-card">
              <div className="provider-header">
                <h4>{provider.displayName}</h4>
                {provider.isAuthenticated && (
                  <span className="status-badge authenticated">Connected</span>
                )}
              </div>

              {provider.isAuthenticated && provider.userEmail && (
                <p className="provider-email">{provider.userEmail}</p>
              )}

              {provider.name === 'webdav' && !provider.isAuthenticated && (
                <div className="webdav-config">
                  <input
                    type="text"
                    placeholder="Server URL (e.g., https://example.com/dav)"
                    value={webdavUrl}
                    onChange={(e) => setWebdavUrl(e.target.value)}
                    className="input-field"
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    value={webdavUsername}
                    onChange={(e) => setWebdavUsername(e.target.value)}
                    className="input-field"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={webdavPassword}
                    onChange={(e) => setWebdavPassword(e.target.value)}
                    className="input-field"
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleWebDAVConfig}
                    disabled={isSyncing}
                  >
                    Configure
                  </button>
                </div>
              )}

              {provider.isAuthenticated ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDisconnect(provider.name)}
                  disabled={isSyncing}
                >
                  Disconnect
                </button>
              ) : provider.name !== 'webdav' ? (
                <button
                  className="btn btn-primary"
                  onClick={() => handleAuthProvider(provider.name)}
                  disabled={isSyncing}
                >
                  Connect
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {selectedProvider && (
        <>
          <div className="settings-section">
            <h3>Auto-Sync Settings</h3>
            <div className="setting-group">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={handleToggleSync}
                  disabled={isSyncing}
                />
                Enable Auto-Sync
              </label>
              <p className="setting-description">
                Automatically sync documents with {providers.find(p => p.name === selectedProvider)?.displayName}
              </p>
            </div>

            {syncEnabled && (
              <div className="setting-group">
                <label>Sync Interval (seconds)</label>
                <input
                  type="number"
                  min="60"
                  max="3600"
                  step="60"
                  value={syncInterval}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    setSyncInterval(val)
                    store.setSyncInterval(val)
                  }}
                  className="input-field"
                />
                <p className="setting-description">
                  Sync every {syncInterval} seconds
                </p>
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3>Selective Sync</h3>
            <p className="setting-description">
              Choose which folders to sync
            </p>
            <div className="folder-selector">
              <label>
                <input
                  type="checkbox"
                  checked={selectiveSyncFolders.includes('documents')}
                  onChange={(e) => {
                    const folders = e.target.checked
                      ? [...selectiveSyncFolders, 'documents']
                      : selectiveSyncFolders.filter(f => f !== 'documents')
                    setSelectiveSyncFolders(folders)
                    store.setSelectiveSyncFolders(folders)
                  }}
                />
                Documents Folder
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectiveSyncFolders.includes('projects')}
                  onChange={(e) => {
                    const folders = e.target.checked
                      ? [...selectiveSyncFolders, 'projects']
                      : selectiveSyncFolders.filter(f => f !== 'projects')
                    setSelectiveSyncFolders(folders)
                    store.setSelectiveSyncFolders(folders)
                  }}
                />
                Projects Folder
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectiveSyncFolders.includes('archive')}
                  onChange={(e) => {
                    const folders = e.target.checked
                      ? [...selectiveSyncFolders, 'archive']
                      : selectiveSyncFolders.filter(f => f !== 'archive')
                    setSelectiveSyncFolders(folders)
                    store.setSelectiveSyncFolders(folders)
                  }}
                />
                Archive Folder
              </label>
            </div>
          </div>

          <div className="settings-section">
            <h3>Manual Sync</h3>
            <button
              className="btn btn-primary"
              onClick={handleSyncNow}
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </>
      )}

      <div className="settings-section">
        <h3>Conflict Resolution</h3>
        <div className="setting-group">
          <label>When conflicts occur:</label>
          <select defaultValue="last-write-wins" className="input-field">
            <option value="last-write-wins">Last-write wins (keep remote version)</option>
            <option value="keep-local">Keep local version</option>
            <option value="ask">Ask me each time</option>
          </select>
          <p className="setting-description">
            Automatically resolve sync conflicts using the selected strategy
          </p>
        </div>
      </div>
    </div>
  )
}

export default CloudSettingsPanel
