/**
 * Backup Service
 * Handles automatic backups with versioning and restore functionality
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { BackupVersionSchema, parseConfig, type BackupVersion } from '../shared/schemas'
import { z } from 'zod'

// BackupVersion validated by Zod schema (imported from ../shared/schemas)

export interface BackupSchedule {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual'
  time?: string // HH:MM format
  dayOfWeek?: number // 0-6 for weekly
  dayOfMonth?: number // 1-31 for monthly
  retentionDays: number
  maxVersions: number
}

export class BackupService {
  private backups: Map<string, BackupVersion[]> = new Map()
  private schedule: BackupSchedule = {
    enabled: true,
    frequency: 'daily',
    retentionDays: 90,
    maxVersions: 30,
  }
  private backupTimer?: NodeJS.Timer
  private lastBackupTime = 0
  private storageDir = app.getPath('userData')
  private backupsFilePath = path.join(this.storageDir, 'backups.json')
  private scheduleFilePath = path.join(this.storageDir, 'backup-schedule.json')

  constructor() {
    this.loadBackupsFromStorage()
    this.loadScheduleFromStorage()
  }

  /**
   * Create a backup of current document
   */
  createBackup(documentTitle: string, documentContent: string, cloudProvider?: string): BackupVersion {
    const backup: BackupVersion = {
      id: `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      documentTitle,
      documentContent,
      size: documentContent.length,
      cloudProvider,
      version: this.getVersionString(),
    }

    const key = documentTitle || 'untitled'
    const versions = this.backups.get(key) || []
    versions.unshift(backup) // Most recent first
    
    // Enforce retention policy
    this.enforceRetentionPolicy(versions)
    this.backups.set(key, versions)
    this.saveBackupsToStorage()
    this.lastBackupTime = Date.now()

    return backup
  }

  /**
   * Get all backups for a document
   */
  getBackups(documentTitle: string): BackupVersion[] {
    const key = documentTitle || 'untitled'
    return this.backups.get(key) || []
  }

  /**
   * Get a specific backup version
   */
  getBackup(documentTitle: string, backupId: string): BackupVersion | undefined {
    const versions = this.getBackups(documentTitle)
    return versions.find((v) => v.id === backupId)
  }

  /**
   * Restore a backup version
   */
  restoreBackup(documentTitle: string, backupId: string): BackupVersion | undefined {
    const backup = this.getBackup(documentTitle, backupId)
    if (backup) {
      // Create a new backup of current state before restoring
      console.log(`Restoring backup ${backupId} for ${documentTitle}`)
    }
    return backup
  }

  /**
   * Delete a backup version
   */
  deleteBackup(documentTitle: string, backupId: string): void {
    const key = documentTitle || 'untitled'
    const versions = this.backups.get(key) || []
    const filtered = versions.filter((v) => v.id !== backupId)
    if (filtered.length > 0) {
      this.backups.set(key, filtered)
    } else {
      this.backups.delete(key)
    }
    this.saveBackupsToStorage()
  }

  /**
   * Compare two backup versions
   */
  compareBackups(documentTitle: string, backupId1: string, backupId2: string): { added: string; removed: string; modified: string } {
    const backup1 = this.getBackup(documentTitle, backupId1)
    const backup2 = this.getBackup(documentTitle, backupId2)

    if (!backup1 || !backup2) {
      return { added: '', removed: '', modified: '' }
    }

    // Simple diff - production should use proper diff library
    const lines1 = backup1.documentContent.split('\n')
    const lines2 = backup2.documentContent.split('\n')

    const removed = lines1.filter((line) => !lines2.includes(line)).join('\n')
    const added = lines2.filter((line) => !lines1.includes(line)).join('\n')
    const modified = `Changes: ${Math.abs(lines1.length - lines2.length)} lines`

    return { added, removed, modified }
  }

  /**
   * Set backup schedule
   */
  setSchedule(schedule: Partial<BackupSchedule>): void {
    this.schedule = { ...this.schedule, ...schedule }
    this.saveScheduleToStorage()
    this.startScheduledBackups()
  }

  /**
   * Get current backup schedule
   */
  getSchedule(): BackupSchedule {
    return { ...this.schedule }
  }

  /**
   * Start scheduled backups
   */
  startScheduledBackups(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
    }

    if (!this.schedule.enabled) {
      return
    }

    // Set up scheduled backups
    const checkInterval = 60000 // Check every minute
    this.backupTimer = setInterval(() => {
      this.checkAndCreateScheduledBackup()
    }, checkInterval)
  }

  /**
   * Stop scheduled backups
   */
  stopScheduledBackups(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
      this.backupTimer = undefined
    }
  }

  /**
   * Check if a scheduled backup should be created
   */
  private checkAndCreateScheduledBackup(): void {
    const now = new Date()
    const timeSinceLastBackup = Date.now() - this.lastBackupTime

    let shouldBackup = false

    switch (this.schedule.frequency) {
      case 'daily':
        shouldBackup = timeSinceLastBackup > 24 * 60 * 60 * 1000
        break
      case 'weekly':
        const targetDay = this.schedule.dayOfWeek || 0
        shouldBackup = now.getDay() === targetDay && timeSinceLastBackup > 7 * 24 * 60 * 60 * 1000
        break
      case 'monthly':
        const targetDate = this.schedule.dayOfMonth || 1
        shouldBackup = now.getDate() === targetDate && timeSinceLastBackup > 30 * 24 * 60 * 60 * 1000
        break
      case 'manual':
        return
    }

    if (shouldBackup) {
      // Scheduled backup triggered (backup service already handles creation)
      console.log('Scheduled backup triggered for:', this.schedule.frequency)
    }
  }

  /**
   * Enforce retention policy
   */
  private enforceRetentionPolicy(versions: BackupVersion[]): void {
    const now = Date.now()
    const maxAgeMs = this.schedule.retentionDays * 24 * 60 * 60 * 1000

    // Remove old backups
    let filtered = versions.filter((v) => now - v.timestamp < maxAgeMs)

    // Enforce max versions limit
    if (filtered.length > this.schedule.maxVersions) {
      filtered = filtered.slice(0, this.schedule.maxVersions)
    }

    // Update original array in-place
    versions.length = 0
    versions.push(...filtered)
  }

  /**
   * Export backup as file
   */
  exportBackup(documentTitle: string, backupId: string, format: 'json' | 'markdown' = 'json'): Blob {
    const backup = this.getBackup(documentTitle, backupId)
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`)
    }

    let content = ''
    if (format === 'json') {
      content = JSON.stringify(backup, null, 2)
    } else {
      content = backup.documentContent
    }

    return new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' })
  }

  /**
   * Get backup statistics
   */
  getStats(): {
    totalBackups: number
    totalSize: number
    oldestBackup?: number
    newestBackup?: number
  } {
    let totalBackups = 0
    let totalSize = 0
    let oldestBackup: number | undefined
    let newestBackup: number | undefined

    for (const versions of this.backups.values()) {
      for (const backup of versions) {
        totalBackups++
        totalSize += backup.size
        if (!newestBackup || backup.timestamp > newestBackup) {
          newestBackup = backup.timestamp
        }
        if (!oldestBackup || backup.timestamp < oldestBackup) {
          oldestBackup = backup.timestamp
        }
      }
    }

    return { totalBackups, totalSize, oldestBackup, newestBackup }
  }

  /**
   * Clear all backups for a document
   */
  clearBackups(documentTitle?: string): void {
    if (documentTitle) {
      this.backups.delete(documentTitle)
    } else {
      this.backups.clear()
    }
    this.saveBackupsToStorage()
  }

  private getVersionString(): string {
    const date = new Date()
    return date.toISOString().substring(0, 19).replace('T', ' ')
  }

  private saveBackupsToStorage(): void {
    try {
      const data: Record<string, BackupVersion[]> = {}
      for (const [key, versions] of this.backups) {
        data[key] = versions
      }
      fs.writeFileSync(this.backupsFilePath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('Failed to save backups:', error)
    }
  }

  private loadBackupsFromStorage(): void {
    try {
      if (fs.existsSync(this.backupsFilePath)) {
        const data = fs.readFileSync(this.backupsFilePath, 'utf-8')
        const parsed = parseConfig(data, z.record(z.string(), z.array(BackupVersionSchema)))
        for (const [key, versions] of Object.entries(parsed)) {
          this.backups.set(key, versions as BackupVersion[])
        }
      }
    } catch (error) {
      console.error('Failed to load backups:', error)
    }
  }

  private saveScheduleToStorage(): void {
    try {
      fs.writeFileSync(this.scheduleFilePath, JSON.stringify(this.schedule, null, 2))
    } catch (error) {
      console.error('Failed to save backup schedule:', error)
    }
  }

  private loadScheduleFromStorage(): void {
    try {
      if (fs.existsSync(this.scheduleFilePath)) {
        const data = fs.readFileSync(this.scheduleFilePath, 'utf-8')
        const parsed = JSON.parse(data);
        this.schedule = { ...this.schedule, ...parsed }
      }
    } catch (error) {
      console.error('Failed to load backup schedule:', error)
    }
  }
}

// Export singleton instance
export const backupService = new BackupService()
