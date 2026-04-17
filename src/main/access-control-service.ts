/**
 * Access Control Service for Document Permissions and Sharing
 * Manages document permissions, sharing links, and access control
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

type Permission = 'view' | 'edit' | 'admin'

interface DocumentPermission {
  userId: string
  email: string
  permission: Permission
  grantedAt: number
  grantedBy: string
  revokedAt?: number
}

interface SharingLink {
  id: string
  documentId: string
  token: string
  permission: 'view' | 'edit'
  createdAt: number
  expiresAt?: number
  createdBy: string
  maxAccesses?: number
  accessCount: number
  password?: string
  isPasswordProtected: boolean
  watermarkEnabled: boolean
}

interface AccessRecord {
  documentId: string
  userId: string
  userEmail: string
  action: 'view' | 'edit' | 'download' | 'share' | 'permission_changed' | 'access_revoked'
  timestamp: number
  metadata?: Record<string, any>
}

export class AccessControlService {
  private static instance: AccessControlService
  private permissions: Map<string, DocumentPermission[]> = new Map()
  private sharingLinks: Map<string, SharingLink[]> = new Map()
  private accessLog: AccessRecord[] = []
  private currentUserId: string = 'user_' + Date.now()
  private storageDir = app.getPath('userData')
  private dataFilePath = path.join(this.storageDir, 'access-control.json')

  private constructor() {
    this.loadFromStorage()
  }

  static getInstance(): AccessControlService {
    if (!AccessControlService.instance) {
      AccessControlService.instance = new AccessControlService()
    }
    return AccessControlService.instance
  }

  /**
   * Grant permission to user
   */
  grantPermission(
    documentId: string,
    userId: string,
    email: string,
    permission: Permission,
    grantedBy: string
  ): DocumentPermission {
    const perm: DocumentPermission = {
      userId,
      email,
      permission,
      grantedAt: Date.now(),
      grantedBy,
    }

    if (!this.permissions.has(documentId)) {
      this.permissions.set(documentId, [])
    }

    // Update existing or add new
    const perms = this.permissions.get(documentId)!
    const existing = perms.findIndex((p) => p.userId === userId)
    if (existing >= 0) {
      perms[existing] = perm
    } else {
      perms.push(perm)
    }

    this.logAccess(documentId, userId, email, 'permission_changed', { permission })
    this.saveToStorage()

    return perm
  }

  /**
   * Revoke permission from user
   */
  revokePermission(documentId: string, userId: string): void {
    const perms = this.permissions.get(documentId)
    if (perms) {
      const perm = perms.find((p) => p.userId === userId)
      if (perm) {
        perm.revokedAt = Date.now()
        this.logAccess(documentId, userId, perm.email, 'access_revoked')
        this.saveToStorage()
      }
    }
  }

  /**
   * Get permissions for document
   */
  getPermissions(documentId: string): DocumentPermission[] {
    return (this.permissions.get(documentId) || []).filter((p) => !p.revokedAt)
  }

  /**
   * Check if user has permission to access document
   */
  hasPermission(
    documentId: string,
    userId: string,
    requiredPermission: Permission
  ): boolean {
    const perms = this.getPermissions(documentId)
    const perm = perms.find((p) => p.userId === userId)

    if (!perm) return false

    const levels: Record<Permission, number> = {
      view: 1,
      edit: 2,
      admin: 3,
    }

    return levels[perm.permission] >= levels[requiredPermission]
  }

  /**
   * Create shareable link with optional expiration
   */
  createSharingLink(
    documentId: string,
    permission: 'view' | 'edit',
    createdBy: string,
    options?: {
      expiresIn?: number // milliseconds
      maxAccesses?: number
      password?: string
      watermarkEnabled?: boolean
    }
  ): SharingLink {
    const link: SharingLink = {
      id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId,
      token: this.generateToken(),
      permission,
      createdAt: Date.now(),
      expiresAt: options?.expiresIn ? Date.now() + options.expiresIn : undefined,
      createdBy,
      maxAccesses: options?.maxAccesses,
      accessCount: 0,
      password: options?.password,
      isPasswordProtected: !!options?.password,
      watermarkEnabled: options?.watermarkEnabled ?? false,
    }

    if (!this.sharingLinks.has(documentId)) {
      this.sharingLinks.set(documentId, [])
    }

    this.sharingLinks.get(documentId)!.push(link)
    this.logAccess(documentId, 'system', 'system', 'share', { linkId: link.id })
    this.saveToStorage()

    return link
  }

  /**
   * Get sharing links for document
   */
  getSharingLinks(documentId: string): SharingLink[] {
    return this.sharingLinks.get(documentId) || []
  }

  /**
   * Revoke sharing link
   */
  revokeSharingLink(documentId: string, linkId: string): void {
    const links = this.sharingLinks.get(documentId)
    if (links) {
      const index = links.findIndex((l) => l.id === linkId)
      if (index >= 0) {
        links.splice(index, 1)
        this.saveToStorage()
      }
    }
  }

  /**
   * Validate sharing link (check expiration and max accesses)
   */
  validateSharingLink(link: SharingLink): {
    isValid: boolean
    reason?: string
  } {
    // Check expiration
    if (link.expiresAt && Date.now() > link.expiresAt) {
      return { isValid: false, reason: 'Link has expired' }
    }

    // Check max accesses
    if (link.maxAccesses && link.accessCount >= link.maxAccesses) {
      return { isValid: false, reason: 'Link access limit reached' }
    }

    return { isValid: true }
  }

  /**
   * Log access to document
   */
  logAccess(
    documentId: string,
    userId: string,
    userEmail: string,
    action: 'view' | 'edit' | 'download' | 'share' | 'permission_changed' | 'access_revoked',
    metadata?: Record<string, any>
  ): void {
    const record: AccessRecord = {
      documentId,
      userId,
      userEmail,
      action,
      timestamp: Date.now(),
      metadata,
    }

    this.accessLog.push(record)

    // Keep only last 1000 records per document
    const docLogs = this.accessLog.filter((r) => r.documentId === documentId)
    if (docLogs.length > 1000) {
      this.accessLog = this.accessLog.filter(
        (r) => !docLogs.slice(1000).includes(r)
      )
    }

    this.saveToStorage()
  }

  /**
   * Get audit log for document
   */
  getAuditLog(documentId: string, limit: number = 100): AccessRecord[] {
    return this.accessLog
      .filter((r) => r.documentId === documentId)
      .slice(-limit)
      .reverse()
  }

  /**
   * Get audit log statistics
   */
  getAuditStats(documentId: string): {
    totalAccess: number
    uniqueUsers: number
    lastAccess: number
    actions: Record<string, number>
  } {
    const logs = this.accessLog.filter((r) => r.documentId === documentId)
    const uniqueUsers = new Set(logs.map((r) => r.userId)).size
    const actions: Record<string, number> = {}

    logs.forEach((log) => {
      actions[log.action] = (actions[log.action] || 0) + 1
    })

    return {
      totalAccess: logs.length,
      uniqueUsers,
      lastAccess: logs.length > 0 ? logs[logs.length - 1].timestamp : 0,
      actions,
    }
  }

  /**
   * Export audit log as CSV
   */
  exportAuditLog(documentId: string): string {
    const logs = this.getAuditLog(documentId, 10000)

    let csv = 'Timestamp,User Email,Action,Metadata\n'
    logs.forEach((log) => {
      const timestamp = new Date(log.timestamp).toISOString()
      const metadata = JSON.stringify(log.metadata || {})
      csv += `${timestamp},"${log.userEmail}","${log.action}","${metadata}"\n`
    })

    return csv
  }

  /**
   * Get watermark info for document
   */
  getWatermarkInfo(documentId: string, userId: string): {
    text: string
    opacity: number
    angle: number
  } {
    return {
      text: `Confidential - ${userId}`,
      opacity: 0.15,
      angle: -45,
    }
  }

  /**
   * Set current user ID
   */
  setCurrentUserId(userId: string): void {
    this.currentUserId = userId
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string {
    return this.currentUserId
  }

  /**
   * Clear all data (testing/reset)
   */
  clearAllData(): void {
    this.permissions.clear()
    this.sharingLinks.clear()
    this.accessLog = []
    try {
      if (fs.existsSync(this.dataFilePath)) {
        fs.unlinkSync(this.dataFilePath)
      }
    } catch (error) {
      console.error('Failed to clear access control data:', error)
    }
  }

  /**
   * Helper: Generate random token for sharing links
   */
  private generateToken(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let token = ''
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return token
  }

  /**
   * Save to storage
   */
  private saveToStorage(): void {
    const data = {
      permissions: Array.from(this.permissions.entries()),
      sharingLinks: Array.from(this.sharingLinks.entries()),
      accessLog: this.accessLog,
    }
    try {
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('Failed to save access control data:', error)
    }
  }

  /**
   * Load from storage
   */
  private loadFromStorage(): void {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'))
        this.permissions = new Map(data.permissions || [])
        this.sharingLinks = new Map(data.sharingLinks || [])
        this.accessLog = data.accessLog || []
      }
    } catch (error) {
      console.error('Failed to load access control data:', error)
    }
  }
}

export const accessControlService = AccessControlService.getInstance()
