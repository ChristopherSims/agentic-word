/**
 * Auto-Update Service for Lexicon
 *
 * Flow:
 *   1. checkForUpdates() — hits GitHub Releases API, compares versions
 *   2. downloadAndInstall() — downloads the platform dist zip, extracts,
 *      replaces the current installation, and relaunches.
 *
 * Release assets are pre-built electron-builder dist zips:
 *   dist-windows.zip, dist-macos.zip, dist-linux.zip
 *
 * On Windows the zip contains an unpacked app directory.
 * On macOS it contains a .app bundle.
 * On Linux it contains an unpacked app directory.
 */

import { app, ipcMain, BrowserWindow, shell } from 'electron'
import { createWriteStream, existsSync, mkdirSync, rmSync, renameSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { execSync, spawn } from 'child_process'
import { tmpdir } from 'os'
import { createHash } from 'crypto'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GitHubRelease {
  tag_name: string
  name: string
  draft: boolean
  prerelease: boolean
  published_at: string
  html_url: string
  body: string
  assets: GitHubAsset[]
}

interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
  content_type: string
}

interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion: string
  releaseNotes: string
  downloadUrl?: string
  assetName?: string
  assetSize?: number
}

interface DownloadProgress {
  phase: 'idle' | 'downloading' | 'extracting' | 'installing' | 'done' | 'error'
  percent: number
  message: string
  error?: string
}

// ─── Platform helpers ────────────────────────────────────────────────────────

function getPlatformAssetPattern(): string {
  switch (process.platform) {
    case 'win32':  return 'dist-windows.zip'
    case 'darwin': return 'dist-macos.zip'
    case 'linux':  return 'dist-linux.zip'
    default:       return ''
  }
}

function getAppInstallDir(): string {
  // In production, the app lives in its install directory.
  // app.getAppPath() returns the asar or the app directory.
  const appPath = app.getAppPath()
  // electron-builder on Windows: AppPath is .../resources/app.asar
  // The actual install root is two levels up.
  if (appPath.endsWith('app.asar')) {
    return dirname(dirname(appPath))
  }
  // Dev mode or unpacked: appPath is the project root
  return appPath
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AutoUpdateService {
  private currentWindow: BrowserWindow | null = null
  private lastCheckTime = 0
  private readonly CHECK_COOLDOWN_MS = 300_000 // 5 min
  private readonly CHECK_INTERVAL_MS = 3_600_000 // 1 hour
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private progress: DownloadProgress = { phase: 'idle', percent: 0, message: '' }
  private abortController: AbortController | null = null

  constructor(window: BrowserWindow) {
    this.currentWindow = window
    this.setupIPC()
    this.scheduleAutoCheck()
  }

  // ── IPC ──────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    ipcMain.handle('check-for-updates', async () => {
      return this.checkForUpdates()
    })

    ipcMain.handle('download-update', async () => {
      return this.downloadAndInstall()
    })

    ipcMain.handle('get-update-progress', async () => {
      return this.progress
    })

    ipcMain.handle('cancel-update', async () => {
      this.abortController?.abort()
      this.progress = { phase: 'idle', percent: 0, message: 'Cancelled' }
      return { cancelled: true }
    })
  }

  // ── Scheduling ───────────────────────────────────────────────────────────

  private scheduleAutoCheck(): void {
    // Initial check after 10 seconds (let the app finish loading)
    setTimeout(() => this.checkForUpdates(), 10_000)

    this.checkTimer = setInterval(() => {
      this.checkForUpdates()
    }, this.CHECK_INTERVAL_MS)
  }

  // ── Check ────────────────────────────────────────────────────────────────

  async checkForUpdates(): Promise<UpdateInfo> {
    const currentVersion = app.getVersion()
    const now = Date.now()

    if (now - this.lastCheckTime < this.CHECK_COOLDOWN_MS) {
      return {
        available: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseNotes: ''
      }
    }
    this.lastCheckTime = now

    try {
      const resp = await fetch(
        'https://api.github.com/repos/ChristopherSims/agentic-word/releases/latest',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Lexicon-AutoUpdate'
          },
          signal: AbortSignal.timeout(15_000)
        }
      )

      if (!resp.ok) {
        console.error(`[AutoUpdate] GitHub API returned ${resp.status}`)
        return { available: false, currentVersion, latestVersion: currentVersion, releaseNotes: '' }
      }

      const release: GitHubRelease = await resp.json()

      // Skip drafts and prereleases
      if (release.draft || release.prerelease) {
        return { available: false, currentVersion, latestVersion: currentVersion, releaseNotes: '' }
      }

      const latestVersion = release.tag_name.replace(/^v/, '')
      if (!this.isNewer(latestVersion, currentVersion)) {
        return { available: false, currentVersion, latestVersion: currentVersion, releaseNotes: '' }
      }

      // Find the platform asset
      const pattern = getPlatformAssetPattern()
      const asset = release.assets.find(a => a.name === pattern)

      if (!asset) {
        console.warn(`[AutoUpdate] No asset matching "${pattern}" in release ${latestVersion}`)
        return { available: false, currentVersion, latestVersion, releaseNotes: '' }
      }

      console.log(`[AutoUpdate] Update available: ${currentVersion} → ${latestVersion}`)

      // Notify renderer
      this.currentWindow?.webContents.send('update-available', {
        version: latestVersion,
        url: release.html_url,
        notes: release.body
      })

      return {
        available: true,
        currentVersion,
        latestVersion,
        releaseNotes: release.body,
        downloadUrl: asset.browser_download_url,
        assetName: asset.name,
        assetSize: asset.size
      }
    } catch (err) {
      console.error('[AutoUpdate] Check failed:', err)
      return { available: false, currentVersion, latestVersion: currentVersion, releaseNotes: '' }
    }
  }

  // ── Download & Install ───────────────────────────────────────────────────

  async downloadAndInstall(): Promise<{ success: boolean; error?: string }> {
    // First, get the latest release info to find the download URL
    const info = await this.checkForUpdates()
    if (!info.available || !info.downloadUrl) {
      return { success: false, error: 'No update available' }
    }

    this.abortController = new AbortController()
    const tmpDir = join(tmpdir(), `lexicon-update-${Date.now()}`)
    const zipPath = join(tmpDir, info.assetName || 'update.zip')
    const extractDir = join(tmpDir, 'extracted')

    try {
      // Phase 1: Download
      this.setProgress('downloading', 0, `Downloading v${info.latestVersion}...`)

      mkdirSync(tmpDir, { recursive: true })

      const resp = await fetch(info.downloadUrl, {
        signal: this.abortController.signal,
        headers: { 'User-Agent': 'Lexicon-AutoUpdate' }
      })

      if (!resp.ok || !resp.body) {
        return { success: false, error: `Download failed: HTTP ${resp.status}` }
      }

      const totalSize = info.assetSize || 0
      let downloaded = 0
      const fileStream = createWriteStream(zipPath)

      // Use a manual read loop for progress tracking
      const reader = resp.body.getReader()
      const pump = async (): Promise<void> => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          downloaded += value.length
          fileStream.write(value)
          if (totalSize > 0) {
            const pct = Math.round((downloaded / totalSize) * 100)
            this.setProgress('downloading', pct, `Downloading... ${this.formatBytes(downloaded)} / ${this.formatBytes(totalSize)}`)
          }
        }
        fileStream.end()
      }

      await pump()

      this.setProgress('extracting', 100, 'Extracting...')

      // Phase 2: Extract
      mkdirSync(extractDir, { recursive: true })
      await this.extractZip(zipPath, extractDir)

      // Phase 3: Install (replace current installation)
      this.setProgress('installing', 100, 'Installing update...')

      const installDir = getAppInstallDir()
      const extractedApp = this.findAppInDir(extractDir)

      if (!extractedApp) {
        return { success: false, error: 'Could not find app in extracted archive' }
      }

      // Strategy: we can't replace the running app's files while it's running.
      // Instead, we write a small helper script that does the swap after we exit,
      // then relaunch.
      await this.stageUpdate(extractedApp, installDir, tmpDir)

      this.setProgress('done', 100, 'Update ready — restarting...')

      // Give the renderer a moment to show the message
      await new Promise(r => setTimeout(r, 1500))

      // Relaunch
      app.relaunch()
      app.exit(0)

      return { success: true }
    } catch (err) {
      const msg = (err as Error).name === 'AbortError'
        ? 'Download cancelled'
        : (err as Error).message
      this.setProgress('error', 0, msg, msg)
      // Clean up temp files on error
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
      return { success: false, error: msg }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    if (process.platform === 'win32') {
      // PowerShell Expand-Archive
      execSync(
        `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'pipe', timeout: 120_000 }
      )
    } else {
      // Unix: unzip
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
        stdio: 'pipe',
        timeout: 120_000
      })
    }
  }

  private findAppInDir(dir: string): string | null {
    // Look for the electron-builder output structure.
    // On Windows/Linux: the dir contains the app files directly (or in a subdir)
    // On macOS: it contains a .app bundle

    if (process.platform === 'darwin') {
      const entries = readdirSync(dir)
      const appBundle = entries.find(e => e.endsWith('.app'))
      if (appBundle) return join(dir, appBundle)
    }

    // Check if the dir itself looks like an app (has resources/app.asar or a main executable)
    const entries = readdirSync(dir)
    if (entries.includes('resources') || entries.some(e => e.endsWith('.exe') || e === 'lexicon')) {
      return dir
    }

    // Check one level deep
    for (const entry of entries) {
      const full = join(dir, entry)
      try {
        if (statSync(full).isDirectory()) {
          const sub = readdirSync(full)
          if (sub.includes('resources') || sub.some(e => e.endsWith('.exe') || e === 'lexicon')) {
            return full
          }
        }
      } catch {}
    }

    return null
  }

  private async stageUpdate(
    extractedApp: string,
    installDir: string,
    tmpDir: string
  ): Promise<void> {
    // Write a platform-specific swap script to a temp location.
    // After the app exits, the script replaces the old install with the new one
    // and relaunches.

    const scriptPath = join(tmpDir, this.getSwapScriptName())
    const scriptContent = this.getSwapScript(extractedApp, installDir)

    const { writeFile } = await import('fs/promises')
    await writeFile(scriptPath, scriptContent, 'utf-8')

    // Launch the swap script detached so it survives our exit
    this.launchSwapScript(scriptPath)
  }

  private getSwapScriptName(): string {
    if (process.platform === 'win32') return 'update-swap.bat'
    return 'update-swap.sh'
  }

  private getSwapScript(newApp: string, installDir: string): string {
    const appExe = process.platform === 'win32'
      ? join(installDir, 'Lexicon.exe')
      : process.platform === 'darwin'
        ? join(installDir, 'Lexicon.app')
        : join(installDir, 'lexicon')

    if (process.platform === 'win32') {
      return [
        '@echo off',
        'echo Waiting for Lexicon to close...',
        'timeout /t 3 /nobreak > nul',
        `echo Replacing ${installDir} with ${newApp}...`,
        `rmdir /s /q "${installDir}" 2>nul`,
        `xcopy /e /i /y "${newApp}" "${installDir}"`,
        'echo Update complete. Restarting...',
        `start "" "${appExe}"`,
        'exit'
      ].join('\r\n')
    }

    // macOS / Linux
    return [
      '#!/bin/bash',
      'sleep 3',
      `echo "Replacing ${installDir} with ${newApp}..."`,
      `rm -rf "${installDir}"`,
      `cp -R "${newApp}" "${installDir}"`,
      'echo "Update complete. Restarting..."',
      `open "${appExe}" || "${appExe}" &`,
    ].join('\n')
  }

  private launchSwapScript(scriptPath: string): void {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', scriptPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref()
    } else {
      spawn('bash', [scriptPath], {
        detached: true,
        stdio: 'ignore'
      }).unref()
    }
  }

  private setProgress(
    phase: DownloadProgress['phase'],
    percent: number,
    message: string,
    error?: string
  ): void {
    this.progress = { phase, percent, message, error }
    this.currentWindow?.webContents.send('update-progress', this.progress)
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
    this.abortController?.abort()
  }
}

export default AutoUpdateService
