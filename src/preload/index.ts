import { contextBridge, ipcRenderer } from 'electron'

// Increase max listeners to handle many legitimate IPC event listeners
ipcRenderer.setMaxListeners(50)

interface PluginManifestInput {
  name: string
  version: string
  description: string
  author: string
  entry: string
  permissions: string[]
  hooks: string[]
  enabled: boolean
  installed: boolean
}

const api = {
  // VCS operations
  vcs: {
    commit: (message: string, content: string) => ipcRenderer.invoke('vcs-commit', message, content),
    log: () => ipcRenderer.invoke('vcs-log'),
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
    graphLanes: () => ipcRenderer.invoke('vcs-graph-lanes'),
    stashPush: (message?: string) => ipcRenderer.invoke('vcs-stash-push', message),
    stashPop: () => ipcRenderer.invoke('vcs-stash-pop'),
    stashApply: (id: string) => ipcRenderer.invoke('vcs-stash-apply', id),
    stashDrop: (id: string) => ipcRenderer.invoke('vcs-stash-drop', id),
    stashList: () => ipcRenderer.invoke('vcs-stash-list'),
    rebaseSquash: (commitIds: string[], message?: string) => ipcRenderer.invoke('vcs-rebase-squash', commitIds, message),
    rebaseReorder: (commitIds: string[]) => ipcRenderer.invoke('vcs-rebase-reorder', commitIds),
    rebaseEdit: (commitId: string, newMessage: string) => ipcRenderer.invoke('vcs-rebase-edit', commitId, newMessage),
    blame: (content: string) => ipcRenderer.invoke('vcs-blame', content),
    exportPatch: (fromId?: string, toId?: string) => ipcRenderer.invoke('vcs-export-patch', fromId, toId),
    exportPatchFile: (filePath: string, fromId?: string, toId?: string) => ipcRenderer.invoke('vcs-export-patch-file', filePath, fromId, toId),
    importPatch: (patchContent: string) => ipcRenderer.invoke('vcs-import-patch', patchContent),
    getHooks: () => ipcRenderer.invoke('vcs-get-hooks'),
    setHooks: (hooks: Record<string, unknown>) => ipcRenderer.invoke('vcs-set-hooks', hooks),
    validateCommit: (message: string) => ipcRenderer.invoke('vcs-validate-commit', message),
    // v0.4.8: Advanced VCS Features
    setBranchProtection: (branchName: string, protection: Record<string, unknown>) => ipcRenderer.invoke('vcs-set-branch-protection', branchName, protection),
    getBranchProtection: (branchName: string) => ipcRenderer.invoke('vcs-get-branch-protection', branchName),
    listBranchProtections: () => ipcRenderer.invoke('vcs-list-branch-protections'),
    removeBranchProtection: (branchName: string) => ipcRenderer.invoke('vcs-remove-branch-protection', branchName),
    createMergeRequest: (sourceBranch: string, targetBranch: string, title: string, description: string, creator: string) => ipcRenderer.invoke('vcs-create-merge-request', sourceBranch, targetBranch, title, description, creator),
    getMergeRequest: (id: string) => ipcRenderer.invoke('vcs-get-merge-request', id),
    listMergeRequests: (status?: string) => ipcRenderer.invoke('vcs-list-merge-requests', status),
    approveMergeRequest: (mrId: string, reviewer: string) => ipcRenderer.invoke('vcs-approve-merge-request', mrId, reviewer),
    rejectMergeRequest: (mrId: string, reviewer: string, comment?: string) => ipcRenderer.invoke('vcs-reject-merge-request', mrId, reviewer, comment),
    closeMergeRequest: (mrId: string) => ipcRenderer.invoke('vcs-close-merge-request', mrId),
    mergeWithStrategy: (sourceBranch: string, content: string, options?: Record<string, unknown>) => ipcRenderer.invoke('vcs-merge-with-strategy', sourceBranch, content, options),
    getThreeWayMergeDiff: (sourceBranch: string) => ipcRenderer.invoke('vcs-get-three-way-merge-diff', sourceBranch),
    mergeMergeRequest: (mrId: string) => ipcRenderer.invoke('vcs-merge-with-strategy', mrId)
  },

  // Agent operations
  agent: {
    chatStream: (messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string }) => ipcRenderer.invoke('agent-chat-stream', messages, context),
    abort: () => ipcRenderer.invoke('agent-abort'),
    executeTool: (name: string, args: Record<string, unknown>) => ipcRenderer.invoke('agent-execute-tool', name, args),
    listTools: () => ipcRenderer.invoke('agent-list-tools'),
    configure: (config: { endpoint?: string; apiKey?: string; model?: string }) => ipcRenderer.invoke('agent-configure', config),
    getConfig: () => ipcRenderer.invoke('agent-get-config'),
    getPresets: () => ipcRenderer.invoke('agent-presets'),
    addPreset: (preset: { name: string; endpoint: string; apiKey: string; model: string }) => ipcRenderer.invoke('agent-preset-add', preset),
    deletePreset: (id: string) => ipcRenderer.invoke('agent-preset-delete', id),
    applyPreset: (id: string) => ipcRenderer.invoke('agent-preset-apply', id),
    getScratchpad: () => ipcRenderer.invoke('agent-scratchpad-get'),
    setScratchpad: (content: string) => ipcRenderer.invoke('agent-scratchpad-set', content),
    configureAdvanced: (opts: { maxToolTurns?: number; temperature?: number }) => ipcRenderer.invoke('agent-configure-advanced', opts),
    getAdvanced: () => ipcRenderer.invoke('agent-get-advanced'),
    suggest: (docContent: string) => ipcRenderer.invoke('agent-suggest', docContent),
    sessionGetOrCreate: (documentId: string, agentName: string, systemPrompt?: string) => ipcRenderer.invoke('agent-session-get-or-create', documentId, agentName, systemPrompt),
    sessionAddMessage: (sessionId: string, role: string, content: string) => ipcRenderer.invoke('agent-session-add-message', sessionId, role, content),
    sessionMessages: (sessionId: string) => ipcRenderer.invoke('agent-session-messages', sessionId),
    sessionClear: (sessionId: string) => ipcRenderer.invoke('agent-session-clear', sessionId),
    sessionDelete: (sessionId: string) => ipcRenderer.invoke('agent-session-delete', sessionId),
    sessionList: (documentId?: string) => ipcRenderer.invoke('agent-session-list', documentId),
    profiles: () => ipcRenderer.invoke('agent-profiles'),
    profileAdd: (profile: { name: string; role: string; systemPrompt: string; color: string }) => ipcRenderer.invoke('agent-profile-add', profile),
    profileDelete: (id: string) => ipcRenderer.invoke('agent-profile-delete', id),
    multiRun: (documentId: string, userMessage: string, agentNames: string[], context?: { documentContent?: string; currentBranch?: string; selection?: string }) => ipcRenderer.invoke('agent-multi-run', documentId, userMessage, agentNames, context),
    inlineSuggest: (documentContent: string, cursorPosition: number, contextBefore: string) => ipcRenderer.invoke('agent-inline-suggest', documentContent, cursorPosition, contextBefore),
    summarize: (documentContent: string, style: string, maxLength: number) => ipcRenderer.invoke('agent-summarize', documentContent, style, maxLength),
    // v0.5.3: Streaming insertion methods for real-time LLM text generation
    streamInsertStart: (position: 'end' | 'start' | 'cursor') => ipcRenderer.invoke('agent-stream-insert-start', position),
    streamInsertChunk: (sessionId: string, chunk: string) => ipcRenderer.invoke('agent-stream-insert-chunk', sessionId, chunk),
    streamInsertEnd: (sessionId: string) => ipcRenderer.invoke('agent-stream-insert-end', sessionId),
    streamInsertCancel: (sessionId: string) => ipcRenderer.invoke('agent-stream-insert-cancel', sessionId),
    // v0.5.3: Advanced streaming tools
    streamInsertWithFormat: (sessionId: string, chunk: string, format?: { bold?: boolean; italic?: boolean; heading?: 1 | 2 | 3 }) => ipcRenderer.invoke('agent-stream-insert-with-format', sessionId, chunk, format),
    insertAfterElement: (searchText: string, content: string, elementType?: string) => ipcRenderer.invoke('agent-insert-after-element', searchText, content, elementType),
    streamInsertStatus: (sessionId: string) => ipcRenderer.invoke('agent-stream-insert-status', sessionId),
    streamReplace: (search: string) => ipcRenderer.invoke('agent-stream-replace', search),
    streamInsertPreview: (sessionId: string) => ipcRenderer.invoke('agent-stream-insert-preview', sessionId),
    undoLastStream: () => ipcRenderer.invoke('agent-undo-last-stream'),
    insertMultipleLocations: (insertions: Array<{ position?: string; content: string; afterElement?: string }>) => ipcRenderer.invoke('agent-insert-multiple-locations', insertions),
    validateStream: (sessionId: string, checks?: string[]) => ipcRenderer.invoke('agent-validate-stream', sessionId, checks),
    // v0.5.3: Document intelligence methods
    docGetStructure: () => ipcRenderer.invoke('agent-doc-get-structure'),
    docGetSection: (headingText: string, includeSubsections?: boolean) => ipcRenderer.invoke('agent-doc-get-section', headingText, includeSubsections),
    docSearch: (query: string, contextLines?: number, caseSensitive?: boolean) => ipcRenderer.invoke('agent-doc-search', query, contextLines, caseSensitive),
    docGetMetadata: () => ipcRenderer.invoke('agent-doc-get-metadata'),
    docFindAndFormat: (search: string, format: any, occurrence?: number) => ipcRenderer.invoke('agent-doc-find-and-format', search, format, occurrence),
    docBatchReplace: (replacements: Array<{ search: string; replace: string }>, useRegex?: boolean) => ipcRenderer.invoke('agent-doc-batch-replace', replacements, useRegex),
    docCreateList: (items: string[], type: string, position?: string) => ipcRenderer.invoke('agent-doc-create-list', items, type, position)
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
    exportEpub: (filePath: string, htmlContent: string) => ipcRenderer.invoke('export-epub', filePath, htmlContent),
    openImageDialog: () => ipcRenderer.invoke('open-image-dialog')
  },

  // Editor operations
  editor: {
    insertContent: (content: string, position: 'end' | 'start' | 'cursor') => ipcRenderer.invoke('editor-insert-content', content, position),
    replaceText: (search: string, replace: string, replaceAll?: boolean) => ipcRenderer.invoke('editor-replace-text', search, replace, replaceAll)
  },

  // Collab
  collab: {
    start: (port: number) => ipcRenderer.invoke('collab-start', port),
    stop: () => ipcRenderer.invoke('collab-stop'),
    status: () => ipcRenderer.invoke('collab-status'),
    generateCode: () => ipcRenderer.invoke('collab-generate-code')
  },

  // Templates
  template: {
    list: () => ipcRenderer.invoke('template-list'),
    get: (name: string) => ipcRenderer.invoke('template-get', name),
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

  plugin: {
    list: () => ipcRenderer.invoke('plugin-list'),
    get: (name: string) => ipcRenderer.invoke('plugin-get', name),
    install: (manifest: PluginManifestInput, code: string) => ipcRenderer.invoke('plugin-install', manifest, code),
    uninstall: (name: string) => ipcRenderer.invoke('plugin-uninstall', name),
    enable: (name: string) => ipcRenderer.invoke('plugin-enable', name),
    disable: (name: string) => ipcRenderer.invoke('plugin-disable', name),
    marketplace: () => ipcRenderer.invoke('plugin-marketplace'),
    builtinCode: (name: string) => ipcRenderer.invoke('plugin-builtin-code', name)
  },

  // Cloud & Sync
  cloud: {
    authStart: (provider: string) => ipcRenderer.invoke('cloud:auth-start', provider),
    authStatus: (provider: string) => ipcRenderer.invoke('cloud:auth-status', provider),
    disconnect: (provider: string) => ipcRenderer.invoke('cloud:disconnect', provider),
    syncStart: (provider: string, interval: number) => ipcRenderer.invoke('cloud:sync-start', provider, interval),
    syncStop: (provider: string) => ipcRenderer.invoke('cloud:sync-stop', provider),
    syncStatus: () => ipcRenderer.invoke('cloud:sync-status'),
    syncNow: (provider: string) => ipcRenderer.invoke('cloud:sync-now', provider),
    checkConflicts: (provider: string) => ipcRenderer.invoke('cloud:check-conflicts', provider),
    resolveConflict: (conflictId: string, resolution: 'local' | 'remote' | 'merge') => ipcRenderer.invoke('cloud:resolve-conflict', conflictId, resolution),
    backupCreate: (title: string, content: string) => ipcRenderer.invoke('cloud:backup-create', title, content),
    backupList: (documentTitle: string) => ipcRenderer.invoke('cloud:backup-list', documentTitle),
    backupRestore: (documentTitle: string, backupId: string) => ipcRenderer.invoke('cloud:backup-restore', documentTitle, backupId),
    backupDelete: (documentTitle: string, backupId: string) => ipcRenderer.invoke('cloud:backup-delete', documentTitle, backupId),
    backupStats: () => ipcRenderer.invoke('cloud:backup-stats')
  },

  // Settings wiring
  settings: {
    setSpellCheckLang: (lang: string) => ipcRenderer.invoke('set-spellcheck-lang', lang),
    vcsAutoCommit: (message: string, content: string) => ipcRenderer.invoke('vcs-auto-commit', message, content),
    vcsPruneCommits: (max: number) => ipcRenderer.invoke('vcs-prune-commits', max)
  },

  // Doc stats
  docStats: {
    compute: (htmlContent: string) => ipcRenderer.invoke('doc-stats', htmlContent)
  },

  // v0.4.7: AI Writing Assistant
  ai: {
    generateOutline: (topic: string, depth?: number) => ipcRenderer.invoke('ai-generate-outline', topic, depth),
    generateTitles: (topic: string, count?: number) => ipcRenderer.invoke('ai-generate-titles', topic, count),
    generateIntroduction: (topic: string, style?: 'brief' | 'medium' | 'detailed') => ipcRenderer.invoke('ai-generate-introduction', topic, style),
    generateConclusion: (docType: string, mainPoints: string[], style?: 'brief' | 'medium' | 'detailed') => ipcRenderer.invoke('ai-generate-conclusion', docType, mainPoints, style),
    adjustTone: (text: string, targetTone: 'formal' | 'casual' | 'professional') => ipcRenderer.invoke('ai-adjust-tone', text, targetTone),
    paraphrase: (text: string, count?: number) => ipcRenderer.invoke('ai-paraphrase', text, count),
    adjustComplexity: (text: string, level: 'simple' | 'moderate' | 'advanced') => ipcRenderer.invoke('ai-adjust-complexity', text, level),
    translate: (text: string, targetLanguage: string) => ipcRenderer.invoke('ai-translate', text, targetLanguage)
  },

  // v0.5.3: Documentation
  docs: {
    list: () => ipcRenderer.invoke('docs-list'),
    read: (filename: string) => ipcRenderer.invoke('docs-read', filename)
  },

  // Window controls (for borderless title bar)
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close')
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
      'collab-cursor-update', 'collab-presence', 'collab-remote-cursor',
      'file-new-template', 'export-markdown', 'command-palette',
      'tab-new', 'toggle-split-view', 'save-as-template', 'export-epub',
      'update-available',
      'agent-suggestion-update',
      'agent-tool-apply',
      'agent-edit-tiptap',
      'plugin:editor-insert', 'plugin:editor-replace-selection',
      'plugin:register-command', 'plugin:add-toolbar-button',
      'plugin:notification', 'plugin:clipboard-write', 'plugin:agent-chat',
      'cloud:status-changed'
    ]
    if (validChannels.includes(channel)) {
      const handler = (_event: any, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      // Return unsubscribe function
      return () => ipcRenderer.off(channel, handler)
    }
    // Return no-op unsubscribe if channel is invalid
    return () => {}
  }
}

contextBridge.exposeInMainWorld('wordapp', api)
