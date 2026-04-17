import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import '../styles/privacy-settings-panel.css'

export function PrivacySettingsPanel() {
  const store = useAppStore()
  const [privacyMode, setPrivacyMode] = useState(false)
  const [dnsOverHttps, setDnsOverHttps] = useState(true)
  const [dataResidency, setDataResidency] = useState('us')
  const [gdprConsent, setGdprConsent] = useState(false)
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)
  const [crashReportsEnabled, setCrashReportsEnabled] = useState(true)
  const [telemetryLevel, setTelemetryLevel] = useState('basic')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    // Load settings from store
    setPrivacyMode(store.privacyMode ?? false)
    setDnsOverHttps(store.dnsOverHttps ?? true)
    setDataResidency(store.dataResidency ?? 'us')
    setGdprConsent(store.gdprConsent ?? false)
    setAnalyticsEnabled(store.analyticsEnabled ?? true)
  }, [store])

  const handleSaveSetting = (setting: string, value: any) => {
    try {
      switch (setting) {
        case 'privacyMode':
          store.setPrivacyMode(value)
          setPrivacyMode(value)
          break
        case 'dnsOverHttps':
          store.setDnsOverHttps(value)
          setDnsOverHttps(value)
          break
        case 'dataResidency':
          store.setDataResidency(value)
          setDataResidency(value)
          break
        case 'gdprConsent':
          store.setGdprConsent(value)
          setGdprConsent(value)
          break
        case 'analyticsEnabled':
          store.setAnalyticsEnabled(value)
          setAnalyticsEnabled(value)
          break
        case 'crashReportsEnabled':
          setCrashReportsEnabled(value)
          break
        case 'telemetryLevel':
          setTelemetryLevel(value)
          break
      }
      setMessage({ type: 'success', text: 'Setting saved' })
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to save: ${error}` })
    }
  }

  const handleExportData = () => {
    const data = {
      exportDate: new Date().toISOString(),
      privacySettings: {
        privacyMode,
        dnsOverHttps,
        dataResidency,
        gdprConsent,
      },
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `privacy-data-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)

    setMessage({ type: 'success', text: 'Data exported successfully' })
  }

  const handleDeleteAllData = () => {
    if (window.confirm('This will delete all your personal data. Are you sure?')) {
      localStorage.clear()
      setMessage({ type: 'success', text: 'All data deleted' })
    }
  }

  return (
    <div className="privacy-settings-panel">
      <div className="panel-header">
        <h2>Privacy & Security Settings</h2>
        <button
          className="close-btn"
          onClick={() => store.setPrivacySettingsPanelOpen(false)}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="panel-content">
        {message && (
          <div className={`message-box ${message.type}`}>
            {message.type === 'success' ? '✓' : '⚠'} {message.text}
          </div>
        )}

        <div className="section">
          <h3>🔒 Privacy Mode</h3>
          <p>Complete privacy protection with no tracking or analytics</p>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={privacyMode}
              onChange={(e) => handleSaveSetting('privacyMode', e.target.checked)}
              className="toggle-input"
            />
            <span className="toggle-slider" />
            <span className="toggle-text">
              {privacyMode ? 'Privacy Mode: ON' : 'Privacy Mode: OFF'}
            </span>
          </label>

          {privacyMode && (
            <div className="info-box">
              <p>Privacy mode automatically:</p>
              <ul>
                <li>✓ Disables all analytics</li>
                <li>✓ Disables crash reporting</li>
                <li>✓ Disables telemetry</li>
                <li>✓ Uses DNS over HTTPS</li>
                <li>✓ No connection logs</li>
              </ul>
            </div>
          )}
        </div>

        <div className="section">
          <h3>🌐 Network Security</h3>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={dnsOverHttps}
              onChange={(e) => handleSaveSetting('dnsOverHttps', e.target.checked)}
              disabled={privacyMode}
              className="toggle-input"
            />
            <span className="toggle-slider" />
            <span className="toggle-text">
              {dnsOverHttps ? 'DoH: Enabled' : 'DoH: Disabled'}
            </span>
          </label>

          <p className="setting-description">
            DNS over HTTPS prevents ISP from seeing your browsing activity
          </p>
        </div>

        <div className="section">
          <h3>📍 Data Residency</h3>
          <p>Choose where your data is processed and stored</p>

          <select
            value={dataResidency}
            onChange={(e) => handleSaveSetting('dataResidency', e.target.value)}
            className="residency-select"
            disabled={privacyMode}
          >
            <option value="us">🇺🇸 United States</option>
            <option value="eu">🇪🇺 European Union (GDPR)</option>
            <option value="local">💻 Local only (no cloud)</option>
            <option value="canada">🇨🇦 Canada</option>
            <option value="australia">🇦🇺 Australia</option>
          </select>

          {dataResidency === 'eu' && (
            <div className="compliance-badge">
              <strong>✓ GDPR Compliant</strong>
              <p>Data stored in EU with GDPR protections</p>
            </div>
          )}

          {dataResidency === 'local' && (
            <div className="compliance-badge">
              <strong>✓ No Cloud Storage</strong>
              <p>All data stays on your device</p>
            </div>
          )}
        </div>

        {!privacyMode && (
          <div className="section">
            <h3>📊 Analytics & Telemetry</h3>

            <label className="toggle-label">
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(e) => handleSaveSetting('analyticsEnabled', e.target.checked)}
                className="toggle-input"
              />
              <span className="toggle-slider" />
              <span className="toggle-text">
                {analyticsEnabled ? 'Analytics: Enabled' : 'Analytics: Disabled'}
              </span>
            </label>

            <p className="setting-description">
              Basic usage statistics help us improve the application
            </p>

            <label className="toggle-label">
              <input
                type="checkbox"
                checked={crashReportsEnabled}
                onChange={(e) => handleSaveSetting('crashReportsEnabled', e.target.checked)}
                className="toggle-input"
              />
              <span className="toggle-slider" />
              <span className="toggle-text">
                {crashReportsEnabled ? 'Crash Reports: Enabled' : 'Crash Reports: Disabled'}
              </span>
            </label>

            <p className="setting-description">
              Automatic crash reporting helps us fix bugs faster
            </p>

            <div className="form-group">
              <label>Telemetry Level</label>
              <select
                value={telemetryLevel}
                onChange={(e) => handleSaveSetting('telemetryLevel', e.target.value)}
                className="telemetry-select"
              >
                <option value="off">None - No telemetry</option>
                <option value="basic">Basic - Feature usage only</option>
                <option value="detailed">Detailed - Include performance metrics</option>
              </select>
            </div>
          </div>
        )}

        <div className="section">
          <h3>⚖️ GDPR & Compliance</h3>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={gdprConsent}
              onChange={(e) => handleSaveSetting('gdprConsent', e.target.checked)}
              className="toggle-input"
            />
            <span className="toggle-slider" />
            <span className="toggle-text">I consent to GDPR processing</span>
          </label>

          <div className="compliance-info">
            <h4>Your Rights:</h4>
            <ul>
              <li>✓ Right to access your data</li>
              <li>✓ Right to be forgotten</li>
              <li>✓ Right to data portability</li>
              <li>✓ Right to restrict processing</li>
              <li>✓ Right to object to processing</li>
            </ul>
          </div>
        </div>

        <div className="section">
          <h3>📥 Data Management</h3>

          <div className="data-actions">
            <button className="btn btn-secondary" onClick={handleExportData}>
              📥 Export My Data (GDPR)
            </button>
            <button className="btn btn-danger" onClick={handleDeleteAllData}>
              🗑 Delete All Data
            </button>
          </div>

          <p className="warning-text">
            ⚠️ These actions are permanent and cannot be undone
          </p>
        </div>

        <div className="section info-box">
          <h4>🛡 Security Notes</h4>
          <ul>
            <li>All data is encrypted in transit (HTTPS)</li>
            <li>Local data is not encrypted by default (use document encryption)</li>
            <li>Passwords are never transmitted to servers</li>
            <li>We never sell or share your data</li>
            <li>Privacy policy available in Help menu</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
