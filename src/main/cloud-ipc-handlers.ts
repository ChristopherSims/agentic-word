/**
 * Cloud & Sync IPC Handlers
 * Wire up OAuth, cloud storage, and sync operations
 */

import { ipcMain, BrowserWindow } from 'electron'
import { oauthService, type AuthToken } from './oauth-service'
import { cloudStorageService, type SyncConflict, type CloudFile } from './cloud-storage-service'
import { backupService } from './backup-service'

export interface SyncStatus {
  isEnabled: boolean
  isSyncing: boolean
  isOffline: boolean
  queueSize: number
  lastSyncTime?: number
  nextSyncTime?: number
}

export interface ProviderStatus {
  provider: string
  isAuthenticated: boolean
  displayName: string
  userEmail?: string
  storageUsed?: number
  storageQuota?: number
  lastSyncTime?: number
  syncStatus?: 'idle' | 'syncing' | 'error'
  lastError?: string
}

// Track sync status for all providers
const providerStatuses: Map<string, ProviderStatus> = new Map()
let syncTimers: Map<string, NodeJS.Timeout> = new Map()

/**
 * Register all cloud & sync IPC handlers
 */
export function registerCloudIpcHandlers(mainWindow: BrowserWindow): void {
  /**
   * OAuth: Start authentication flow
   */
  ipcMain.handle('cloud:auth-start', async (_event, provider: string) => {
    try {
      const token = await oauthService.startOAuthFlow(provider, mainWindow)
      const status: ProviderStatus = {
        provider,
        isAuthenticated: true,
        displayName: provider,
        syncStatus: 'idle'
      }
      providerStatuses.set(provider, status)
      mainWindow.webContents.send('cloud:status-changed', Array.from(providerStatuses.values()))
      return { success: true, token }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * OAuth: Check authentication status
   */
  ipcMain.handle('cloud:auth-status', async (_event, provider: string) => {
    const isAuth = oauthService.isAuthenticated(provider)
    const status = providerStatuses.get(provider)
    return {
      isAuthenticated: isAuth,
      displayName: status?.displayName || provider,
      lastSyncTime: status?.lastSyncTime
    }
  })

  /**
   * OAuth: Disconnect provider
   */
  ipcMain.handle('cloud:disconnect', async (_event, provider: string) => {
    try {
      await oauthService.disconnect(provider)
      await cloudStorageService.disconnect(provider)
      providerStatuses.delete(provider)
      if (syncTimers.has(provider)) {
        clearInterval(syncTimers.get(provider)!)
        syncTimers.delete(provider)
      }
      mainWindow.webContents.send('cloud:status-changed', Array.from(providerStatuses.values()))
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Sync: Start automatic sync
   */
  ipcMain.handle('cloud:sync-start', async (_event, provider: string, interval: number) => {
    try {
      await oauthService.getAccessToken(provider)
      
      // Stop existing timer if any
      if (syncTimers.has(provider)) {
        clearInterval(syncTimers.get(provider)!)
      }

      // Update status
      const status = providerStatuses.get(provider) || {
        provider,
        isAuthenticated: true,
        displayName: provider,
        syncStatus: 'idle'
      }
      status.syncStatus = 'syncing'
      providerStatuses.set(provider, status)

      // Start sync cycle
      const timer = setInterval(async () => {
        try {
          status.syncStatus = 'syncing'
          await cloudStorageService.startSync()
          status.lastSyncTime = Date.now()
          status.syncStatus = 'idle'
        } catch (error) {
          status.syncStatus = 'error'
          status.lastError = (error as Error).message
          console.error(`Sync error for ${provider}:`, error)
        }
        mainWindow.webContents.send('cloud:status-changed', Array.from(providerStatuses.values()))
      }, interval * 1000)

      syncTimers.set(provider, timer)
      mainWindow.webContents.send('cloud:status-changed', Array.from(providerStatuses.values()))
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Sync: Stop automatic sync
   */
  ipcMain.handle('cloud:sync-stop', async (_event, provider: string) => {
    try {
      if (syncTimers.has(provider)) {
        clearInterval(syncTimers.get(provider)!)
        syncTimers.delete(provider)
      }
      cloudStorageService.stopSync()
      const status = providerStatuses.get(provider)
      if (status) {
        status.syncStatus = 'idle'
        mainWindow.webContents.send('cloud:status-changed', Array.from(providerStatuses.values()))
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Sync: Get current sync status
   */
  ipcMain.handle('cloud:sync-status', async () => {
    const providers = Array.from(providerStatuses.values())
    const isSyncing = providers.some((p) => p.syncStatus === 'syncing')
    const hasError = providers.some((p) => p.syncStatus === 'error')
    
    return {
      providers,
      isSyncing,
      hasError,
      queueSize: cloudStorageService.getSyncStatus().queueSize
    }
  })

  /**
   * Sync: Force immediate sync
   */
  ipcMain.handle('cloud:sync-now', async (_event, provider: string) => {
    try {
      const status = providerStatuses.get(provider)
      if (status) status.syncStatus = 'syncing'
      
      await cloudStorageService.startSync()
      
      if (status) {
        status.lastSyncTime = Date.now()
        status.syncStatus = 'idle'
      }
      mainWindow.webContents.send('cloud:status-changed', Array.from(providerStatuses.values()))
      return { success: true }
    } catch (error) {
      if (status) {
        status.syncStatus = 'error'
        status.lastError = (error as Error).message
      }
      mainWindow.webContents.send('cloud:status-changed', Array.from(providerStatuses.values()))
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Sync: Check for conflicts
   */
  ipcMain.handle('cloud:check-conflicts', async (_event, provider: string) => {
    try {
      const conflicts = await cloudStorageService.checkConflicts()
      return { success: true, conflicts }
    } catch (error) {
      return { success: false, error: (error as Error).message, conflicts: [] }
    }
  })

  /**
   * Sync: Resolve conflict
   */
  ipcMain.handle('cloud:resolve-conflict', async (_event, conflictId: string, resolution: 'local' | 'remote' | 'merge') => {
    try {
      const conflicts = await cloudStorageService.checkConflicts()
      const conflict = conflicts.find((c) => c.id === conflictId)
      if (!conflict) {
        return { success: false, error: 'Conflict not found' }
      }
      await cloudStorageService.resolveConflict(conflict, resolution)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Backup: Create manual backup
   */
  ipcMain.handle('cloud:backup-create', async (_event, title: string, content: string) => {
    try {
      const backup = backupService.createBackup(title, content)
      return { success: true, backup }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Backup: Get all backups
   */
  ipcMain.handle('cloud:backup-list', async (_event, documentTitle: string) => {
    try {
      const backups = backupService.getBackups(documentTitle)
      return { success: true, backups }
    } catch (error) {
      return { success: false, error: (error as Error).message, backups: [] }
    }
  })

  /**
   * Backup: Restore backup
   */
  ipcMain.handle('cloud:backup-restore', async (_event, documentTitle: string, backupId: string) => {
    try {
      const backup = backupService.restoreBackup(documentTitle, backupId)
      return { success: true, backup }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Backup: Delete backup
   */
  ipcMain.handle('cloud:backup-delete', async (_event, documentTitle: string, backupId: string) => {
    try {
      backupService.deleteBackup(documentTitle, backupId)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Backup: Get stats
   */
  ipcMain.handle('cloud:backup-stats', async () => {
    try {
      const stats = backupService.getStats()
      return { success: true, stats }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}

/**
 * Cleanup sync timers on app quit
 */
export function cleanupCloudHandlers(): void {
  for (const timer of syncTimers.values()) {
    clearInterval(timer)
  }
  syncTimers.clear()
  providerStatuses.clear()
}
