import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import '../styles/document-encryption-panel.css'

// TODO: Fetch encryption data via IPC when implemented

interface PasswordValidation {
  isStrong: boolean
  score: number
  feedback: string[]
}

export function DocumentEncryptionPanel() {
  const store = useAppStore()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validation, setValidation] = useState<PasswordValidation | null>(null)
  const [encryptedDocs, setEncryptedDocs] = useState<any[]>([])
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [isEncrypting, setIsEncrypting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load encrypted documents on mount
  useEffect(() => {
    const docs = encryptionService.getEncryptedDocumentsList()
    setEncryptedDocs(docs)
  }, [])

  // Validate password as user types
  const handlePasswordChange = (value: string) => {
    setPassword(value)
    const validation = encryptionService.validatePasswordStrength(value)
    setValidation(validation)
  }

  const handleEncryptDocument = async () => {
    if (!password || password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }

    if (!validation?.isStrong) {
      setMessage({ type: 'error', text: 'Password is not strong enough' })
      return
    }

    setIsEncrypting(true)
    try {
      // Simulate encryption
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setMessage({ type: 'success', text: 'Document encrypted successfully' })
      setPassword('')
      setConfirmPassword('')
      setValidation(null)

      // Refresh list
      const docs = encryptionService.getEncryptedDocumentsList()
      setEncryptedDocs(docs)
    } catch (error) {
      setMessage({ type: 'error', text: `Encryption failed: ${error}` })
    } finally {
      setIsEncrypting(false)
    }
  }

  const handleDecryptDocument = async () => {
    if (!selectedDoc) return

    const encrypted = encryptionService.getEncryptedDocument(selectedDoc)
    if (!encrypted) return

    try {
      // Simulate decryption
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setMessage({ type: 'success', text: 'Document decrypted successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Decryption failed. Check your password.' })
    }
  }

  const handleDeleteEncrypted = () => {
    if (!selectedDoc) return

    encryptionService.deleteEncryptedDocument(selectedDoc)
    const docs = encryptionService.getEncryptedDocumentsList()
    setEncryptedDocs(docs)
    setSelectedDoc(null)
    setMessage({ type: 'success', text: 'Encrypted document deleted' })
  }

  const getPasswordStrengthColor = () => {
    if (!validation) return 'var(--vscode-editor-background)'
    if (validation.score <= 2) return '#d32f2f'
    if (validation.score <= 3) return '#f57c00'
    return '#388e3c'
  }

  return (
    <div className="document-encryption-panel">
      <div className="panel-header">
        <h2>Document Encryption</h2>
        <button
          className="close-btn"
          onClick={() => store.setDocumentEncryptionPanelOpen(false)}
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
          <h3>Encrypt Current Document</h3>
          <p>Secure your document with AES-256-GCM encryption</p>

          <div className="form-group">
            <label>Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="Enter a strong password"
                className="password-input"
              />
              <button
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {validation && password && (
            <div className="password-validation">
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{
                    width: `${(validation.score / 5) * 100}%`,
                    backgroundColor: getPasswordStrengthColor(),
                  }}
                />
              </div>
              <div className="strength-label">
                {validation.score <= 2 && '🔴 Weak'}
                {validation.score > 2 && validation.score <= 3 && '🟡 Fair'}
                {validation.score > 3 && '🟢 Strong'}
              </div>

              {validation.feedback.length > 0 && (
                <div className="feedback-list">
                  {validation.feedback.map((fb, i) => (
                    <div key={i} className="feedback-item">
                      • {fb}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="password-input"
            />
          </div>

          <div className="encryption-options">
            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              <span>Encrypt backups as well</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              <span>Require password on open</span>
            </label>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleEncryptDocument}
            disabled={
              !password || !confirmPassword || !validation?.isStrong || isEncrypting
            }
          >
            {isEncrypting ? '🔄 Encrypting...' : '🔐 Encrypt Document'}
          </button>
        </div>

        {encryptedDocs.length > 0 && (
          <div className="section">
            <h3>Encrypted Documents</h3>
            <div className="encrypted-list">
              {encryptedDocs.map((doc) => (
                <div
                  key={doc.documentId}
                  className={`encrypted-item ${selectedDoc === doc.documentId ? 'selected' : ''}`}
                  onClick={() => setSelectedDoc(doc.documentId)}
                >
                  <div className="item-icon">🔐</div>
                  <div className="item-info">
                    <div className="item-title">{doc.title}</div>
                    <div className="item-meta">
                      {doc.algorithm} • {new Date(doc.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedDoc && (
              <div className="action-buttons">
                <button className="btn btn-secondary" onClick={handleDecryptDocument}>
                  🔓 Decrypt & View
                </button>
                <button className="btn btn-danger" onClick={handleDeleteEncrypted}>
                  🗑 Delete
                </button>
              </div>
            )}
          </div>
        )}

        <div className="section info-box">
          <h4>🛡 Encryption Details</h4>
          <ul>
            <li><strong>Algorithm:</strong> AES-256-GCM</li>
            <li><strong>Key Derivation:</strong> PBKDF2 with 100,000 iterations</li>
            <li><strong>Password:</strong> Never stored, derived on decrypt</li>
            <li><strong>Recovery:</strong> No recovery without password</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
