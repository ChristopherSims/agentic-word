/**
 * useAutoUpdate Hook
 * Handles update notifications and user interactions
 */

import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'

interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  releaseNotes: string
  downloadUrl: string
}

export const useAutoUpdate = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)
  const { addToast } = useAppStore()

  useEffect(() => {
    if (!window.wordapp) return

    // Listen for update notifications from main process
    const unlistenAvailable = window.wordapp.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateInfo(info)
      addToast('info', `Update available: v${info.latestVersion}`)
    })

    const unlistenDownloaded = window.wordapp.onUpdateDownloaded?.((info: { filePath: string }) => {
      addToast('success', 'Update downloaded. Restart to install.')
      setUpdateProgress(100)
    })

    return () => {
      unlistenAvailable?.()
      unlistenDownloaded?.()
    }
  }, [addToast])

  const checkForUpdates = async () => {
    try {
      setIsChecking(true)
      const result = await window.wordapp?.checkForUpdates()

      if (result?.updateAvailable) {
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          releaseNotes: result.releaseNotes || '',
          downloadUrl: result.downloadUrl || ''
        })
        addToast('info', `Update available: v${result.latestVersion}`)
      } else {
        addToast('success', `You're running the latest version (v${result?.currentVersion})`)
      }
    } catch (error) {
      addToast('error', 'Failed to check for updates')
    } finally {
      setIsChecking(false)
    }
  }

  const downloadAndInstall = async () => {
    if (!updateInfo?.downloadUrl) return

    try {
      setUpdateProgress(0)
      const result = await window.wordapp?.downloadUpdate(updateInfo.downloadUrl)

      if (result?.success) {
        addToast('success', 'Update downloaded. Click to install and restart.')
      } else {
        addToast('error', `Download failed: ${result?.error}`)
      }
    } catch (error) {
      addToast('error', 'Failed to download update')
    }
  }

  const dismissUpdate = () => {
    setUpdateInfo(null)
  }

  return {
    updateInfo,
    isChecking,
    updateProgress,
    checkForUpdates,
    downloadAndInstall,
    dismissUpdate
  }
}

export default useAutoUpdate
