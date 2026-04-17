import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import '../styles/access-control-panel.css'

// TODO: Fetch access control data via IPC when implemented

type Permission = 'view' | 'edit' | 'admin'

interface SharedUser {
  userId: string
  email: string
  permission: Permission
  grantedAt: number
}

export function AccessControlPanel() {
  const store = useAppStore()
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<Permission>('view')
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([])
  const [sharingLinks, setSharingLinks] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [linkExpiry, setLinkExpiry] = useState('7days')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  useEffect(() => {
    // Load shared users and links
    const users = accessControlService.getPermissions('current_doc')
    setSharedUsers(
      users.map((u) => ({
        userId: u.userId,
        email: u.email,
        permission: u.permission,
        grantedAt: u.grantedAt,
      }))
    )

    const links = accessControlService.getSharingLinks('current_doc')
    setSharingLinks(links)
  }, [])

  const handleShareWithUser = async () => {
    if (!email || !email.includes('@')) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' })
      return
    }

    setIsSharing(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 800))

      accessControlService.grantPermission(
        'current_doc',
        `user_${email}`,
        email,
        permission,
        'current_user'
      )

      const users = accessControlService.getPermissions('current_doc')
      setSharedUsers(
        users.map((u) => ({
          userId: u.userId,
          email: u.email,
          permission: u.permission,
          grantedAt: u.grantedAt,
        }))
      )

      setMessage({ type: 'success', text: `Shared with ${email}` })
      setEmail('')
      setPermission('view')
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to share: ${error}` })
    } finally {
      setIsSharing(false)
    }
  }

  const handleCreateSharingLink = async () => {
    setIsSharing(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 800))

      const expiryMs = linkExpiry === '7days' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000

      const link = accessControlService.createSharingLink(
        'current_doc',
        'view',
        'current_user',
        { expiresIn: expiryMs }
      )

      const links = accessControlService.getSharingLinks('current_doc')
      setSharingLinks(links)

      setMessage({ type: 'success', text: 'Sharing link created' })
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to create link: ${error}` })
    } finally {
      setIsSharing(false)
    }
  }

  const handleRevoke = (userId: string) => {
    accessControlService.revokePermission('current_doc', userId)
    const users = accessControlService.getPermissions('current_doc')
    setSharedUsers(
      users.map((u) => ({
        userId: u.userId,
        email: u.email,
        permission: u.permission,
        grantedAt: u.grantedAt,
      }))
    )
    setMessage({ type: 'success', text: 'Access revoked' })
    setSelectedUser(null)
  }

  const handleRevokeLink = (linkId: string) => {
    accessControlService.revokeSharingLink('current_doc', linkId)
    const links = accessControlService.getSharingLinks('current_doc')
    setSharingLinks(links)
    setMessage({ type: 'success', text: 'Sharing link revoked' })
  }

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/shared/${token}`
    navigator.clipboard.writeText(url)
    setMessage({ type: 'success', text: 'Link copied to clipboard' })
  }

  return (
    <div className="access-control-panel">
      <div className="panel-header">
        <h2>Access Control & Sharing</h2>
        <button
          className="close-btn"
          onClick={() => store.setAccessControlPanelOpen(false)}
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
          <h3>Share with Users</h3>
          <p>Grant access to specific people</p>

          <div className="share-form">
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="email-input"
              />
            </div>

            <div className="form-group">
              <label>Permission</label>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as Permission)}
                className="permission-select"
              >
                <option value="view">👁 View only</option>
                <option value="edit">✏ Can edit</option>
                <option value="admin">👑 Admin</option>
              </select>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleShareWithUser}
              disabled={!email || isSharing}
            >
              {isSharing ? '⏳ Sharing...' : '👥 Share'}
            </button>
          </div>

          {sharedUsers.length > 0 && (
            <div className="shared-users-list">
              <h4>Shared With ({sharedUsers.length})</h4>
              {sharedUsers.map((user) => (
                <div
                  key={user.userId}
                  className={`shared-user ${selectedUser === user.userId ? 'selected' : ''}`}
                  onClick={() => setSelectedUser(user.userId)}
                >
                  <div className="user-icon">👤</div>
                  <div className="user-info">
                    <div className="user-email">{user.email}</div>
                    <div className="permission-badge">
                      {user.permission === 'view' && '👁 View'}
                      {user.permission === 'edit' && '✏ Edit'}
                      {user.permission === 'admin' && '👑 Admin'}
                    </div>
                  </div>
                  {selectedUser === user.userId && (
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => handleRevoke(user.userId)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h3>Public Sharing Links</h3>
          <p>Create link-based sharing (optional password protection)</p>

          <div className="link-form">
            <div className="form-group">
              <label>Link Expiry</label>
              <select
                value={linkExpiry}
                onChange={(e) => setLinkExpiry(e.target.value)}
                className="expiry-select"
              >
                <option value="1day">1 day</option>
                <option value="7days">7 days</option>
                <option value="30days">30 days</option>
                <option value="never">Never expires</option>
              </select>
            </div>

            <label className="checkbox-label">
              <input type="checkbox" />
              <span>Require password to view</span>
            </label>

            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              <span>Add watermark to shared copies</span>
            </label>

            <button
              className="btn btn-primary"
              onClick={handleCreateSharingLink}
              disabled={isSharing}
            >
              {isSharing ? '⏳ Creating...' : '🔗 Create Link'}
            </button>
          </div>

          {sharingLinks.length > 0 && (
            <div className="sharing-links-list">
              <h4>Active Links ({sharingLinks.length})</h4>
              {sharingLinks.map((link) => (
                <div key={link.id} className="sharing-link-item">
                  <div className="link-icon">🔗</div>
                  <div className="link-info">
                    <div className="link-type">
                      {link.permission === 'view' ? '👁 View only' : '✏ Can edit'}
                    </div>
                    <div className="link-expiry">
                      {link.expiresAt
                        ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
                        : 'Never expires'}
                    </div>
                    <div className="link-accesses">
                      {link.accessCount} {link.accessCount === 1 ? 'access' : 'accesses'}
                    </div>
                  </div>
                  <div className="link-actions">
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => handleCopyLink(link.token)}
                      title="Copy link"
                    >
                      📋 Copy
                    </button>
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => handleRevokeLink(link.id)}
                      title="Revoke link"
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section info-box">
          <h4>📋 Permission Levels</h4>
          <ul>
            <li><strong>View:</strong> Read-only access, no modifications</li>
            <li><strong>Edit:</strong> Can modify content and see changes</li>
            <li><strong>Admin:</strong> Full control, manage permissions</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
