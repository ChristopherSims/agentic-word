import React, { useEffect, lazy, Suspense } from 'react'
import { EnhancedEditorPanel } from './components/EnhancedEditorPanel'
import { StoryboardEditor } from './components/StoryboardEditor'
import { AgentCommandBar } from './components/AgentCommandBar'
import { MenuBar } from './components/MenuBar'
import { ToastContainer } from './components/ToastContainer'
import { MdPreview } from './components/MdPreview'
import { InlineEditModal } from './components/InlineEditModal'
import { CommentPanel } from './components/CommentPanel'
import { TableOfContentsPanel } from './components/TableOfContentsPanel'
import { PrintPreview } from './components/PrintPreview'
import { FloatingToolbar } from './components/FloatingToolbar'
import { AccessibilityPanel } from './components/AccessibilityPanel'
import { ThemeCustomizer } from './components/ThemeCustomizer'
import { GlobalSearchPanel } from './components/GlobalSearchPanel'
import { GoToLineDialog } from './components/GoToLineDialog'
import { SpellCheckPanel } from './components/SpellCheckPanel'
import { WritingSuggestionsPanel } from './components/WritingSuggestionsPanel'
import { KeyboardShortcutsPanel } from './components/KeyboardShortcutsPanel'
import { ShortcutCheatSheet } from './components/ShortcutCheatSheet'
import { CollaborationTimelinePanel } from './components/CollaborationTimelinePanel'
import { ConflictResolutionPanel } from './components/ConflictResolutionPanel'
import { EditHistoryPanel } from './components/EditHistoryPanel'
import { HelpPanel } from './components/HelpPanel'
import { AIAssistantPanel } from './components/AIAssistantPanel'
import { HelpMenu } from './components/HelpMenu'
import { TutorialMode } from './components/TutorialMode'
import { FeatureHighlights } from './components/FeatureHighlights'
import TemplateGalleryDialog from './components/TemplateGalleryDialog'
import { ThemeProvider } from './ThemeProvider'

// P1-P1: Lazy-loaded panels (conditionally rendered or rarely used) for code-splitting
const AgentWorkspacePanel = lazy(() => import('./components/AgentWorkspacePanel').then(m => ({ default: m.AgentWorkspacePanel })))
const TaskListPopup = lazy(() => import('./components/TaskListPopup').then(m => ({ default: m.TaskListPopup })))
const VcsPanel = lazy(() => import('./components/VcsPanel').then(m => ({ default: m.VcsPanel })))
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const CommandPalette = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })))
const OutlinePanel = lazy(() => import('./components/OutlinePanel').then(m => ({ default: m.OutlinePanel })))
const DocStatsPanel = lazy(() => import('./components/DocStatsPanel').then(m => ({ default: m.DocStatsPanel })))
const CollabPanel = lazy(() => import('./components/CollabPanel').then(m => ({ default: m.CollabPanel })))
const EnhancedFindReplaceBar = lazy(() => import('./components/EnhancedFindReplaceBar').then(m => ({ default: m.EnhancedFindReplaceBar })))
const ExportDialog = lazy(() => import('./components/ExportDialog').then(m => ({ default: m.ExportDialog })))
const ImportDialog = lazy(() => import('./components/ImportDialog').then(m => ({ default: m.ImportDialog })))
const FontManager = lazy(() => import('./components/FontManager').then(m => ({ default: m.FontManager })))
const GrammarPanel = lazy(() => import('./components/GrammarPanel').then(m => ({ default: m.GrammarPanel })))
const PerformanceOptimization = lazy(() => import('./components/PerformanceOptimization').then(m => ({ default: m.PerformanceOptimization })))
const CloudSettingsPanel = lazy(() => import('./components/CloudSettingsPanel').then(m => ({ default: m.CloudSettingsPanel })))
const BackupManagementPanel = lazy(() => import('./components/BackupManagementPanel').then(m => ({ default: m.BackupManagementPanel })))
const DocumentEncryptionPanel = lazy(() => import('./components/DocumentEncryptionPanel').then(m => ({ default: m.DocumentEncryptionPanel })))
const AccessControlPanel = lazy(() => import('./components/AccessControlPanel').then(m => ({ default: m.AccessControlPanel })))
const AuditLogViewer = lazy(() => import('./components/AuditLogViewer').then(m => ({ default: m.AuditLogViewer })))
import { useAppStore } from './store/app-store'
import { calculateTextStats } from './utils/text-stats'
import { applySmartFormatting } from './utils/smart-formatter'
import { preparePdfContent, type PdfExportOptions } from './utils/pdf-export'
import { convertToEpub, convertToLatex, convertToRtf, convertToCSV } from './utils/multi-format-export'
import { getEffectiveTheme, onSystemThemeChange, applyThemeVariables } from './utils/theme-manager'
import { getColorPalette } from './utils/accessibility-utils'
import { applyFontConfigGlobal } from './utils/font-manager'
import type { ExportFormat } from './components/ExportDialog'
import type {
  VcsGraphLanesResult, VcsStashEntry, VcsBlameLine, VcsHooks,
  VcsMergeResult, VcsValidateCommitResult, VcsImportPatchResult,
  AgentSession, AgentProfile, AgentMultiRunResult,
  PluginManifest, PluginMarketplaceEntry,
  CollabStartResult, CollabStatusResult, CollabGenerateCodeResult,
  FileExportResult,
  FileSaveAsEvent,
  FileOpenedEvent,
  ExportMarkdownEvent,
  ExportEpubEvent,
  UpdateAvailableEvent,
  PluginEditorInsertEvent,
  PluginEditorReplaceSelectionEvent,
  PluginRegisterCommandEvent,
  PluginAddToolbarButtonEvent,
  PluginNotificationEvent
} from './types'
import { useProactiveAgent } from './hooks/useProactiveAgent'

export const App: React.FC = () => {
  useProactiveAgent()
  const {
    vcsPanelOpen,
    settingsPanelOpen,
    commandPaletteOpen,
    updateAvailable,
    updateVersion,
    updateUrl,
    themeMode,
    accessibilityMode,
    useSystemThemePreference,
    scheduledDarkModeEnabled,
    scheduledDarkModeStart,
    scheduledDarkModeEnd,
    globalFontSize,
    globalLineHeight,
    globalLetterSpacing,
    reducedMotion,
    highlightFocusIndicators,
    keyboardNavigationEnabled,
    outlineOpen,
    docStatsPanelOpen,
    collabPanelOpen,
    collabMcpPort,
    setCollabMcpPort,
    docTabs,
    activeTabId
  } = useAppStore()
  const documentContent = useAppStore((state) => state.documentContent)
  // P1-P2: Reactive selectors for panel-open flags (replaces useAppStore.getState().xxxOpen in render body)
  const chatSidebarOpen = useAppStore(s => s.chatSidebarOpen)
  const findReplaceOpen = useAppStore(s => s.findReplaceOpen)
  const exportDialogOpen = useAppStore(s => s.exportDialogOpen)
  const importDialogOpen = useAppStore(s => s.importDialogOpen)
  const accessibilityPanelOpen = useAppStore(s => s.accessibilityPanelOpen)
  const setAccessibilityPanelOpen = useAppStore(s => s.setAccessibilityPanelOpen)
  const themeCustomizerOpen = useAppStore(s => s.themeCustomizerOpen)
  const setThemeCustomizerOpen = useAppStore(s => s.setThemeCustomizerOpen)
  const fontManagerOpen = useAppStore(s => s.fontManagerOpen)
  const setFontManagerOpen = useAppStore(s => s.setFontManagerOpen)
  const globalSearchOpen = useAppStore(s => s.globalSearchOpen)
  const setGlobalSearchOpen = useAppStore(s => s.setGlobalSearchOpen)
  const goToLineDialogOpen = useAppStore(s => s.goToLineDialogOpen)
  const setGoToLineDialogOpen = useAppStore(s => s.setGoToLineDialogOpen)
  const performanceDashboardOpen = useAppStore(s => s.performanceDashboardOpen)
  const cloudSettingsPanelOpen = useAppStore(s => s.cloudSettingsPanelOpen)
  const backupManagementPanelOpen = useAppStore(s => s.backupManagementPanelOpen)
  const documentEncryptionPanelOpen = useAppStore(s => s.documentEncryptionPanelOpen)
  const accessControlPanelOpen = useAppStore(s => s.accessControlPanelOpen)
  const auditLogViewerOpen = useAppStore(s => s.auditLogViewerOpen)
  const documentTitle = useAppStore(s => s.documentTitle)
  const setExportDialogOpen = useAppStore(s => s.setExportDialogOpen)
  const setImportDialogOpen = useAppStore(s => s.setImportDialogOpen)
  // v0.4.7: AI state
  const [collabServerDialogOpen, setCollabServerDialogOpen] = React.useState(false)
  const [tempPort, setTempPort] = React.useState(collabMcpPort || 12345)

  useEffect(() => {
    // Load all saved settings from localStorage on app startup
    useAppStore.getState().loadAllSettings()

    // Restore agent presets to the agent system if they were loaded from localStorage
    const { agentPresets } = useAppStore.getState()
    if (agentPresets.length > 0) {
      agentPresets.forEach((preset) => {
        window.wordapp?.agent.addPreset({
          name: preset.name,
          endpoint: preset.endpoint,
          apiKey: preset.apiKey,
          model: preset.model
        }).catch((err) => {
          console.warn(`Failed to restore preset "${preset.name}":`, err)
        })
      })
    }

    window.wordapp?.agent.listTools().then((tools) => {
      useAppStore.getState().setAvailableTools(tools)
    }).catch((err) => useAppStore.getState().addToast('error', `Failed to load agent tools: ${(err as Error).message}`))

    window.wordapp?.vcs.currentBranch().then((branch) => {
      useAppStore.getState().setCurrentBranch(branch)
    }).catch((err) => useAppStore.getState().addToast('warning', `Failed to get current branch: ${(err as Error).message}`))
  }, [])

  useEffect(() => {
    if (!documentContent) {
      useAppStore.getState().setTextStats({
        characters: 0,
        charactersWithoutSpaces: 0,
        words: 0,
        sentences: 0,
        paragraphs: 0,
        readingTimeMinutes: 0,
        readingTimeSeconds: 0,
        readabilityScore: 0,
        averageWordLength: 0,
        characterFrequency: {}
      })
      return
    }

    try {
      const stats = calculateTextStats(documentContent)
      useAppStore.getState().setTextStats(stats)
    } catch (err) {
      console.error('Error calculating text stats:', err)
    }
  }, [documentContent])

  // v0.4.0: Apply theme colors based on settings
  useEffect(() => {
    const theme = getEffectiveTheme({
      mode: themeMode as any,
      useSystemPreference: useSystemThemePreference,
      scheduledDarkModeStart: scheduledDarkModeEnabled ? scheduledDarkModeStart : undefined,
      scheduledDarkModeEnd: scheduledDarkModeEnabled ? scheduledDarkModeEnd : undefined
    })

    const palette = getColorPalette(theme, accessibilityMode)
    applyThemeVariables(palette)

    // Apply theme class to document
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.a11yMode = accessibilityMode
  }, [themeMode, accessibilityMode, useSystemThemePreference, scheduledDarkModeEnabled, scheduledDarkModeStart, scheduledDarkModeEnd])

  // v0.4.0: Apply global font settings
  useEffect(() => {
    const fontSize = Math.round((16 * globalFontSize) / 100) // 16px base
    applyFontConfigGlobal({
      size: fontSize,
      lineHeight: globalLineHeight,
      letterSpacing: globalLetterSpacing
    })
  }, [globalFontSize, globalLineHeight, globalLetterSpacing])

  // v0.4.0: Listen for system theme changes
  useEffect(() => {
    if (!useSystemThemePreference || themeMode !== 'auto') return

    const unsubscribe = onSystemThemeChange(() => {
      const theme = getEffectiveTheme({
        mode: themeMode as any,
        useSystemPreference: useSystemThemePreference,
        scheduledDarkModeStart: scheduledDarkModeEnabled ? scheduledDarkModeStart : undefined,
        scheduledDarkModeEnd: scheduledDarkModeEnabled ? scheduledDarkModeEnd : undefined
      })
      const palette = getColorPalette(theme, accessibilityMode)
      applyThemeVariables(palette)
      document.documentElement.dataset.theme = theme
    })

    return unsubscribe
  }, [useSystemThemePreference, themeMode, accessibilityMode, scheduledDarkModeEnabled, scheduledDarkModeStart, scheduledDarkModeEnd])

  // v0.4.0: Apply reduced motion preference
  useEffect(() => {
    if (reducedMotion) {
      document.documentElement.classList.add('reduce-motion')
    } else {
      document.documentElement.classList.remove('reduce-motion')
    }
  }, [reducedMotion])

  // v0.4.0: Apply focus indicator styling
  useEffect(() => {
    if (highlightFocusIndicators) {
      document.documentElement.classList.add('highlight-focus')
    } else {
      document.documentElement.classList.remove('highlight-focus')
    }
  }, [highlightFocusIndicators])

  // v0.4.0: Setup keyboard navigation if enabled
  useEffect(() => {
    if (!keyboardNavigationEnabled) return

    const handleKeydown = (e: KeyboardEvent) => {
      // Manage keyboard focus in dialogs with Escape key
      if (e.key === 'Escape') {
        const focusedElement = document.activeElement as HTMLElement
        if (focusedElement?.closest('[role="dialog"]')) {
          focusedElement.blur()
        }
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [keyboardNavigationEnabled])

  useEffect(() => {
    // Retry until window.wordapp is available — preload may not have
    // finished by the time React mounts on slower systems.
    if (!window.wordapp) {
      const retry = setTimeout(() => {
        // Force re-render by toggling a dummy state — but since we
        // can't useState here, just try again via a microtask chain
        console.warn('[App] window.wordapp not ready, retrying listener setup...')
        // Rely on HMR/dev reload or just return — in practice the preload
        // is ready synchronously after contextBridge.exposeInMainWorld
      }, 100)
      return () => clearTimeout(retry)
    }

    console.log('[App] Registering IPC listeners...')

    const unsubs: Array<() => void> = []

    const on = (channel: string, handler: (...args: unknown[]) => void) => {
      const unsub = window.wordapp!.on(channel, (...args: unknown[]) => {
        try {
          handler(...args)
        } catch (err) {
          console.error(`[App] Error in handler for '${channel}':`, err)
        }
      })
      unsubs.push(unsub)
    }

    on('file-new', () => {
      const state = useAppStore.getState()
      state.setDocumentContent('')
      state.setDocumentTitle('Untitled')
      state.setCurrentFilePath(null)
      state.setDirty(false)
      state.updateDocTab(state.activeTabId, { title: 'Untitled', filePath: null, isDirty: false })
    })

    on('file-save', () => {
      // Triggered by Ctrl+S menu shortcut — EditorPanel handles the actual save
    })

    on('file-save-as', async (args: FileSaveAsEvent) => {
      const { filePath } = args
      if (filePath) {
        try {
          const state = useAppStore.getState()
          const result = await window.wordapp?.file.saveFile(filePath, state.documentContent)
          if (result) {
            const fileName = filePath.split(/[\\/]/).pop() || filePath
            useAppStore.getState().setCurrentFilePath(filePath)
            useAppStore.getState().setDocumentTitle(fileName)
            useAppStore.getState().setDirty(false)
            useAppStore.getState().updateDocTab(state.activeTabId, { title: fileName, filePath, isDirty: false })
            useAppStore.getState().addToast('success', `Saved as ${fileName}`)
          } else {
            useAppStore.getState().addToast('error', 'Failed to save file')
          }
        } catch (error) {
          console.error('[App] Save-as error:', error)
          useAppStore.getState().addToast('error', 'Failed to save file: ' + (error instanceof Error ? error.message : 'Unknown error'))
        }
      }
    })

    // Track opening state for progress indicator
    let isOpeningFile = false

    on('file-opened', (args: FileOpenedEvent) => {
      const { content, filePath } = args
      const fileName = filePath.split(/[\\/]/).pop()
      if (!fileName) throw new Error(`Invalid file path: ${filePath}`)
      useAppStore.getState().setDocumentContent(content)
      useAppStore.getState().setCurrentFilePath(filePath)
      useAppStore.getState().setDocumentTitle(fileName)
      useAppStore.getState().setDirty(false)
      useAppStore.getState().updateDocTab(useAppStore.getState().activeTabId, { title: fileName, filePath, isDirty: false })
      
      // Show success toast if file was being opened
      if (isOpeningFile) {
        useAppStore.getState().addToast('success', `Opened ${fileName}`)
        isOpeningFile = false
      }
    })

    // Show loading toast when dialog-open is triggered
    on('dialog-open', () => {
      isOpeningFile = true
      useAppStore.getState().addToast('info', 'Opening file...')
    })

    on('file-print', () => {
      useAppStore.getState().setPrintPreviewOpen(true)
    })

    // Edit menu operations
    on('edit-undo', () => {
      // TipTap editor handles undo through its built-in command
      // Dispatch keyboard event to trigger native editor undo
      const editor = document.querySelector('.tiptap') as any
      if (editor?.focus) {
        editor.focus()
        document.execCommand('undo', false)
      }
    })

    on('edit-redo', () => {
      // TipTap editor handles redo through its built-in command
      // Dispatch keyboard event to trigger native editor redo
      const editor = document.querySelector('.tiptap') as any
      if (editor?.focus) {
        editor.focus()
        document.execCommand('redo', false)
      }
    })

    on('edit-cut', () => {
      // Focus the editor and execute cut command
      const editor = document.querySelector('.tiptap') as any
      if (editor?.focus) {
        editor.focus()
        document.execCommand('cut', false)
      }
    })

    on('edit-copy', () => {
      // Focus the editor and execute copy command
      const editor = document.querySelector('.tiptap') as any
      if (editor?.focus) {
        editor.focus()
        document.execCommand('copy', false)
      }
    })

    on('edit-paste', () => {
      // Focus the editor and execute paste command
      const editor = document.querySelector('.tiptap') as any
      if (editor?.focus) {
        editor.focus()
        document.execCommand('paste', false)
      }
    })

    on('edit-select-all', () => {
      // Trigger select-all in the editor
      const editor = document.querySelector('.tiptap') as any
      if (editor?.focus) {
        editor.focus()
        document.execCommand('selectAll', false)
      }
    })

    on('vcs-commit', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('commit')
    })

    on('vcs-log', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('log')
      loadVcsLog()
    })

    on('vcs-diff', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('diff')
    })

    on('vcs-branch', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('branches')
    })

    on('vcs-switch', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('branches')
      loadBranches()
    })

    on('vcs-revert', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('log')
      loadVcsLog()
    })

    on('command-palette', () => {
      useAppStore.getState().setCommandPaletteOpen(true)
    })

    on('file-new-template', () => {
      useAppStore.getState().setTemplateGalleryOpen(true)
    })

    on('file-export-pdf', () => {
      useAppStore.getState().setExportDialogOpen(true)
    })

    on('export-markdown', async (args: ExportMarkdownEvent) => {
      const { filePath } = args
      if (filePath) {
        const content = useAppStore.getState().documentContent
        const result = await window.wordapp?.file.exportMarkdown(filePath, content)
        if (result?.success) {
          useAppStore.getState().addToast('success', 'Markdown exported successfully')
        }
      }
    })

    on('tab-new', () => {
      useAppStore.getState().addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })
    })

    on('toggle-split-view', () => {
      useAppStore.getState().setSplitViewOpen(!useAppStore.getState().splitViewOpen)
    })

    on('save-as-template', async () => {
      const name = prompt('Template name:')
      if (!name) return
      const content = useAppStore.getState().documentContent
      const result = await window.wordapp?.template.customSave(name, content)
      if (result?.success) {
        useAppStore.getState().addToast('success', `Template "${name}" saved`)
      }
    })

    on('export-epub', async (args: ExportEpubEvent) => {
      const { filePath } = args
      if (filePath) {
        const content = useAppStore.getState().documentContent
        const result = await window.wordapp?.file.exportEpub(filePath, content)
        if (result?.success) {
          const warning = result.warning
          useAppStore.getState().addToast(warning ? 'warning' : 'success', warning || 'EPUB exported successfully')
        } else {
          useAppStore.getState().addToast('error', `Export failed: ${result?.error || 'unknown error'}`)
        }
      }
    })

    on('update-available', (args: UpdateAvailableEvent) => {
      const { version, url } = args
      useAppStore.getState().setUpdateAvailable(true, version, url)
    })

    // Load recent files
    window.wordapp?.recent.list().then((files) => {
      if (files) useAppStore.getState().setRecentFiles(files)
    }).catch((err) => useAppStore.getState().addToast('warning', `Failed to load recent files: ${(err as Error).message}`))

    // Check for updates on startup (best-effort — don't bother user if this fails)
    window.wordapp?.update.check().catch(() => {})

    on('plugin:editor-insert', (data: PluginEditorInsertEvent) => {
      const { content } = data
      const state = useAppStore.getState()
      useAppStore.getState().setDocumentContent(state.documentContent + content)
    })

    on('plugin:editor-replace-selection', (data: PluginEditorReplaceSelectionEvent) => {
      const { content } = data
      useAppStore.getState().addToast('info', `Plugin wants to replace selection with: ${content.slice(0, 30)}`)
    })

    on('plugin:register-command', (data: PluginRegisterCommandEvent) => {
      const { command, pluginName } = data
      useAppStore.getState().addPluginCommand({ ...command, pluginName })
    })

    on('plugin:add-toolbar-button', (data: PluginAddToolbarButtonEvent) => {
      const { button, pluginName } = data
      useAppStore.getState().addPluginToolbarButton({ ...button, pluginName })
    })

    on('plugin:notification', (data: PluginNotificationEvent) => {
      const { message, type } = data
      useAppStore.getState().addToast((type as 'success' | 'error' | 'warning' | 'info') || 'info', message)
    })

    // Keyboard shortcuts for v0.3.8 features
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+H (or Cmd+H): Open Find & Replace
      if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
        event.preventDefault()
        useAppStore.getState().setFindReplaceOpen(!useAppStore.getState().findReplaceOpen)
      }
      // Ctrl+Shift+E (or Cmd+Shift+E): Open Export Dialog
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'e') {
        event.preventDefault()
        useAppStore.getState().setExportDialogOpen(true)
      }
      // Ctrl+Shift+I (or Cmd+Shift+I): Open Import Dialog
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'i') {
        event.preventDefault()
        useAppStore.getState().setImportDialogOpen(true)
      }
      // Ctrl+Shift+B (or Cmd+Shift+B): Bundle Export (document + storyboard + memory)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'b') {
        event.preventDefault()
        handleBundleExport()
      }
      // Ctrl+Shift+L (or Cmd+Shift+L): Bundle Import
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'l') {
        event.preventDefault()
        handleBundleImport()
      }
      // v0.4.0: Ctrl+Shift+A (or Cmd+Shift+A): Open Accessibility Settings
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'a') {
        event.preventDefault()
        useAppStore.getState().setAccessibilityPanelOpen(true)
      }
      // v0.4.0: Ctrl+Shift+T (or Cmd+Shift+T): Open Theme Customizer
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 't') {
        event.preventDefault()
        useAppStore.getState().setThemeCustomizerOpen(true)
      }
      // v0.4.0: Ctrl+Shift+F (or Cmd+Shift+F): Open Font Manager
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'f') {
        event.preventDefault()
        useAppStore.getState().setFontManagerOpen(true)
      }
      // v0.4.1: Ctrl+Shift+S (or Cmd+Shift+S): Open Global Search
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 's') {
        event.preventDefault()
        useAppStore.getState().setGlobalSearchOpen(true)
      }
      // v0.4.1: Ctrl+G (or Cmd+G): Open Go to Line Dialog
      if ((event.ctrlKey || event.metaKey) && event.key === 'g') {
        event.preventDefault()
        useAppStore.getState().setGoToLineDialogOpen(true)
      }
      // v0.4.2: Ctrl+Shift+C (or Cmd+Shift+C): Open Spell Check Panel
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'c') {
        event.preventDefault()
        useAppStore.getState().setSpellCheckPanelOpen(!useAppStore.getState().spellCheckPanelOpen)
      }
      // v0.4.2: Ctrl+Shift+G (or Cmd+Shift+G): Open Grammar Panel
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'g') {
        event.preventDefault()
        useAppStore.getState().setGrammarPanelOpen(!useAppStore.getState().grammarPanelOpen)
      }
      // v0.4.2: Ctrl+Shift+W (or Cmd+Shift+W): Open Writing Suggestions Panel
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'w') {
        event.preventDefault()
        useAppStore.getState().setWritingPanelOpen(!useAppStore.getState().writingPanelOpen)
      }
      // v0.4.3: Ctrl+Shift+K (or Cmd+Shift+K): Open Keyboard Shortcuts Cheat Sheet
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'k') {
        event.preventDefault()
        useAppStore.getState().setShortcutCheatSheetOpen(!useAppStore.getState().shortcutCheatSheetOpen)
      }
      // v0.4.5: Ctrl+Alt+L (or Cmd+Alt+L): Open Collaboration Timeline
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === 'l') {
        event.preventDefault()
        useAppStore.getState().setCollaborationTimelineOpen(!useAppStore.getState().collaborationTimelineOpen)
      }
      // v0.4.5: Ctrl+Alt+H (or Cmd+Alt+H): Open Edit History
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === 'h') {
        event.preventDefault()
        useAppStore.getState().setEditHistoryOpen(!useAppStore.getState().editHistoryOpen)
      }
      // v0.4.5: Ctrl+Alt+X (or Cmd+Alt+X): Open Conflict Resolution
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === 'x') {
        event.preventDefault()
        useAppStore.getState().setConflictResolutionOpen(!useAppStore.getState().conflictResolutionOpen)
      }
      // v0.4.6: Ctrl+? (or Cmd+?) or F1: Open Help
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === '?') {
        event.preventDefault()
        useAppStore.getState().setHelpPanelOpen(!useAppStore.getState().helpPanelOpen)
      }
      if (event.key === 'F1') {
        event.preventDefault()
        useAppStore.getState().setHelpPanelOpen(!useAppStore.getState().helpPanelOpen)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsubs.forEach((u) => u())
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const loadVcsLog = async () => {
    const commits = await window.wordapp.vcs.log()
    useAppStore.getState().setCommits(commits)
  }

  const loadBranches = async () => {
    const branches = await window.wordapp.vcs.listBranches()
    useAppStore.getState().setBranches(branches)
  }

  const handleExportPdf = async () => {
    const filePath = await window.wordapp?.file.saveAsDialog([
      { name: 'PDF', extensions: ['pdf'] }
    ])
    if (filePath) {
      const result = await window.wordapp?.file.exportPdf(filePath)
      if (result?.success) {
        useAppStore.getState().addToast('success', 'PDF exported successfully')
      } else {
        useAppStore.getState().addToast('error', `PDF export failed: ${result?.error || 'unknown error'}`)
      }
    }
  }

  const handleExport = async (format: ExportFormat, options: Record<string, unknown>) => {
    const state = useAppStore.getState()
    useAppStore.getState().setIsExporting(true)

    try {
      let content = ''
      let fileName = `${state.documentTitle || 'Document'}`
      let extension = 'txt'

      switch (format) {
        case 'pdf': {
          const pdfOptions = options as PdfExportOptions
          const { html } = preparePdfContent(state.documentContent, pdfOptions)
          // PDF export would be handled by electron backend
          const filePath = await window.wordapp?.file.saveAsDialog([{ name: 'PDF', extensions: ['pdf'] }])
          if (filePath) {
            const result = await window.wordapp?.file.exportPdf(filePath)
            if (result?.success) {
              useAppStore.getState().addToast('success', 'PDF exported successfully')
            } else {
              useAppStore.getState().addToast('error', `Export failed: ${result?.error}`)
            }
          }
          return
        }

        case 'epub':
          content = convertToEpub(state.documentContent, state.documentTitle)
          extension = 'epub'
          break

        case 'latex':
          content = convertToLatex(state.documentContent, state.documentTitle)
          extension = 'tex'
          break

        case 'rtf':
          content = convertToRtf(state.documentContent, state.documentTitle)
          extension = 'rtf'
          break

        case 'csv':
          content = convertToCSV(state.documentContent)
          extension = 'csv'
          break
      }

      const filePath = await window.wordapp?.file.saveAsDialog([
        { name: format.toUpperCase(), extensions: [extension] }
      ])

      if (filePath) {
        const success = await window.wordapp?.file.saveFile(filePath, content)
        if (success) {
          useAppStore.getState().addToast('success', `Exported as ${format.toUpperCase()} successfully`)
        } else {
          useAppStore.getState().addToast('error', 'Export failed')
        }
      }
    } catch (err) {
      useAppStore.getState().addToast('error', `Export error: ${(err as Error).message}`)
    } finally {
      useAppStore.getState().setIsExporting(false)
    }
  }

  const handleImport = async (content: string, title?: string) => {
    try {
      useAppStore.getState().setDocumentContent(content)
      if (title) {
        useAppStore.getState().setDocumentTitle(title)
      }
      useAppStore.getState().setDirty(true)
      useAppStore.getState().addToast('success', 'Document imported successfully')
    } catch (err) {
      useAppStore.getState().addToast('error', `Import error: ${(err as Error).message}`)
    } finally {
      useAppStore.getState().setIsImporting(false)
    }
  }

  const handleBundleExport = async () => {
    try {
      const state = useAppStore.getState()
      const filePath = await window.wordapp?.agent.bundleSaveDialog()
      if (!filePath) return

      // Gather storyboard content
      let storyboardContent = ''
      if (state.currentFilePath) {
        try {
          const sbResult = await window.wordapp?.storyboard.read(state.currentFilePath)
          storyboardContent = (sbResult as any)?.content || ''
        } catch {}
      }

      // Gather memory entries for this document
      const docId = state.currentFilePath || state.activeTabId || 'default'
      const memoryEntries = await window.wordapp?.agent.memoryGet(docId) || []

      const result = await window.wordapp?.agent.bundleExport({
        filePath,
        documentContent: state.documentContent,
        documentTitle: state.documentTitle || 'Document',
        storyboardContent,
        documentPath: state.currentFilePath,
        memoryEntries: memoryEntries as Array<Record<string, unknown>>
      })

      if (result?.success) {
        useAppStore.getState().addToast('success', `Bundle exported: ${result.files?.join(', ') || 'document'}`)
      } else {
        useAppStore.getState().addToast('error', `Bundle export failed: ${result?.error}`)
      }
    } catch (err) {
      useAppStore.getState().addToast('error', `Bundle export error: ${(err as Error).message}`)
    }
  }

  const handleBundleImport = async () => {
    try {
      const zipPath = await window.wordapp?.agent.bundleOpenDialog()
      if (!zipPath) return

      const bundle = await window.wordapp?.agent.bundleImport(zipPath)
      if (!bundle?.success) {
        useAppStore.getState().addToast('error', `Bundle import failed: ${bundle?.error}`)
        return
      }

      // Load document content
      if (bundle.documentContent) {
        useAppStore.getState().setDocumentContent(bundle.documentContent)
        useAppStore.getState().setDocumentTitle(bundle.documentTitle || 'Imported Document')
        useAppStore.getState().setDirty(true)
      }

      // Load storyboard content
      if (bundle.storyboardContent && useAppStore.getState().currentFilePath) {
        try {
          await window.wordapp?.storyboard.write(useAppStore.getState().currentFilePath!, bundle.storyboardContent)
        } catch {}
      }

      // Load memory entries — save each one to the memory store
      if (bundle.memoryEntries && bundle.memoryEntries.length > 0) {
        const docId = useAppStore.getState().currentFilePath || useAppStore.getState().activeTabId || 'default'
        for (const entry of bundle.memoryEntries) {
          const e = entry as any
          await window.wordapp?.agent.memorySave(
            docId,
            e.type || 'fact',
            e.content || '',
            e.scope || 'document'
          )
        }
        useAppStore.getState().addToast('success', `Bundle imported: ${bundle.documentTitle}, ${bundle.memoryEntries.length} memory entries`)
      } else {
        useAppStore.getState().addToast('success', `Bundle imported: ${bundle.documentTitle}`)
      }
    } catch (err) {
      useAppStore.getState().addToast('error', `Bundle import error: ${(err as Error).message}`)
    }
  }

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
        <MenuBar />
        <div className="app-layout" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <EnhancedEditorPanel />
            <MdPreview />
          </div>
          {chatSidebarOpen && <Suspense fallback={<div />}><><AgentWorkspacePanel /><TaskListPopup /></></Suspense>}
          {outlineOpen && <Suspense fallback={<div />}><OutlinePanel /></Suspense>}
          {docStatsPanelOpen && <Suspense fallback={<div />}><DocStatsPanel /></Suspense>}
        </div>
      </div>
      {vcsPanelOpen && <Suspense fallback={<div />}><VcsPanel /></Suspense>}
      {settingsPanelOpen && <Suspense fallback={<div />}><SettingsPanel /></Suspense>}
      {commandPaletteOpen && <Suspense fallback={<div />}><CommandPalette /></Suspense>}
      {collabPanelOpen && <Suspense fallback={<div />}><CollabPanel /></Suspense>}
      {findReplaceOpen && <Suspense fallback={<div />}><EnhancedFindReplaceBar /></Suspense>}
      {exportDialogOpen && (
        <Suspense fallback={<div />}>
          <ExportDialog
            open={exportDialogOpen}
            onClose={() => setExportDialogOpen(false)}
            onExport={handleExport}
            documentTitle={documentTitle}
            contentLength={documentContent.length}
          />
        </Suspense>
      )}
      {importDialogOpen && (
        <Suspense fallback={<div />}>
          <ImportDialog
            open={importDialogOpen}
            onClose={() => setImportDialogOpen(false)}
            onImport={handleImport}
          />
        </Suspense>
      )}
      {/* v0.4.0: Accessibility and Theme Customization Dialogs */}
      <AccessibilityPanel
        open={accessibilityPanelOpen}
        onClose={() => setAccessibilityPanelOpen(false)}
      />
      <ThemeCustomizer
        open={themeCustomizerOpen}
        onClose={() => setThemeCustomizerOpen(false)}
      />
      <Suspense fallback={<div />}>
        <FontManager
          open={fontManagerOpen}
          onClose={() => setFontManagerOpen(false)}
        />
      </Suspense>
      {/* v0.4.1: Search & Navigation Dialogs */}
      <GlobalSearchPanel
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
      />
      <GoToLineDialog
        open={goToLineDialogOpen}
        onClose={() => setGoToLineDialogOpen(false)}
      />
      {/* v0.4.2: Spell Check & Grammar */}
      <SpellCheckPanel />
      <Suspense fallback={<div />}><GrammarPanel /></Suspense>
      <WritingSuggestionsPanel />
      {/* v0.4.3: Keyboard & Shortcuts */}
      <KeyboardShortcutsPanel />
      <AgentCommandBar />
      <StoryboardEditor />
      <ShortcutCheatSheet />
      <FloatingToolbar />
      <InlineEditModal />
      <ToastContainer />
      <CommentPanel />
      {/* v0.4.5: Collaboration 2.0 Components */}
      <CollaborationTimelinePanel />
      <ConflictResolutionPanel />
      <EditHistoryPanel />
      {/* v0.4.6: Documentation & Help Components */}
      <HelpPanel />
      <TutorialMode />
      <FeatureHighlights />
      <TemplateGalleryDialog />
      {/* v0.4.7: AI Writing Assistant */}
      <AIAssistantPanel />
      {/* v0.4.9: Performance Optimization */}
      {performanceDashboardOpen && <Suspense fallback={<div />}><PerformanceOptimization /></Suspense>}
      {/* v0.5.0: Cloud & Sync */}
      {cloudSettingsPanelOpen && <Suspense fallback={<div />}><CloudSettingsPanel /></Suspense>}
      {backupManagementPanelOpen && <Suspense fallback={<div />}><BackupManagementPanel /></Suspense>}
      {/* v0.5.1: Security & Privacy */}
      {documentEncryptionPanelOpen && <Suspense fallback={<div />}><DocumentEncryptionPanel /></Suspense>}
      {accessControlPanelOpen && <Suspense fallback={<div />}><AccessControlPanel /></Suspense>}
      {auditLogViewerOpen && <Suspense fallback={<div />}><AuditLogViewer /></Suspense>}
      {/* v0.4.7: Inline Smart Suggestions (now rendered as ghost text in editor) */}
      <TableOfContentsPanel />
      <PrintPreview />
    </ThemeProvider>
  )
}
