import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // VCS operations
  vcs: {
    commit: (message: string, content: string) => ipcRenderer.invoke('vcs-commit', message, content),
    log: () => ipcRenderer.invoke('vcs-log'),
    diff: (fromId?: string, toId?: string) => ipcRenderer.invoke('vcs-diff', fromId, toId),
    createBranch: (name: string) => ipcRenderer.invoke('vcs-branch-create', name),
    switchBranch: (name: string) => ipcRenderer.invoke('vcs-branch-switch', name),
    listBranches: () => ipcRenderer.invoke('vcs-branch-list'),
    revert: (commitId: string) => ipcRenderer.invoke('vcs-revert', commitId),
    currentBranch: () => ipcRenderer.invoke('vcs-current-branch')
  },

  // Agent operations
  agent: {
    chat: (messages: Array<{ role: string; content: string }>) => ipcRenderer.invoke('agent-chat', messages),
    executeTool: (name: string, args: Record<string, unknown>) => ipcRenderer.invoke('agent-execute-tool', name, args),
    listTools: () => ipcRenderer.invoke('agent-list-tools'),
    configure: (config: { endpoint?: string; apiKey?: string; model?: string }) => ipcRenderer.invoke('agent-configure', config)
  },

  // File operations
  file: {
    openDialog: () => ipcRenderer.invoke('dialog-open'),
    saveDialog: () => ipcRenderer.invoke('dialog-save'),
    importDocx: (filePath: string) => ipcRenderer.invoke('docx-import', filePath),
    saveFile: (filePath: string, content: string) => ipcRenderer.invoke('docx-save', filePath, content)
  },

  // Menu event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'file-new', 'file-save', 'file-save-as', 'file-export-pdf',
      'file-opened', 'vcs-commit', 'vcs-log', 'vcs-branch',
      'vcs-switch', 'vcs-diff', 'vcs-revert',
      'find-open', 'find-replace-open', 'auto-save-trigger'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  }
}

contextBridge.exposeInMainWorld('wordapp', api)
