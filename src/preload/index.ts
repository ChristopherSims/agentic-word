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
    chat: (messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string }) => ipcRenderer.invoke('agent-chat', messages, context),
    chatStream: (messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string }) => ipcRenderer.invoke('agent-chat-stream', messages, context),
    abort: () => ipcRenderer.invoke('agent-abort'),
    executeTool: (name: string, args: Record<string, unknown>) => ipcRenderer.invoke('agent-execute-tool', name, args),
    listTools: () => ipcRenderer.invoke('agent-list-tools'),
    configure: (config: { endpoint?: string; apiKey?: string; model?: string }) => ipcRenderer.invoke('agent-configure', config),
    getPresets: () => ipcRenderer.invoke('agent-presets'),
    addPreset: (preset: { name: string; endpoint: string; apiKey: string; model: string }) => ipcRenderer.invoke('agent-preset-add', preset),
    deletePreset: (id: string) => ipcRenderer.invoke('agent-preset-delete', id),
    applyPreset: (id: string) => ipcRenderer.invoke('agent-preset-apply', id),
    getScratchpad: () => ipcRenderer.invoke('agent-scratchpad-get'),
    setScratchpad: (content: string) => ipcRenderer.invoke('agent-scratchpad-set', content)
  },

  // File operations
  file: {
    openDialog: () => ipcRenderer.invoke('dialog-open'),
    saveDialog: () => ipcRenderer.invoke('dialog-save'),
    saveAsDialog: (formats?: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke('dialog-save-as', formats),
    importDocx: (filePath: string) => ipcRenderer.invoke('docx-import', filePath),
    saveFile: (filePath: string, content: string) => ipcRenderer.invoke('docx-save', filePath, content),
    exportPdf: (filePath: string) => ipcRenderer.invoke('export-pdf', filePath),
    exportMarkdown: (filePath: string, htmlContent: string) => ipcRenderer.invoke('export-markdown', filePath, htmlContent),
    exportEpub: (filePath: string, htmlContent: string) => ipcRenderer.invoke('export-epub', filePath, htmlContent)
  },

  // Templates
  template: {
    list: () => ipcRenderer.invoke('template-list'),
    get: (name: string) => ipcRenderer.invoke('template-get', name),
    customList: () => ipcRenderer.invoke('custom-template-list'),
    customGet: (name: string) => ipcRenderer.invoke('custom-template-get', name),
    customSave: (name: string, content: string) => ipcRenderer.invoke('custom-template-save', name, content),
    customDelete: (name: string) => ipcRenderer.invoke('custom-template-delete', name)
  },

  // Recent files
  recent: {
    list: () => ipcRenderer.invoke('recent-files'),
    clear: () => ipcRenderer.invoke('recent-files-clear')
  },

  // Auto-update
  update: {
    check: () => ipcRenderer.invoke('check-for-updates')
  },

  // Markdown preview
  markdown: {
    toHtml: (md: string) => ipcRenderer.invoke('markdown-to-html', md)
  },

  // Menu event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'file-new', 'file-save', 'file-save-as', 'file-export-pdf',
      'file-opened', 'vcs-commit', 'vcs-log', 'vcs-branch',
      'vcs-switch', 'vcs-diff', 'vcs-revert',
      'find-open', 'find-replace-open', 'auto-save-trigger',
      'agent-stream-token', 'agent-stream-done', 'agent-stream-error',
      'agent-tool-results', 'agent-chain-complete',
      'collab-cursor-update',
      'file-new-template', 'export-markdown', 'command-palette',
      'tab-new', 'toggle-split-view', 'save-as-template', 'export-epub',
      'update-available'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  }
}

contextBridge.exposeInMainWorld('wordapp', api)
