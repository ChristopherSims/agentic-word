import { create } from 'zustand'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  toolCalls?: Array<{ toolName: string; result: unknown }>
  streaming?: boolean
}

interface AgentPreset {
  id: string
  name: string
  endpoint: string
  apiKey: string
  model: string
}

interface DocTab {
  id: string
  title: string
  filePath: string | null
  content: string
  isDirty: boolean
}

interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  timestamp: number
}

interface CollabCursor {
  id: string
  name: string
  color: string
  position: number
  lastSeen: number
}

interface VcsCommit {
  id: string
  message: string
  timestamp: number
  parents: string[]
  branch: string
  tags: string[]
}

interface Branch {
  name: string
  head: string
  current: boolean
}

interface VcsTag {
  name: string
  commitId: string
  timestamp: number
}

interface GraphNode {
  id: string
  message: string
  timestamp: number
  branch: string
  parents: string[]
  tags: string[]
  isMerge: boolean
  branches: string[]
}

interface MergeConflict {
  path: string
  ours: string
  theirs: string
  base: string
  resolved?: string
}

export interface PendingChange {
  id: string
  toolName: string
  args: Record<string, unknown>
  contentBefore: string
  contentAfter: string
  description: string
  timestamp: number
  status: 'pending' | 'accepted' | 'rejected' | 'undone'
}

interface AppState {
  // Document
  documentContent: string
  documentTitle: string
  currentFilePath: string | null
  isDirty: boolean
  wordCount: number
  charCount: number

  // Chat
  chatMessages: ChatMessage[]
  chatLoading: boolean
  chatSidebarOpen: boolean
  chatStreamingId: string | null
  chatStreamContent: string

  // VCS
  vcsPanelOpen: boolean
  vcsPanelView: 'log' | 'diff' | 'branches' | 'commit' | 'graph' | 'merge' | 'tags'
  commits: VcsCommit[]
  branches: Branch[]
  currentBranch: string
  diffData: { from: string; to: string; fromContent: string; toContent: string; changes: Array<{ type: string; line: number; content: string }> } | null
  diffSideBySide: boolean
  vcsTags: VcsTag[]
  graphNodes: GraphNode[]
  mergeConflicts: MergeConflict[]
  mergeSourceBranch: string

  // Agent
  agentConfig: { endpoint: string; apiKey: string; model: string }
  agentConfigOpen: boolean
  availableTools: Array<{ name: string; description: string }>
  agentPresets: AgentPreset[]
  scratchpadContent: string

  // Collaboration
  collabCursors: CollabCursor[]

  // Command palette
  commandPaletteOpen: boolean

  // Tabs
  docTabs: DocTab[]
  activeTabId: string

  // Split view
  splitViewOpen: boolean

  // Recent files
  recentFiles: string[]

  // Update notification
  updateAvailable: boolean
  updateVersion: string
  updateUrl: string

  // Toasts
  toasts: ToastMessage[]

  // Markdown preview
  mdPreviewOpen: boolean
  mdPreviewHtml: string

  // Settings
  settingsPanelOpen: boolean
  settingsPanelView: 'appearance' | 'agent' | 'editor' | 'vcs' | 'collab' | 'keybindings'
  theme: string
  accentColor: string
  uiFontSize: number
  editorFont: string
  agentMaxToolTurns: number
  agentAutoApplyThreshold: number
  agentTemperature: number
  spellCheckLang: string
  defaultFontFamily: string
  defaultFontSize: string
  showWordCount: boolean
  lineSpacing: string
  vcsDefaultBranch: string
  vcsAutoCommitOnSave: boolean
  vcsMaxCommits: number
  collabDisplayName: string
  collabCursorColor: string
  collabMcpPort: number

  // Pending AI changes
  pendingChanges: PendingChange[]
  activePendingChangeId: string | null

  // Find & Replace
  findBarOpen: boolean
  findQuery: string
  replaceQuery: string
  findUseRegex: boolean
  findCaseSensitive: boolean
  findResults: number
  findCurrentIndex: number

  // Auto-save
  autoSaveEnabled: boolean
  autoSaveIntervalMs: number
  lastAutoSave: number | null

  // Actions
  setDocumentContent: (content: string) => void
  setDocumentTitle: (title: string) => void
  setCurrentFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  setWordCount: (count: number) => void
  setCharCount: (count: number) => void
  addChatMessage: (msg: ChatMessage) => void
  setChatLoading: (loading: boolean) => void
  toggleChatSidebar: () => void
  setChatSidebarOpen: (open: boolean) => void
  setVcsPanelOpen: (open: boolean) => void
  setVcsPanelView: (view: AppState['vcsPanelView']) => void
  setCommits: (commits: VcsCommit[]) => void
  setBranches: (branches: Branch[]) => void
  setCurrentBranch: (branch: string) => void
  setDiffData: (data: AppState['diffData']) => void
  setDiffSideBySide: (sideBySide: boolean) => void
  setVcsTags: (tags: VcsTag[]) => void
  setGraphNodes: (nodes: GraphNode[]) => void
  setMergeConflicts: (conflicts: MergeConflict[]) => void
  setMergeSourceBranch: (branch: string) => void
  setAgentConfig: (config: Partial<AppState['agentConfig']>) => void
  setAgentConfigOpen: (open: boolean) => void
  setAvailableTools: (tools: Array<{ name: string; description: string }>) => void
  clearChat: () => void
  addPendingChange: (change: Omit<PendingChange, 'id' | 'timestamp' | 'status'>) => string
  acceptPendingChange: (id: string) => void
  rejectPendingChange: (id: string) => void
  acceptAllPendingChanges: () => void
  rejectAllPendingChanges: () => void
  setActivePendingChange: (id: string | null) => void
  clearPendingChanges: () => void
  setFindBarOpen: (open: boolean) => void
  setFindQuery: (query: string) => void
  setReplaceQuery: (query: string) => void
  setFindUseRegex: (useRegex: boolean) => void
  setFindCaseSensitive: (caseSensitive: boolean) => void
  setFindResults: (results: number, currentIndex: number) => void
  setAutoSaveEnabled: (enabled: boolean) => void
  setAutoSaveInterval: (ms: number) => void
  setLastAutoSave: (ts: number | null) => void

  // Streaming & agent
  setChatStreamingId: (id: string | null) => void
  setChatStreamContent: (content: string) => void
  updateStreamingMessage: (id: string, content: string) => void
  setAgentPresets: (presets: AgentPreset[]) => void
  setScratchpadContent: (content: string) => void
  setCollabCursors: (cursors: CollabCursor[]) => void
  undoLastAcceptedChange: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setSettingsPanelOpen: (open: boolean) => void
  setSettingsPanelView: (view: AppState['settingsPanelView']) => void
  setTheme: (theme: string) => void
  setAccentColor: (color: string) => void
  setUiFontSize: (size: number) => void
  setEditorFont: (font: string) => void
  setAgentMaxToolTurns: (turns: number) => void
  setAgentAutoApplyThreshold: (threshold: number) => void
  setAgentTemperature: (temp: number) => void
  setSpellCheckLang: (lang: string) => void
  setDefaultFontFamily: (font: string) => void
  setDefaultFontSize: (size: string) => void
  setShowWordCount: (show: boolean) => void
  setLineSpacing: (spacing: string) => void
  setVcsDefaultBranch: (name: string) => void
  setVcsAutoCommitOnSave: (auto: boolean) => void
  setVcsMaxCommits: (max: number) => void
  setCollabDisplayName: (name: string) => void
  setCollabCursorColor: (color: string) => void
  setCollabMcpPort: (port: number) => void
  // Tabs
  addDocTab: (tab: Omit<DocTab, 'id'>) => string
  switchDocTab: (id: string) => void
  closeDocTab: (id: string) => void
  updateDocTab: (id: string, updates: Partial<DocTab>) => void
  // Split view
  setSplitViewOpen: (open: boolean) => void
  // Recent files
  setRecentFiles: (files: string[]) => void
  // Update
  setUpdateAvailable: (available: boolean, version?: string, url?: string) => void
  // Toasts
  addToast: (type: ToastMessage['type'], message: string) => void
  removeToast: (id: string) => void
  // Markdown preview
  setMdPreviewOpen: (open: boolean) => void
  setMdPreviewHtml: (html: string) => void
}

function countWords(html: string): { words: number; chars: number } {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').filter((w) => w.length > 0).length : 0
  const chars = text.length
  return { words, chars }
}

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`aw-${key}`)
    if (stored !== null) return JSON.parse(stored) as T
  } catch {}
  return fallback
}

export const useAppStore = create<AppState>((set, get) => ({
  documentContent: '',
  documentTitle: 'Untitled',
  currentFilePath: null,
  isDirty: false,
  wordCount: 0,
  charCount: 0,

  chatMessages: [],
  chatLoading: false,
  chatSidebarOpen: true,
  chatStreamingId: null,
  chatStreamContent: '',

  vcsPanelOpen: false,
  vcsPanelView: 'log',
  commits: [],
  branches: [],
  currentBranch: 'main',
  diffData: null,
  diffSideBySide: true,
  vcsTags: [],
  graphNodes: [],
  mergeConflicts: [],
  mergeSourceBranch: '',

  agentConfig: { endpoint: 'http://localhost:11434/v1', apiKey: '', model: 'hermes3' },
  agentConfigOpen: false,
  availableTools: [],
  agentPresets: [],
  scratchpadContent: '',

  collabCursors: [],

  commandPaletteOpen: false,

  docTabs: [{ id: 'default', title: 'Untitled', filePath: null, content: '', isDirty: false }],
  activeTabId: 'default',

  splitViewOpen: false,

  recentFiles: [],

  updateAvailable: false,
  updateVersion: '',
  updateUrl: '',

  toasts: [],

  mdPreviewOpen: false,
  mdPreviewHtml: '',

  settingsPanelOpen: false,
  settingsPanelView: 'appearance',
  theme: loadSetting('theme', 'catppuccin-mocha'),
  accentColor: loadSetting('accentColor', ''),
  uiFontSize: loadSetting('uiFontSize', 14),
  editorFont: loadSetting('editorFont', 'Cascadia Code'),
  agentMaxToolTurns: loadSetting('agentMaxToolTurns', 5),
  agentAutoApplyThreshold: loadSetting('agentAutoApplyThreshold', 0),
  agentTemperature: loadSetting('agentTemperature', 0.7),
  spellCheckLang: loadSetting('spellCheckLang', 'en-US'),
  defaultFontFamily: loadSetting('defaultFontFamily', ''),
  defaultFontSize: loadSetting('defaultFontSize', '16px'),
  showWordCount: loadSetting('showWordCount', true),
  lineSpacing: loadSetting('lineSpacing', '1.15'),
  vcsDefaultBranch: loadSetting('vcsDefaultBranch', 'main'),
  vcsAutoCommitOnSave: loadSetting('vcsAutoCommitOnSave', false),
  vcsMaxCommits: loadSetting('vcsMaxCommits', 0),
  collabDisplayName: loadSetting('collabDisplayName', 'User'),
  collabCursorColor: loadSetting('collabCursorColor', '#89b4fa'),
  collabMcpPort: loadSetting('collabMcpPort', 0),

  pendingChanges: [],
  activePendingChangeId: null,

  findBarOpen: false,
  findQuery: '',
  replaceQuery: '',
  findUseRegex: false,
  findCaseSensitive: false,
  findResults: 0,
  findCurrentIndex: 0,

  autoSaveEnabled: true,
  autoSaveIntervalMs: 30000,
  lastAutoSave: null,

  setDocumentContent: (content) => {
    const { words, chars } = countWords(content)
    set({ documentContent: content, isDirty: true, wordCount: words, charCount: chars })
  },
  setDocumentTitle: (title) => set({ documentTitle: title }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setWordCount: (count) => set({ wordCount: count }),
  setCharCount: (count) => set({ charCount: count }),
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  setChatLoading: (loading) => set({ chatLoading: loading }),
  toggleChatSidebar: () => set((s) => ({ chatSidebarOpen: !s.chatSidebarOpen })),
  setChatSidebarOpen: (open) => set({ chatSidebarOpen: open }),
  setVcsPanelOpen: (open) => set({ vcsPanelOpen: open }),
  setVcsPanelView: (view) => set({ vcsPanelView: view }),
  setCommits: (commits) => set({ commits }),
  setBranches: (branches) => set({ branches }),
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setDiffData: (data) => set({ diffData: data }),
  setDiffSideBySide: (sideBySide) => set({ diffSideBySide: sideBySide }),
  setVcsTags: (tags) => set({ vcsTags: tags }),
  setGraphNodes: (nodes) => set({ graphNodes: nodes }),
  setMergeConflicts: (conflicts) => set({ mergeConflicts: conflicts }),
  setMergeSourceBranch: (branch) => set({ mergeSourceBranch: branch }),
  setAgentConfig: (config) => set((s) => ({ agentConfig: { ...s.agentConfig, ...config } })),
  setAgentConfigOpen: (open) => set({ agentConfigOpen: open }),
  setAvailableTools: (tools) => set({ availableTools: tools }),
  clearChat: () => set({ chatMessages: [] }),

  addPendingChange: (change) => {
    const id = crypto.randomUUID()
    const pending: PendingChange = { ...change, id, timestamp: Date.now(), status: 'pending' }
    set((s) => ({ pendingChanges: [...s.pendingChanges, pending], activePendingChangeId: id }))
    return id
  },

  acceptPendingChange: (id) => {
    const state = get()
    const change = state.pendingChanges.find((c) => c.id === id)
    if (!change || change.status !== 'pending') return
    const { words, chars } = countWords(change.contentAfter)
    set((s) => ({
      documentContent: change.contentAfter, isDirty: true,
      wordCount: words, charCount: chars,
      pendingChanges: s.pendingChanges.map((c) => c.id === id ? { ...c, status: 'accepted' as const } : c),
      activePendingChangeId: s.pendingChanges.find((c) => c.id !== id && c.status === 'pending')?.id || null
    }))
  },

  rejectPendingChange: (id) => {
    const state = get()
    const change = state.pendingChanges.find((c) => c.id === id)
    if (!change || change.status !== 'pending') return
    set((s) => ({
      documentContent: change.contentBefore,
      pendingChanges: s.pendingChanges.map((c) => c.id === id ? { ...c, status: 'rejected' as const } : c),
      activePendingChangeId: s.pendingChanges.find((c) => c.id !== id && c.status === 'pending')?.id || null
    }))
  },

  acceptAllPendingChanges: () => {
    const state = get()
    const pendingChanges = state.pendingChanges.filter((c) => c.status === 'pending')
    if (pendingChanges.length === 0) return
    const lastChange = pendingChanges[pendingChanges.length - 1]
    const { words, chars } = countWords(lastChange.contentAfter)
    set({
      documentContent: lastChange.contentAfter, isDirty: true,
      wordCount: words, charCount: chars,
      pendingChanges: state.pendingChanges.map((c) => c.status === 'pending' ? { ...c, status: 'accepted' as const } : c),
      activePendingChangeId: null
    })
  },

  rejectAllPendingChanges: () => {
    const state = get()
    const pendingChanges = state.pendingChanges.filter((c) => c.status === 'pending')
    if (pendingChanges.length === 0) return
    const firstChange = pendingChanges[0]
    set({
      documentContent: firstChange.contentBefore,
      pendingChanges: state.pendingChanges.map((c) => c.status === 'pending' ? { ...c, status: 'rejected' as const } : c),
      activePendingChangeId: null
    })
  },

  setActivePendingChange: (id) => set({ activePendingChangeId: id }),
  clearPendingChanges: () => set({ pendingChanges: [], activePendingChangeId: null }),
  setFindBarOpen: (open) => set({ findBarOpen: open }),
  setFindQuery: (query) => set({ findQuery: query }),
  setReplaceQuery: (query) => set({ replaceQuery: query }),
  setFindUseRegex: (useRegex) => set({ findUseRegex: useRegex }),
  setFindCaseSensitive: (caseSensitive) => set({ findCaseSensitive: caseSensitive }),
  setFindResults: (results, currentIndex) => set({ findResults: results, findCurrentIndex: currentIndex }),
  setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),
  setAutoSaveInterval: (ms) => set({ autoSaveIntervalMs: ms }),
  setLastAutoSave: (ts) => set({ lastAutoSave: ts }),

  setChatStreamingId: (id) => set({ chatStreamingId: id }),
  setChatStreamContent: (content) => set({ chatStreamContent: content }),
  updateStreamingMessage: (id, content) => set((s) => ({
    chatMessages: s.chatMessages.map((m) => m.id === id ? { ...m, content, streaming: false } : m),
    chatStreamingId: null,
    chatStreamContent: ''
  })),
  setAgentPresets: (presets) => set({ agentPresets: presets }),
  setScratchpadContent: (content) => set({ scratchpadContent: content }),
  setCollabCursors: (cursors) => set({ collabCursors: cursors }),
  undoLastAcceptedChange: () => {
    const state = get()
    const accepted = [...state.pendingChanges].reverse().find((c) => c.status === 'accepted')
    if (!accepted) return
    const { words, chars } = countWords(accepted.contentBefore)
    set((s) => ({
      documentContent: accepted.contentBefore, isDirty: true,
      wordCount: words, charCount: chars,
      pendingChanges: s.pendingChanges.map((c) => c.id === accepted.id ? { ...c, status: 'undone' as const } : c)
    }))
  },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  setSettingsPanelView: (view) => set({ settingsPanelView: view }),
  setTheme: (theme) => { localStorage.setItem('aw-theme', JSON.stringify(theme)); set({ theme }) },
  setAccentColor: (color) => { localStorage.setItem('aw-accentColor', JSON.stringify(color)); set({ accentColor: color }) },
  setUiFontSize: (size) => { localStorage.setItem('aw-uiFontSize', JSON.stringify(size)); set({ uiFontSize: size }) },
  setEditorFont: (font) => { localStorage.setItem('aw-editorFont', JSON.stringify(font)); set({ editorFont: font }) },
  setAgentMaxToolTurns: (turns) => { localStorage.setItem('aw-agentMaxToolTurns', JSON.stringify(turns)); set({ agentMaxToolTurns: turns }) },
  setAgentAutoApplyThreshold: (threshold) => { localStorage.setItem('aw-agentAutoApplyThreshold', JSON.stringify(threshold)); set({ agentAutoApplyThreshold: threshold }) },
  setAgentTemperature: (temp) => { localStorage.setItem('aw-agentTemperature', JSON.stringify(temp)); set({ agentTemperature: temp }) },
  setSpellCheckLang: (lang) => { localStorage.setItem('aw-spellCheckLang', JSON.stringify(lang)); set({ spellCheckLang: lang }) },
  setDefaultFontFamily: (font) => { localStorage.setItem('aw-defaultFontFamily', JSON.stringify(font)); set({ defaultFontFamily: font }) },
  setDefaultFontSize: (size) => { localStorage.setItem('aw-defaultFontSize', JSON.stringify(size)); set({ defaultFontSize: size }) },
  setShowWordCount: (show) => { localStorage.setItem('aw-showWordCount', JSON.stringify(show)); set({ showWordCount: show }) },
  setLineSpacing: (spacing) => { localStorage.setItem('aw-lineSpacing', JSON.stringify(spacing)); set({ lineSpacing: spacing }) },
  setVcsDefaultBranch: (name) => { localStorage.setItem('aw-vcsDefaultBranch', JSON.stringify(name)); set({ vcsDefaultBranch: name }) },
  setVcsAutoCommitOnSave: (auto) => { localStorage.setItem('aw-vcsAutoCommitOnSave', JSON.stringify(auto)); set({ vcsAutoCommitOnSave: auto }) },
  setVcsMaxCommits: (max) => { localStorage.setItem('aw-vcsMaxCommits', JSON.stringify(max)); set({ vcsMaxCommits: max }) },
  setCollabDisplayName: (name) => { localStorage.setItem('aw-collabDisplayName', JSON.stringify(name)); set({ collabDisplayName: name }) },
  setCollabCursorColor: (color) => { localStorage.setItem('aw-collabCursorColor', JSON.stringify(color)); set({ collabCursorColor: color }) },
  setCollabMcpPort: (port) => { localStorage.setItem('aw-collabMcpPort', JSON.stringify(port)); set({ collabMcpPort: port }) },
  addDocTab: (tab) => {
    const id = crypto.randomUUID()
    set((s) => ({ docTabs: [...s.docTabs, { ...tab, id }], activeTabId: id }))
    return id
  },
  switchDocTab: (id) => set({ activeTabId: id }),
  closeDocTab: (id) => set((s) => {
    const tabs = s.docTabs.filter((t) => t.id !== id)
    if (tabs.length === 0) return { docTabs: [{ id: 'default', title: 'Untitled', filePath: null, content: '', isDirty: false }], activeTabId: 'default' }
    const newActive = s.activeTabId === id ? tabs[tabs.length - 1].id : s.activeTabId
    return { docTabs: tabs, activeTabId: newActive }
  }),
  updateDocTab: (id, updates) => set((s) => ({
    docTabs: s.docTabs.map((t) => t.id === id ? { ...t, ...updates } : t)
  })),
  setSplitViewOpen: (open) => set({ splitViewOpen: open }),
  setRecentFiles: (files) => set({ recentFiles: files }),
  setUpdateAvailable: (available, version, url) => set({ updateAvailable: available, updateVersion: version || '', updateUrl: url || '' }),
  addToast: (type, message) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, type, message, timestamp: Date.now() }] }))
    setTimeout(() => { useAppStore.getState().removeToast(id) }, 4000)
    return id
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setMdPreviewOpen: (open) => set({ mdPreviewOpen: open }),
  setMdPreviewHtml: (html) => set({ mdPreviewHtml: html })
}))
