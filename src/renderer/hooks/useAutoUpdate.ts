/**
 * useAutoUpdate Hook
 *
 * Thin wrapper over the shared update state in the app store and the
 * main-process update IPC. In-place updates are driven from the Settings
 * menu; this hook is available to any component that needs the same state.
 */

import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'

export const useAutoUpdate = () => {
  const updateAvailable = useAppStore((s) => s.updateAvailable)
  const updateVersion = useAppStore((s) => s.updateVersion)
  const updateUrl = useAppStore((s) => s.updateUrl)
  const updateCanInstall = useAppStore((s) => s.updateCanInstall)
  const updatePhase = useAppStore((s) => s.updatePhase)
  const updateProgress = useAppStore((s) => s.updateProgress)
  const updateError = useAppStore((s) => s.updateError)

  useEffect(() => {
    if (!window.wordapp) return
    window.wordapp.update.getProgress().then((progress) => {
      if (progress?.phase) useAppStore.getState().setUpdatePhase(progress.phase as typeof updatePhase)
    }).catch(() => {})
  }, [])

  const checkForUpdates = async () => {
    const store = useAppStore.getState()
    store.setUpdatePhase('checking')
    try {
      const result = await window.wordapp?.update.check()
      if (result?.available) {
        store.setUpdateAvailable(true, result.latestVersion, result.downloadUrl, result.canInstall)
        store.setUpdatePhase(result.canInstall ? 'downloading' : 'available')
        store.addToast('info', `Update available: v${result.latestVersion}`)
      } else {
        store.setUpdatePhase('not-available')
        store.addToast('success', `You're running the latest version (v${result?.currentVersion})`)
      }
    } catch {
      store.setUpdatePhase('idle')
      store.addToast('error', 'Failed to check for updates')
    }
  }

  const downloadAndInstall = async () => {
    const store = useAppStore.getState()
    if (updatePhase === 'downloaded') {
      await window.wordapp?.update.install()
      return
    }
    store.setUpdatePhase('downloading')
    const result = await window.wordapp?.update.download()
    if (!result?.success) store.setUpdatePhase('error')
  }

  return {
    updateInfo: updateAvailable
      ? { version: updateVersion, url: updateUrl, canInstall: updateCanInstall }
      : null,
    isChecking: updatePhase === 'checking',
    updatePhase,
    updateProgress,
    updateError,
    checkForUpdates,
    downloadAndInstall
  }
}

export default useAutoUpdate
