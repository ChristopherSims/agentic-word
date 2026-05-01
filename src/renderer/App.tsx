import React, { useEffect } from 'react'
import { EnhancedEditorPanel } from './components/EnhancedEditorPanel'
import { AgentWorkspacePanel } from './components/AgentWorkspacePanel'
import { VcsPanel } from './components/VcsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { CommandPalette } from './components/CommandPalette'
import { TabBar } from './components/TabBar'
import { ToastContainer } from './components/ToastContainer'
import { MdPreview } from './components/MdPreview'
import { OutlinePanel } from './components/OutlinePanel'
import { DocStatsPanel } from './components/DocStatsPanel'
import { InlineEditModal } from './components/InlineEditModal'
import { CollabPanel } from './components/CollabPanel'
import { CommentPanel } from './components/CommentPanel'
import { TableOfContentsPanel } from './components/TableOfContentsPanel'
import { PrintPreview } from './components/PrintPreview'
import { EnhancedFindReplaceBar } from './components/EnhancedFindReplaceBar'
import { FloatingToolbar } from './components/FloatingToolbar'
import { ExportDialog } from './components/ExportDialog'
import { ImportDialog } from './components/ImportDialog'
import { AccessibilityPanel } from './components/AccessibilityPanel'
import { ThemeCustomizer } from './components/ThemeCustomizer'
import { FontManager } from './components/FontManager'
import { CustomTitleBar } from './components/CustomTitleBar'
import { GlobalSearchPanel } from './components/GlobalSearchPanel'
import { GoToLineDialog } from './components/GoToLineDialog'
import { BreadcrumbNav } from './components/BreadcrumbNav'
import { SpellCheckPanel } from './components/SpellCheckPanel'
import { GrammarPanel } from './components/GrammarPanel'
import { WritingSuggestionsPanel } from './components/WritingSuggestionsPanel'
import { KeyboardShortcutsPanel } from './components/KeyboardShortcutsPanel'
import { ShortcutCheatSheet } from './components/ShortcutCheatSheet'
import { CollaborationTimelinePanel } from './components/CollaborationTimelinePanel'
import { ConflictResolutionPanel } from './components/ConflictResolutionPanel'
import { EditHistoryPanel } from './components/EditHistoryPanel'
import { HelpPanel } from './components/HelpPanel'
import { AIAssistantPanel } from './components/AIAssistantPanel'
import { HelpMenu } from './components/HelpMenu'
import { PerformanceOptimization } from './components/PerformanceOptimization'
import { CloudSettingsPanel } from './components/CloudSettingsPanel'
import { BackupManagementPanel } from './components/BackupManagementPanel'
import { DocumentEncryptionPanel } from './components/DocumentEncryptionPanel'
import { AccessControlPanel } from './components/AccessControlPanel'
import { AuditLogViewer } from './components/AuditLogViewer'
import { TutorialMode } from './components/TutorialMode'
import { FeatureHighlights } from './components/FeatureHighlights'
import TemplateGalleryDialog from './components/TemplateGalleryDialog'
import { ThemeProvider } from './ThemeProvider'
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

export const App: React.FC = () => {
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
    setCollabMcpPort
  } = useAppStore()
  const documentContent = useAppStore((state) => state.documentContent)
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

  // Update text statistics in real-time as document content changes
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
    if (!window.wordapp) return

    window.wordapp.on('file-new', () => {
      useAppStore.getState().setDocumentContent('')
      useAppStore.getState().setDocumentTitle('Untitled')
      useAppStore.getState().setCurrentFilePath(null)
      useAppStore.getState().setDirty(false)
    })

    window.wordapp.on('file-save', () => {
      // Triggered by Ctrl+S menu shortcut — EditorPanel handles the actual save
    })

    window.wordapp.on('file-save-as', (args: FileSaveAsEvent) => {
      const { filePath } = args
      if (filePath) {
        const state = useAppStore.getState()
        window.wordapp?.file.saveFile(filePath, state.documentContent).then(() => {
          useAppStore.getState().setCurrentFilePath(filePath)
          useAppStore.getState().setDirty(false)
          useAppStore.getState().addToast('success', 'File saved')
        })
      }
    })

    // Track opening state for progress indicator
    let isOpeningFile = false

    window.wordapp.on('file-opened', (args: FileOpenedEvent) => {
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
    window.wordapp.on('dialog-open', () => {
      isOpeningFile = true
      useAppStore.getState().addToast('info', 'Opening file...')
    })

    window.wordapp.on('vcs-commit', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('commit')
    })

    window.wordapp.on('vcs-log', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('log')
      loadVcsLog()
    })

    window.wordapp.on('vcs-diff', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('diff')
    })

    window.wordapp.on('vcs-branch', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('branches')
    })

    window.wordapp.on('vcs-switch', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('branches')
      loadBranches()
    })

    window.wordapp.on('vcs-revert', () => {
      useAppStore.getState().setVcsPanelOpen(true)
      useAppStore.getState().setVcsPanelView('log')
      loadVcsLog()
    })

    window.wordapp.on('command-palette', () => {
      useAppStore.getState().setCommandPaletteOpen(true)
    })

    window.wordapp.on('file-new-template', () => {
      useAppStore.getState().setTemplateGalleryOpen(true)
    })

    window.wordapp.on('file-export-pdf', () => {
      useAppStore.getState().setExportDialogOpen(true)
    })

    window.wordapp.on('export-markdown', async (args: ExportMarkdownEvent) => {
      const { filePath } = args
      if (filePath) {
        const content = useAppStore.getState().documentContent
        const result = await window.wordapp?.file.exportMarkdown(filePath, content)
        if (result?.success) {
          useAppStore.getState().addToast('success', 'Markdown exported successfully')
        }
      }
    })

    window.wordapp.on('tab-new', () => {
      useAppStore.getState().addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })
    })

    window.wordapp.on('toggle-split-view', () => {
      useAppStore.getState().setSplitViewOpen(!useAppStore.getState().splitViewOpen)
    })

    window.wordapp.on('save-as-template', async () => {
      const name = prompt('Template name:')
      if (!name) return
      const content = useAppStore.getState().documentContent
      const result = await window.wordapp?.template.customSave(name, content)
      if (result?.success) {
        useAppStore.getState().addToast('success', `Template "${name}" saved`)
      }
    })

    window.wordapp.on('export-epub', async (args: ExportEpubEvent) => {
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

    window.wordapp.on('update-available', (args: UpdateAvailableEvent) => {
      const { version, url } = args
      useAppStore.getState().setUpdateAvailable(true, version, url)
    })

    // Load recent files
    window.wordapp?.recent.list().then((files) => {
      if (files) useAppStore.getState().setRecentFiles(files)
    }).catch((err) => useAppStore.getState().addToast('warning', `Failed to load recent files: ${(err as Error).message}`))

    // Check for updates on startup (best-effort — don't bother user if this fails)
    window.wordapp?.update.check().catch(() => {})

    window.wordapp?.on('plugin:editor-insert', (data: PluginEditorInsertEvent) => {
      const { content } = data
      const state = useAppStore.getState()
      useAppStore.getState().setDocumentContent(state.documentContent + content)
    })

    window.wordapp?.on('plugin:editor-replace-selection', (data: PluginEditorReplaceSelectionEvent) => {
      const { content } = data
      useAppStore.getState().addToast('info', `Plugin wants to replace selection with: ${content.slice(0, 30)}`)
    })

    window.wordapp?.on('plugin:register-command', (data: PluginRegisterCommandEvent) => {
      const { command, pluginName } = data
      useAppStore.getState().addPluginCommand({ ...command, pluginName })
    })

    window.wordapp?.on('plugin:add-toolbar-button', (data: PluginAddToolbarButtonEvent) => {
      const { button, pluginName } = data
      useAppStore.getState().addPluginToolbarButton({ ...button, pluginName })
    })

    window.wordapp?.on('plugin:notification', (data: PluginNotificationEvent) => {
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

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
        <CustomTitleBar title="Lexicon" showControls={true} />
        <BreadcrumbNav />
        <div className="app-layout" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <EnhancedEditorPanel />
            <MdPreview />
          </div>
          {useAppStore.getState().chatSidebarOpen && <AgentWorkspacePanel />}
          {outlineOpen && <OutlinePanel />}
          {docStatsPanelOpen && <DocStatsPanel />}
        </div>
      </div>
      {vcsPanelOpen && <VcsPanel />}
      {settingsPanelOpen && <SettingsPanel />}
      {commandPaletteOpen && <CommandPalette />}
      {collabPanelOpen && <CollabPanel />}
      {useAppStore.getState().findReplaceOpen && <EnhancedFindReplaceBar />}
      {useAppStore.getState().exportDialogOpen && (
        <ExportDialog
          open={useAppStore.getState().exportDialogOpen}
          onClose={() => useAppStore.getState().setExportDialogOpen(false)}
          onExport={handleExport}
          documentTitle={useAppStore.getState().documentTitle}
          contentLength={useAppStore.getState().documentContent.length}
        />
      )}
      {useAppStore.getState().importDialogOpen && (
        <ImportDialog
          open={useAppStore.getState().importDialogOpen}
          onClose={() => useAppStore.getState().setImportDialogOpen(false)}
          onImport={handleImport}
        />
      )}
      {/* v0.4.0: Accessibility and Theme Customization Dialogs */}
      <AccessibilityPanel
        open={useAppStore.getState().accessibilityPanelOpen}
        onClose={() => useAppStore.getState().setAccessibilityPanelOpen(false)}
      />
      <ThemeCustomizer
        open={useAppStore.getState().themeCustomizerOpen}
        onClose={() => useAppStore.getState().setThemeCustomizerOpen(false)}
      />
      <FontManager
        open={useAppStore.getState().fontManagerOpen}
        onClose={() => useAppStore.getState().setFontManagerOpen(false)}
      />
      {/* v0.4.1: Search & Navigation Dialogs */}
      <GlobalSearchPanel
        open={useAppStore.getState().globalSearchOpen}
        onClose={() => useAppStore.getState().setGlobalSearchOpen(false)}
      />
      <GoToLineDialog
        open={useAppStore.getState().goToLineDialogOpen}
        onClose={() => useAppStore.getState().setGoToLineDialogOpen(false)}
      />
      {/* v0.4.2: Spell Check & Grammar */}
      <SpellCheckPanel />
      <GrammarPanel />
      <WritingSuggestionsPanel />
      {/* v0.4.3: Keyboard & Shortcuts */}
      <KeyboardShortcutsPanel />
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
      {useAppStore.getState().performanceDashboardOpen && <PerformanceOptimization />}
      {/* v0.5.0: Cloud & Sync */}
      {useAppStore.getState().cloudSettingsPanelOpen && <CloudSettingsPanel />}
      {useAppStore.getState().backupManagementPanelOpen && <BackupManagementPanel />}
      {/* v0.5.1: Security & Privacy */}
      {useAppStore.getState().documentEncryptionPanelOpen && <DocumentEncryptionPanel />}
      {useAppStore.getState().accessControlPanelOpen && <AccessControlPanel />}
      {useAppStore.getState().auditLogViewerOpen && <AuditLogViewer />}
      {/* v0.4.7: Inline Smart Suggestions (now rendered as ghost text in editor) */}
      <TableOfContentsPanel />
      <PrintPreview />
      {updateAvailable && (
        <a className="update-badge" href={updateUrl} target="_blank" rel="noopener noreferrer" style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 999 }}>
          Update available: v{updateVersion}
        </a>
      )}
    </ThemeProvider>
  )
}
