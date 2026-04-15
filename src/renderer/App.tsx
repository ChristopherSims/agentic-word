import React, { useEffect } from 'react'
import { EditorPanel } from './components/EditorPanel'
import { ChatSidebar } from './components/ChatSidebar'
import { VcsPanel } from './components/VcsPanel'
import { AgentConfigModal } from './components/AgentConfigModal'
import { CommandPalette } from './components/CommandPalette'
import { useAppStore } from './store/app-store'

declare global {
  interface Window {
    wordapp: {
      vcs: {
        commit: (message: string, content: string) => Promise<{ id: string; message: string; timestamp: number }>
        log: () => Promise<Array<{ id: string; message: string; timestamp: number; parent: string | null; branch: string }>>
        diff: (fromId?: string, toId?: string) => Promise<{ from: string; to: string; changes: Array<{ type: string; line: number; content: string }> }>
        createBranch: (name: string) => Promise<{ name: string; head: string }>
        switchBranch: (name: string) => Promise<boolean>
        listBranches: () => Promise<Array<{ name: string; head: string; current: boolean }>>
        revert: (commitId: string) => Promise<string | null>
        currentBranch: () => Promise<string>
      }
      agent: {
        chat: (messages: Array<{ role: string; content: string }>) => Promise<unknown>
        executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
        listTools: () => Promise<Array<{ name: string; description: string }>>
        configure: (config: { endpoint?: string; apiKey?: string; model?: string }) => Promise<unknown>
      }
      file: {
        openDialog: () => Promise<string | null>
        saveDialog: () => Promise<string | null>
        importDocx: (filePath: string) => Promise<{ content: string; filePath: string }>
        saveFile: (filePath: string, content: string) => Promise<{ success: boolean }>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => void
    }
  }
}

export const App: React.FC = () => {
  const { chatSidebarOpen, vcsPanelOpen, agentConfigOpen, commandPaletteOpen, toggleChatSidebar } = useAppStore()

  useEffect(() => {
    window.wordapp?.agent.listTools().then((tools) => {
      useAppStore.getState().setAvailableTools(tools)
    }).catch(() => {})

    window.wordapp?.vcs.currentBranch().then((branch) => {
      useAppStore.getState().setCurrentBranch(branch)
    }).catch(() => {})
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

    window.wordapp.on('file-save-as', (args: unknown) => {
      const { filePath } = args as { filePath: string }
      if (filePath) {
        const state = useAppStore.getState()
        window.wordapp?.file.saveFile(filePath, state.documentContent).then(() => {
          useAppStore.getState().setCurrentFilePath(filePath)
          useAppStore.getState().setDirty(false)
        })
      }
    })

    window.wordapp.on('file-opened', (args: unknown) => {
      const { content, filePath } = args as { content: string; filePath: string }
      useAppStore.getState().setDocumentContent(content)
      useAppStore.getState().setCurrentFilePath(filePath)
      useAppStore.getState().setDocumentTitle(filePath.split(/[\\/]/).pop() || 'Untitled')
      useAppStore.getState().setDirty(false)
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

    window.wordapp.on('export-markdown', async (args: unknown) => {
      const { filePath } = args as { filePath: string }
      if (filePath) {
        const content = useAppStore.getState().documentContent
        const result = await window.wordapp?.file.exportMarkdown(filePath, content)
        if ((result as { success: boolean })?.success) {
          // success
        }
      }
    })
  }, [])

  const loadVcsLog = async () => {
    try {
      const commits = await window.wordapp.vcs.log()
      useAppStore.getState().setCommits(commits)
    } catch {}
  }

  const loadBranches = async () => {
    try {
      const branches = await window.wordapp.vcs.listBranches()
      useAppStore.getState().setBranches(branches)
    } catch {}
  }

  const handleExportPdf = async () => {
    const filePath = await window.wordapp?.file.saveAsDialog([
      { name: 'PDF', extensions: ['pdf'] }
    ])
    if (filePath) {
      const result = await window.wordapp?.file.exportPdf(filePath)
      if ((result as { success: boolean })?.success) {
        // success — could show a notification
      }
    }
  }

  return (
    <>
      <div className="app-layout">
        <EditorPanel />
        <ChatSidebar />
        <button
          className="toolbar-btn"
          style={{
            position: 'fixed',
            right: chatSidebarOpen ? 'var(--sidebar-width)' : '0',
            top: 'calc(var(--toolbar-height) + 4px)',
            zIndex: 50,
            transition: 'right 0.2s',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            width: 28,
            height: 28,
            fontSize: 12
          }}
          onClick={toggleChatSidebar}
          title={chatSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {chatSidebarOpen ? '▸' : '◂'}
        </button>
      </div>
      {vcsPanelOpen && <VcsPanel />}
      {agentConfigOpen && <AgentConfigModal />}
      {commandPaletteOpen && <CommandPalette />}
    </>
  )
}
