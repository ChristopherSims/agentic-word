/**
 * Auto-Update Service for Lexicon
 *
 * Windows (packaged, NSIS install): backed by `electron-updater`. The app
 * checks GitHub Releases for a newer version, downloads the NSIS update in
 * the background, and installs it in place on restart — the user never
 * downloads or re-installs anything manually.
 *
 * Everything else (dev, macOS, Linux, Windows portable): auto-install is not
 * available, so the service falls back to a GitHub Releases API check that
 * only notifies the renderer that an update exists.
 *
 * The electron-builder `publish` config emits `latest.yml` next to the NSIS
 * installer; electron-updater consumes that metadata from the GitHub release.
 */

import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GitHubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  html_url: string
  body: string
  assets: Array<{ name: string; browser_download_url: string; size: number }>
}

export interface UpdateCheckResult {
  available: boolean
  currentVersion: string
  latestVersion: string
  releaseNotes: string
  downloadUrl?: string
  canInstall: boolean
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateProgress {
  phase: UpdatePhase
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
  message: string
  error?: string
}

const GITHUB_OWNER = 'ChristopherSims'
const GITHUB_REPO = 'agentic-word'

// ─── Service ─────────────────────────────────────────────────────────────────

export class AutoUpdateService {
  private currentWindow: BrowserWindow | null = null
  private readonly CHECK_INTERVAL_MS = 3_600_000 // 1 hour
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private progress: UpdateProgress = {
    phase: 'idle',
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    message: ''
  }
  private cancellationToken: CancellationToken | null = null
  private downloadedVersion: string | null = null
  private inFlightCheck: Promise<UpdateCheckResult> | null = null
  private wired = false

  constructor(window: BrowserWindow) {
    this.currentWindow = window
    this.setupIPC()
    this.scheduleAutoCheck()
  }

  /**
   * Whether this installation can apply updates in place. On Windows this is
   * an NSIS install; the portable build sets PORTABLE_EXECUTABLE_DIR and
   * cannot self-update.
   */
  private canAutoUpdate(): boolean {
    if (!app.isPackaged) return false
    if (process.platform !== 'win32') return false
    if (process.env.PORTABLE_EXECUTABLE_DIR) return false
    return true
  }

  // ── IPC ──────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // NOTE: 'check-for-updates' is registered in index.ts (wrapped with the
    // shared error handler and tolerant of the service not being ready yet),
    // so it is intentionally not registered here to avoid a duplicate handler.

    ipcMain.handle('download-update', async () => {
      return this.downloadUpdate()
    })

    ipcMain.handle('install-update', async () => {
      return this.installUpdate()
    })

    ipcMain.handle('get-update-progress', async () => {
      return this.progress
    })

    ipcMain.handle('cancel-update', async () => {
      this.cancellationToken?.cancel()
      this.cancellationToken = null
      this.setProgress('idle', 0, 'Update download cancelled')
      return { cancelled: true }
    })
  }

  // ── Scheduling ───────────────────────────────────────────────────────────

  private scheduleAutoCheck(): void {
    // Initial check after 10 seconds (let the app finish loading)
    setTimeout(() => { void this.checkForUpdates() }, 10_000)

    this.checkTimer = setInterval(() => {
      void this.checkForUpdates()
    }, this.CHECK_INTERVAL_MS)
  }

  // ── Check ────────────────────────────────────────────────────────────────

  async checkForUpdates(): Promise<UpdateCheckResult> {
    // Collapse concurrent checks (startup + scheduled + manual) into one.
    if (this.inFlightCheck) return this.inFlightCheck

    this.inFlightCheck = this.runCheck()
    try {
      return await this.inFlightCheck
    } finally {
      this.inFlightCheck = null
    }
  }

  private async runCheck(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion()

    if (!this.canAutoUpdate()) {
      return this.checkViaGitHubApi(currentVersion)
    }

    this.wireUpdaterEvents()
    this.setProgress('checking', 0, 'Checking for updates…')

    try {
      const result = await autoUpdater.checkForUpdates()
      const latestVersion = result?.updateInfo?.version ?? currentVersion

      if (!this.isNewer(latestVersion, currentVersion)) {
        this.setProgress('not-available', 100, 'Up to date')
        return {
          available: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseNotes: '',
          canInstall: true
        }
      }

      return {
        available: true,
        currentVersion,
        latestVersion,
        releaseNotes: this.releaseNotesToString(result?.updateInfo),
        downloadUrl: this.releaseUrl(latestVersion),
        canInstall: true
      }
    } catch (err) {
      const message = (err as Error).message
      console.error('[AutoUpdate] Check failed:', message)
      this.setProgress('error', 0, 'Update check failed', message)
      return {
        available: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseNotes: '',
        canInstall: true
      }
    }
  }

  // ── Download / Install ───────────────────────────────────────────────────

  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!this.canAutoUpdate()) {
      return { success: false, error: 'In-place updates are not available on this platform' }
    }
    try {
      this.cancellationToken = new CancellationToken()
      this.setProgress('downloading', 0, 'Starting download…')
      await autoUpdater.downloadUpdate(this.cancellationToken)
      return { success: true }
    } catch (err) {
      const message = (err as Error).message
      this.cancellationToken = null
      this.setProgress('error', 0, 'Update download failed', message)
      return { success: false, error: message }
    }
  }

  async installUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!this.downloadedVersion) {
      return { success: false, error: 'No update has been downloaded yet' }
    }
    try {
      // isSilent = false, isForceRunAfter = true
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (err) {
      const message = (err as Error).message
      this.setProgress('error', 0, 'Update install failed', message)
      return { success: false, error: message }
    }
  }

  // ── electron-updater wiring ───────────────────────────────────────────────

  private wireUpdaterEvents(): void {
    if (this.wired) return
    this.wired = true

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => {
      this.setProgress('checking', 0, 'Checking for updates…')
    })

    autoUpdater.on('update-available', (info) => {
      this.setProgress('available', 0, `Update v${info.version} is downloading…`)
      this.currentWindow?.webContents.send('update-available', {
        version: info.version,
        url: this.releaseUrl(info.version),
        notes: this.releaseNotesToString(info),
        canInstall: true
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      this.setProgress('not-available', 100, 'Up to date')
      void info
    })

    autoUpdater.on('download-progress', (p) => {
      this.setProgress(
        'downloading',
        Math.round(p.percent),
        `Downloading update… ${Math.round(p.percent)}%`,
        undefined,
        {
          bytesPerSecond: p.bytesPerSecond,
          transferred: p.transferred,
          total: p.total
        }
      )
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.downloadedVersion = info.version
      this.cancellationToken = null
      this.setProgress('downloaded', 100, `Update v${info.version} is ready to install`)
      this.currentWindow?.webContents.send('update-downloaded', { version: info.version })
    })

    autoUpdater.on('error', (err) => {
      this.setProgress('error', 0, 'Update failed', err?.message ?? String(err))
      this.currentWindow?.webContents.send('update-error', { message: err?.message ?? String(err) })
    })
  }

  // ── Fallback: notify only ────────────────────────────────────────────────

  private async checkViaGitHubApi(currentVersion: string): Promise<UpdateCheckResult> {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Lexicon-AutoUpdate'
          },
          signal: AbortSignal.timeout(15_000)
        }
      )

      if (!resp.ok) {
        console.error(`[AutoUpdate] GitHub API returned ${resp.status}`)
        return this.notAvailable(currentVersion)
      }

      const release = (await resp.json()) as GitHubRelease
      if (release.draft || release.prerelease) {
        return this.notAvailable(currentVersion)
      }

      const latestVersion = release.tag_name.replace(/^v/, '')
      if (!this.isNewer(latestVersion, currentVersion)) {
        return this.notAvailable(currentVersion)
      }

      this.currentWindow?.webContents.send('update-available', {
        version: latestVersion,
        url: release.html_url,
        notes: release.body,
        canInstall: false
      })

      return {
        available: true,
        currentVersion,
        latestVersion,
        releaseNotes: release.body,
        downloadUrl: release.html_url,
        canInstall: false
      }
    } catch (err) {
      console.error('[AutoUpdate] Check failed:', err)
      return this.notAvailable(currentVersion)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private notAvailable(currentVersion: string): UpdateCheckResult {
    return {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseNotes: '',
      canInstall: this.canAutoUpdate()
    }
  }

  private releaseUrl(version: string): string {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}`
  }

  private releaseNotesToString(info?: UpdateInfo | null): string {
    if (!info?.releaseNotes) return ''
    if (typeof info.releaseNotes === 'string') return info.releaseNotes
    return info.releaseNotes.map((n) => n.note ?? '').join('\n\n')
  }

  private isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.split('.').map(Number)
    const l = parse(latest)
    const c = parse(current)
    for (let i = 0; i < Math.max(l.length, c.length); i++) {
      const lv = l[i] || 0
      const cv = c[i] || 0
      if (lv > cv) return true
      if (lv < cv) return false
    }
    return false
  }

  private setProgress(
    phase: UpdatePhase,
    percent: number,
    message: string,
    error?: string,
    extra?: Partial<Pick<UpdateProgress, 'bytesPerSecond' | 'transferred' | 'total'>>
  ): void {
    this.progress = {
      phase,
      percent,
      bytesPerSecond: extra?.bytesPerSecond ?? 0,
      transferred: extra?.transferred ?? 0,
      total: extra?.total ?? 0,
      message,
      error
    }
    this.currentWindow?.webContents.send('update-progress', this.progress)
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
    this.cancellationToken?.cancel()
    this.cancellationToken = null
  }
}

export default AutoUpdateService
