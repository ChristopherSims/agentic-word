import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // VCS operations
  vcs: {
    commit: (message: string, content: string) => ipcRenderer.invoke('vcs-commit', message, content),
    log: () => ipcRenderer.invoke('vcs-log'),
    allCommits: () => ipcRenderer.invoke('vcs-all-commits'),
    diff: (fromId?: string, toId?: string) => ipcRenderer.invoke('vcs-diff', fromId, toId),
    createBranch: (name: string) => ipcRenderer.invoke('vcs-branch-create', name),
    switchBranch: (name: string) => ipcRenderer.invoke('vcs-branch-switch', name),
    listBranches: () => ipcRenderer.invoke('vcs-branch-list'),
    deleteBranch: (name: string) => ipcRenderer.invoke('vcs-branch-delete', name),
    revert: (commitId: string) => ipcRenderer.invoke('vcs-revert', commitId),
    currentBranch: () => ipcRenderer.invoke('vcs-current-branch'),
    merge: (sourceBranch: string, content: string, message?: string) => ipcRenderer.invoke('vcs-merge', sourceBranch, content, message),
    cherryPick: (commitId: string) => ipcRenderer.invoke('vcs-cherry-pick', commitId),
    createTag: (name: string, commitId?: string) => ipcRenderer.invoke('vcs-tag-create', name, commitId),
    deleteTag: (name: string) => ipcRenderer.invoke('vcs-tag-delete', name),
    listTags: () => ipcRenderer.invoke('vcs-tag-list'),
    graph: () => ipcRenderer.invoke('vcs-graph')
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
