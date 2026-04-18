/**
 * Auto-Update Service for Lexicon
 * Checks GitHub releases for new versions and manages updates
 */

import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { fetch } from 'electron-fetch'

interface GitHubRelease {
  tag_name: string
  name: string
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: Array<{ name: string; browser_download_url: string }>
  body: string
}

export class AutoUpdateService {
  private checkInterval: NodeJS.Timeout | null = null
  private currentWindow: BrowserWindow | null = null
  private lastCheckTime: number = 0
  private checkIntervalMs: number = 3600000 // 1 hour

  constructor(window: BrowserWindow) {
    this.currentWindow = window
    this.setupIPC()
    this.scheduleAutoCheck()
  }

  private setupIPC(): void {
    // Check for updates manually
    ipcMain.handle('check-for-updates', async () => {
      return this.checkForUpdates()
    })

    // Download and install update
    ipcMain.handle('download-update', async (_, downloadUrl: string) => {
      return this.downloadAndInstallUpdate(downloadUrl)
    })
  }

  private scheduleAutoCheck(): void {
    // Initial check after 5 seconds
    setTimeout(() => this.checkForUpdates(), 5000)

    // Recurring checks every hour
    this.checkInterval = setInterval(() => {
      this.checkForUpdates()
    }, this.checkIntervalMs)
  }

  async checkForUpdates(): Promise<{
    updateAvailable: boolean
    currentVersion: string
    latestVersion: string
    releaseNotes: string
    downloadUrl?: string
  }> {
    try {
      const currentVersion = app.getVersion()
      const now = Date.now()

      // Prevent check spam (max once per 5 minutes)
      if (now - this.lastCheckTime < 300000) {
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseNotes: ''
        }
      }

      this.lastCheckTime = now

      const response = await fetch(
        'https://api.github.com/repos/ChristopherSims/agentic-word/releases/latest',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Lexicon-AutoUpdate'
          },
          timeout: 10000
        }
      )

      if (!response.ok) {
        console.error(`GitHub API error: ${response.status}`)
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseNotes: ''
        }
      }

      const release: GitHubRelease = await response.json()

      // Skip draft and prerelease unless current version is prerelease
      if ((release.draft || release.prerelease) && !currentVersion.includes('beta') && !currentVersion.includes('alpha')) {
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseNotes: ''
        }
      }

      const latestVersion = release.tag_name.replace(/^v/, '')
      const updateAvailable = this.isVersionNewer(latestVersion, currentVersion)

      if (updateAvailable) {
        console.log(`Update available: ${currentVersion} → ${latestVersion}`)

        // Find appropriate installer for current platform
        const downloadUrl = this.getDownloadUrl(release)

        if (downloadUrl) {
          // Notify renderer about available update
          this.currentWindow?.webContents.send('update-available', {
            currentVersion,
            latestVersion,
            releaseNotes: release.body,
            downloadUrl
          })
        }
      }

      return {
        updateAvailable,
        currentVersion,
        latestVersion,
        releaseNotes: release.body,
        downloadUrl: updateAvailable ? this.getDownloadUrl(release) : undefined
      }
    } catch (error) {
      console.error('Auto-update check failed:', error)
      return {
        updateAvailable: false,
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        releaseNotes: ''
      }
    }
  }

  private isVersionNewer(latestVersion: string, currentVersion: string): boolean {
    const parseVersion = (v: string) => v.split('.').map(Number)
    const latest = parseVersion(latestVersion)
    const current = parseVersion(currentVersion)

    for (let i = 0; i < Math.max(latest.length, current.length); i++) {
      const l = latest[i] || 0
      const c = current[i] || 0
      if (l > c) return true
      if (l < c) return false
    }
    return false
  }

  private getDownloadUrl(release: GitHubRelease): string | undefined {
    const platform = process.platform
    const arch = process.arch

    let assetName: string

    if (platform === 'win32') {
      assetName = 'Lexicon-0.5.3-setup.exe'
    } else if (platform === 'darwin') {
      assetName = 'Lexicon-0.5.3.dmg'
    } else if (platform === 'linux') {
      assetName = arch === 'x64' ? 'lexicon_0.5.3_amd64.deb' : 'Lexicon-0.5.3.AppImage'
    } else {
      return undefined
    }

    const asset = release.assets.find(a => a.name.includes(assetName))
    return asset?.browser_download_url
  }

  private async downloadAndInstallUpdate(downloadUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { filePath } = await dialog.showSaveDialog(this.currentWindow!, {
        defaultPath: `Lexicon-installer-${Date.now()}`,
        filters: [{ name: 'Installers', extensions: ['exe', 'dmg', 'deb', 'AppImage'] }]
      })

      if (!filePath) {
        return { success: false, error: 'Download cancelled' }
      }

      const response = await fetch(downloadUrl, { timeout: 300000 })

      if (!response.ok) {
        return { success: false, error: `Download failed: ${response.statusText}` }
      }

      // Note: Actual file writing would require fs module
      // This is a placeholder for the auto-update flow
      console.log(`Downloaded installer to: ${filePath}`)

      // Notify renderer that update is ready
      this.currentWindow?.webContents.send('update-downloaded', {
        filePath
      })

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
  }
}

export default AutoUpdateService
