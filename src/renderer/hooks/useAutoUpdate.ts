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

    // Listen for update notifications from the main process.
    const unlistenAvailable = window.wordapp.on<UpdateInfo>('update-available', (info) => {
      setUpdateInfo(info)
      addToast('info', `Update available: v${info.latestVersion}`)
    })

    return () => {
      unlistenAvailable?.()
    }
  }, [addToast])

  const checkForUpdates = async () => {
    try {
      setIsChecking(true)
      const result = await window.wordapp?.update.check()

      if (result?.available) {
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
      // The download page is opened in the default browser; installer
      // replacement is handled by the packaging/update pipeline.
      window.open(updateInfo.downloadUrl, '_blank')
      setUpdateProgress(100)
      addToast('success', 'Opening the update download page…')
    } catch (error) {
      addToast('error', 'Failed to open the download page')
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
