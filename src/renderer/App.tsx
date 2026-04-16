import React, { useEffect } from 'react'
import { EditorPanel } from './components/EditorPanel'
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
import { ThemeProvider } from './ThemeProvider'
import { useAppStore } from './store/app-store'
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

declare global {
  interface Window {
    wordapp: {
      vcs: {
        commit: (message: string, content: string) => Promise<{ id: string; message: string; timestamp: number }>
        log: () => Promise<Array<{ id: string; message: string; timestamp: number; parents: string[]; branch: string }>>
        diff: (fromId?: string, toId?: string) => Promise<{ from: string; to: string; changes: Array<{ type: string; line: number; content: string }> }>
        createBranch: (name: string) => Promise<{ name: string; head: string }>
        switchBranch: (name: string) => Promise<boolean>
        listBranches: () => Promise<Array<{ name: string; head: string; current: boolean }>>
        revert: (commitId: string) => Promise<string | null>
        currentBranch: () => Promise<string>
        merge: (sourceBranch: string, content: string, message?: string) => Promise<VcsMergeResult>
        cherryPick: (commitId: string) => Promise<string | null>
        createTag: (name: string, commitId?: string) => Promise<{ name: string; commitId: string }>
        deleteTag: (name: string) => Promise<boolean>
        listTags: () => Promise<Array<{ name: string; commitId: string; timestamp: number }>>
        graphLanes: () => Promise<VcsGraphLanesResult>
        stashPush: (message?: string) => Promise<VcsStashEntry>
        stashPop: () => Promise<VcsStashEntry | null>
        stashApply: (id: string) => Promise<VcsStashEntry | null>
        stashDrop: (id: string) => Promise<boolean>
        stashList: () => Promise<VcsStashEntry[]>
        rebaseSquash: (commitIds: string[], message?: string) => Promise<{ success: boolean }>
        rebaseReorder: (commitIds: string[]) => Promise<boolean>
        rebaseEdit: (commitId: string, newMessage: string) => Promise<boolean>
        blame: (content: string) => Promise<VcsBlameLine[]>
        exportPatch: (fromId?: string, toId?: string) => Promise<string>
        exportPatchFile: (filePath: string, fromId?: string, toId?: string) => Promise<{ success: boolean }>
        importPatch: (patchContent: string) => Promise<VcsImportPatchResult>
        getHooks: () => Promise<VcsHooks>
        setHooks: (hooks: VcsHooks) => Promise<VcsHooks>
        validateCommit: (message: string) => Promise<VcsValidateCommitResult>
      }
      agent: {
        executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
        listTools: () => Promise<Array<{ name: string; description: string }>>
        configure: (config: { endpoint?: string; apiKey?: string; model?: string }) => Promise<{ endpoint: string; apiKey: string; model: string }>
        configureAdvanced: (opts: { maxToolTurns?: number; temperature?: number }) => Promise<{ success: boolean }>
        getAdvanced: () => Promise<{ maxToolTurns: number; temperature: number }>
        suggest: (docContent: string) => Promise<Array<{ type: string; message: string; context: string }>>
        chatStream: (messages: Array<{ role: string; content: string }>, context: Record<string, unknown>) => Promise<void>
        abort: () => Promise<void>
        listPresets: () => Promise<Array<{ id: string; name: string; endpoint: string; apiKey: string; model: string }>>
        addPreset: (preset: { name: string; endpoint: string; apiKey: string; model: string }) => Promise<{ id: string; name: string; endpoint: string; apiKey: string; model: string }>
        applyPreset: (id: string) => Promise<{ endpoint: string; apiKey: string; model: string } | null>
        deletePreset: (id: string) => Promise<boolean>
        getPresets: () => Promise<Array<{ id: string; name: string; endpoint: string; apiKey: string; model: string }>>
        getScratchpad: () => Promise<string>
        setScratchpad: (content: string) => Promise<{ success: boolean }>
        sessionGetOrCreate: (documentId: string, agentName: string, systemPrompt?: string) => Promise<AgentSession>
        sessionAddMessage: (sessionId: string, role: string, content: string) => Promise<{ success: boolean }>
        sessionMessages: (sessionId: string) => Promise<Array<{ role: string; content: string }>>
        sessionClear: (sessionId: string) => Promise<{ success: boolean }>
        sessionDelete: (sessionId: string) => Promise<{ success: boolean }>
        sessionList: (documentId?: string) => Promise<AgentSession[]>
        profiles: () => Promise<AgentProfile[]>
        profileAdd: (profile: { name: string; role: string; systemPrompt: string; color: string }) => Promise<AgentProfile>
        profileDelete: (id: string) => Promise<boolean>
        multiRun: (documentId: string, userMessage: string, agentNames: string[], context?: { documentContent?: string; currentBranch?: string; selection?: string }) => Promise<AgentMultiRunResult[]>
        // v0.3.4: Inline suggestions
        inlineSuggest: (documentContent: string, cursorPosition: number, contextBefore: string) => Promise<string | null>
        summarize: (documentContent: string, style: string, maxLength: number) => Promise<string>
        plugin: {
          list: () => Promise<PluginManifest[]>
          get: (name: string) => Promise<PluginManifest | null>
          install: (manifest: PluginManifest, code: string) => Promise<PluginManifest | null>
          uninstall: (name: string) => Promise<boolean>
          enable: (name: string) => Promise<boolean>
          disable: (name: string) => Promise<boolean>
          marketplace: () => Promise<PluginMarketplaceEntry[]>
          builtinCode: (name: string) => Promise<string | null>
        }
      }
      file: {
        openDialog: () => Promise<string | null>
        saveDialog: () => Promise<string | null>
        saveAsDialog: (filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
        importDocx: (filePath: string) => Promise<{ content: string; filePath: string }>
        saveFile: (filePath: string, content: string) => Promise<{ success: boolean }>
        exportPdf: (filePath: string) => Promise<FileExportResult>
        exportMarkdown: (filePath: string, content: string) => Promise<{ success: boolean }>
        exportEpub: (filePath: string, content: string) => Promise<FileExportResult>
        openImageDialog: () => Promise<string | null>
      }
      template: {
        customSave: (name: string, content: string) => Promise<{ success: boolean }>
        customList: () => Promise<Array<{ name: string }>>
        get: (name: string) => Promise<{ content: string }>
        delete: (name: string) => Promise<{ success: boolean }>
      }
      recent: {
        list: () => Promise<string[]>
        clear: () => Promise<void>
      }
      update: {
        check: () => Promise<{ available: boolean; version?: string; url?: string }>
      }
      markdown: {
        toHtml: (md: string) => Promise<string>
      }
      settings: {
        setSpellCheckLang: (lang: string) => Promise<{ success: boolean }>
        vcsAutoCommit: (message: string, content: string) => Promise<{ id: string; message: string; timestamp: number }>
        vcsPruneCommits: (max: number) => Promise<{ pruned: number }>
      }
      docStats: {
        compute: (htmlContent: string) => Promise<{
          fleschKincaid: number
          avgSentenceLen: number
          paragraphCount: number
          readingTimeMin: number
          sentenceCount: number
          syllableCount: number
        }>
      }
      collab: {
        start: (port: number) => Promise<CollabStartResult>
        stop: () => Promise<{ status: string }>
        status: () => Promise<CollabStatusResult>
        generateCode: () => Promise<CollabGenerateCodeResult>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => void
    }
  }
}

export const App: React.FC = () => {
  const { vcsPanelOpen, settingsPanelOpen, commandPaletteOpen, updateAvailable, updateVersion, updateUrl } = useAppStore()

  useEffect(() => {
    window.wordapp?.agent.listTools().then((tools) => {
      useAppStore.getState().setAvailableTools(tools)
    }).catch((err) => useAppStore.getState().addToast('error', `Failed to load agent tools: ${(err as Error).message}`))

    window.wordapp?.vcs.currentBranch().then((branch) => {
      useAppStore.getState().setCurrentBranch(branch)
    }).catch((err) => useAppStore.getState().addToast('warning', `Failed to get current branch: ${(err as Error).message}`))
  }, [])

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
      useAppStore.getState().setCommandPaletteOpen(true)
    })

    window.wordapp.on('file-export-pdf', () => {
      handleExportPdf()
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

  return (
    <ThemeProvider>
      <div className="app-layout">
        <EditorPanel />
        <AgentWorkspacePanel />
        <MdPreview />
      </div>
      {vcsPanelOpen && <VcsPanel />}
      {settingsPanelOpen && <SettingsPanel />}
      {commandPaletteOpen && <CommandPalette />}
      {useAppStore.getState().collabPanelOpen && <CollabPanel />}
      <OutlinePanel />
      <DocStatsPanel />
      <InlineEditModal />
      <ToastContainer />
      <CommentPanel />
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
