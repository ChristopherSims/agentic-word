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
  selection?: { from: number; to: number }
}

interface CollabUser {
  name: string
  color: string
  online: boolean
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

interface OutlineHeading {
  id: string
  level: number
  text: string
  position: number
}

interface DocStats {
  fleschKincaid: number
  avgSentenceLen: number
  paragraphCount: number
  readingTimeMin: number
  sentenceCount: number
  syllableCount: number
}

interface SmartSuggestion {
  id: string
  type: 'grammar' | 'style' | 'structure'
  message: string
  context: string
  timestamp: number
}

// ─── Comment threads ───
interface CommentThread {
  id: string
  documentId: string
  selectionFrom: number
  selectionTo: number
  selectionText: string
  resolved: boolean
  replies: Array<{ id: string; author: string; content: string; timestamp: number }>
}

// ─── Track changes ───
interface TrackedChange {
  id: string
  type: 'insert' | 'delete'
  from: number
  to: number
  text: string
  author: string
  timestamp: number
  accepted: boolean
  rejected: boolean
}

// ─── Page / header-footer ───
interface PageHeaderFooter {
  headerLeft: string
  headerCenter: string
  headerRight: string
  footerLeft: string
  footerCenter: string
  footerRight: string
  showPageNumbers: boolean
  showDate: boolean
  showTitle: boolean
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
  collabUsers: CollabUser[]
  collabConnected: boolean
  collabRoomCode: string | null
  collabPanelOpen: boolean

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
  focusMode: boolean

  // Toasts
  toasts: ToastMessage[]

  // Markdown preview
  mdPreviewOpen: boolean
  mdPreviewHtml: string

  // Outline
  outlineOpen: boolean
  outlineHeadings: OutlineHeading[]

  // Doc stats
  docStatsPanelOpen: boolean
  docStats: DocStats

  // Smart suggestions
  smartSuggestions: SmartSuggestion[]
  smartSuggestionsLoading: boolean

  // Inline edit
  inlineEditOpen: boolean
  inlineEditSelection: string
  inlineEditCallback: ((instruction: string, selection: string) => Promise<void>) | null

  // Settings
  settingsPanelOpen: boolean
  settingsPanelView: 'appearance' | 'agent' | 'editor' | 'vcs' | 'collab' | 'plugins' | 'keybindings'
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

  // ─── v0.3.3 features ───
  // Inline version diff
  inlineDiffOpen: boolean
  inlineDiffFromCommitId: string | null

  // Table of contents
  tocOpen: boolean

  // Print preview
  printPreviewOpen: boolean

  // Header/footer
  pageHeaderFooter: PageHeaderFooter

  // Comment threads
  commentThreads: CommentThread[]
  commentPanelOpen: boolean
  commentInputOpen: boolean
  commentSelectionFrom: number
  commentSelectionTo: number
  commentSelectionText: string

  // Track changes
  trackChangesOn: boolean
  trackedChanges: TrackedChange[]

  // Autocorrect
  autocorrectEnabled: boolean
  smartQuotesEnabled: boolean
  emDashEnabled: boolean

  // Page breaks
  pageBreakCount: number

  // ─── v0.3.4 Agent Deep Integration ───
  // Agent workspace sessions
  agentSessions: Array<{ id: string; documentId: string; agentName: string; systemPrompt: string; messages: Array<{ role: string; content: string }>; createdAt: number; updatedAt: number }>
  agentActiveSessionId: string | null

  // Multi-agent profiles
  agentProfiles: Array<{ id: string; name: string; role: string; systemPrompt: string; color: string }>

  // Multi-agent mode
  multiAgentMode: boolean
  multiAgentActiveNames: string[]
  multiAgentResults: Array<{ agentName: string; content: string }>

  // Inline suggestions
  inlineSuggestion: string | null
  inlineSuggestionVisible: boolean

  // ─── v0.3.5 Advanced VCS ───
  vcsStashList: Array<{ id: string; content: string; branch: string; message: string; timestamp: number }>
  vcsBlameData: Array<{ line: number; text: string; commitId: string; author: string; date: string; message: string }>
  vcsBlameOpen: boolean
  vcsGraphEdges: Array<{ from: string; to: string }>
  vcsHooks: {
    preCommitLint: boolean
    commitMessageTemplate: string
    protectedBranches: string[]
    requireCommitMessage: boolean
  }
  vcsRebaseMode: boolean
  vcsRebaseSelectedIds: string[]

  // ─── v0.3.6 Plugin Ecosystem ───
  pluginList: Array<{ name: string; version: string; description: string; author: string; enabled: boolean; installed: boolean; permissions: string[]; hooks: string[]; lastError?: string }>
  pluginMarketplace: Array<{ name: string; version: string; description: string; author: string; enabled: boolean; installed: boolean }>
  pluginToolbarButtons: Array<{ id: string; label: string; tooltip: string; pluginName: string }>
  pluginCommands: Array<{ id: string; label: string; shortcut?: string; pluginName: string }>

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
  // Outline
  setOutlineOpen: (open: boolean) => void
  setOutlineHeadings: (headings: OutlineHeading[]) => void
  // Doc stats
  setDocStatsPanelOpen: (open: boolean) => void
  setDocStats: (stats: DocStats) => void
  // Smart suggestions
  setSmartSuggestions: (suggestions: SmartSuggestion[]) => void
  addSmartSuggestion: (suggestion: Omit<SmartSuggestion, 'id' | 'timestamp'>) => void
  clearSmartSuggestions: () => void
  setSmartSuggestionsLoading: (loading: boolean) => void
  // Inline edit
  setInlineEditOpen: (open: boolean) => void
  setInlineEditSelection: (selection: string) => void
  setInlineEditCallback: (callback: ((instruction: string, selection: string) => Promise<void>) | null) => void

  // ─── v0.3.3 actions ───
  // Inline diff
  setInlineDiffOpen: (open: boolean) => void
  setInlineDiffFromCommitId: (id: string | null) => void

  // TOC
  setTocOpen: (open: boolean) => void

  // Print preview
  setPrintPreviewOpen: (open: boolean) => void

  // Header/footer
  setPageHeaderFooter: (hf: Partial<PageHeaderFooter>) => void

  // Comments
  setCommentPanelOpen: (open: boolean) => void
  addCommentThread: (thread: Omit<CommentThread, 'id'>) => string
  addCommentReply: (threadId: string, reply: { author: string; content: string }) => void
  resolveCommentThread: (threadId: string) => void
  unresolveCommentThread: (threadId: string) => void
  deleteCommentThread: (threadId: string) => void
  setCommentInputOpen: (open: boolean) => void
  setCommentSelection: (from: number, to: number, text: string) => void

  // Track changes
  setTrackChangesOn: (on: boolean) => void
  addTrackedChange: (change: Omit<TrackedChange, 'id' | 'timestamp' | 'accepted' | 'rejected'>) => void
  acceptTrackedChange: (id: string) => void
  rejectTrackedChange: (id: string) => void
  acceptAllTrackedChanges: () => void
  rejectAllTrackedChanges: () => void

  // Autocorrect
  setAutocorrectEnabled: (on: boolean) => void
  setSmartQuotesEnabled: (on: boolean) => void
  setEmDashEnabled: (on: boolean) => void

  // Page breaks
  setPageBreakCount: (count: number) => void

  // ─── v0.3.4 Agent Deep Integration ───
  setAgentSessions: (sessions: AppState['agentSessions']) => void
  setAgentActiveSessionId: (id: string | null) => void
  setAgentProfiles: (profiles: AppState['agentProfiles']) => void
  setMultiAgentMode: (on: boolean) => void
  setMultiAgentActiveNames: (names: string[]) => void
  setMultiAgentResults: (results: AppState['multiAgentResults']) => void
  setInlineSuggestion: (suggestion: string | null) => void
  setInlineSuggestionVisible: (visible: boolean) => void

  // ─── v0.3.5 Advanced VCS ───
  setVcsStashList: (list: AppState['vcsStashList']) => void
  setVcsBlameData: (data: AppState['vcsBlameData']) => void
  setVcsBlameOpen: (open: boolean) => void
  setVcsGraphEdges: (edges: AppState['vcsGraphEdges']) => void
  setVcsHooks: (hooks: Partial<AppState['vcsHooks']>) => void
  setVcsRebaseMode: (on: boolean) => void
  setVcsRebaseSelectedIds: (ids: string[]) => void

  // ─── v0.3.6 Plugin Ecosystem ───
  setPluginList: (list: AppState['pluginList']) => void
  setPluginMarketplace: (marketplace: AppState['pluginMarketplace']) => void
  setPluginToolbarButtons: (buttons: AppState['pluginToolbarButtons']) => void
  setPluginCommands: (commands: AppState['pluginCommands']) => void
  addPluginToolbarButton: (button: { id: string; label: string; tooltip: string; pluginName: string }) => void
  addPluginCommand: (command: { id: string; label: string; shortcut?: string; pluginName: string }) => void
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
  collabUsers: [],
  collabConnected: false,
  collabRoomCode: null,
  collabPanelOpen: false,

  commandPaletteOpen: false,

  docTabs: [{ id: 'default', title: 'Untitled', filePath: null, content: '', isDirty: false }],
  activeTabId: 'default',

  splitViewOpen: false,

  recentFiles: [],

  updateAvailable: false,
  updateVersion: '',
  updateUrl: '',
  focusMode: false,

  toasts: [],

  mdPreviewOpen: false,
  mdPreviewHtml: '',

  outlineOpen: false,
  outlineHeadings: [],

  docStatsPanelOpen: false,
  docStats: { fleschKincaid: 0, avgSentenceLen: 0, paragraphCount: 0, readingTimeMin: 0, sentenceCount: 0, syllableCount: 0 },

  smartSuggestions: [],
  smartSuggestionsLoading: false,

  inlineEditOpen: false,
  inlineEditSelection: '',
  inlineEditCallback: null,

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

  // v0.3.3 defaults
  inlineDiffOpen: false,
  inlineDiffFromCommitId: null,

  tocOpen: false,

  printPreviewOpen: false,

  pageHeaderFooter: loadSetting('pageHeaderFooter', {
    headerLeft: '', headerCenter: '', headerRight: '',
    footerLeft: '', footerCenter: 'Page {n}', footerRight: '',
    showPageNumbers: true, showDate: false, showTitle: true
  }),

  commentThreads: [],
  commentPanelOpen: false,
  commentInputOpen: false,
  commentSelectionFrom: 0,
  commentSelectionTo: 0,
  commentSelectionText: '',

  trackChangesOn: false,
  trackedChanges: [],

  autocorrectEnabled: loadSetting('autocorrectEnabled', true),
  smartQuotesEnabled: loadSetting('smartQuotesEnabled', true),
  emDashEnabled: loadSetting('emDashEnabled', true),

  pageBreakCount: 0,

  // v0.3.4 defaults
  agentSessions: [],
  agentActiveSessionId: null,
  agentProfiles: [
    { id: 'writer', name: 'Writer', role: 'writer', systemPrompt: 'You are a creative writing assistant. Focus on improving prose, expanding ideas, and generating content.', color: '#89b4fa' },
    { id: 'reviewer', name: 'Reviewer', role: 'reviewer', systemPrompt: 'You are a critical reviewer and editor. Focus on clarity, grammar, consistency, and logic.', color: '#f38ba8' }
  ],
  multiAgentMode: false,
  multiAgentActiveNames: ['Writer', 'Reviewer'],
  multiAgentResults: [],
  inlineSuggestion: null,
  inlineSuggestionVisible: false,

  // v0.3.5 defaults
  vcsStashList: [],
  vcsBlameData: [],
  vcsBlameOpen: false,
  vcsGraphEdges: [],
  vcsHooks: {
    preCommitLint: false,
    commitMessageTemplate: '',
    protectedBranches: ['main'],
    requireCommitMessage: true
  },
  vcsRebaseMode: false,
  vcsRebaseSelectedIds: [],

  // v0.3.6 defaults
  pluginList: [],
  pluginMarketplace: [],
  pluginToolbarButtons: [],
  pluginCommands: [],

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
  setCollabUsers: (users) => set({ collabUsers: users }),
  setCollabConnected: (connected) => set({ collabConnected: connected }),
  setCollabRoomCode: (code) => set({ collabRoomCode: code }),
  setCollabPanelOpen: (open) => set({ collabPanelOpen: open }),
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
  switchDocTab: (id) => {
    const state = get()
    const tab = state.docTabs.find((t) => t.id === id)
    if (tab && tab.id !== state.activeTabId) {
      // Save current tab's content before switching
      const currentTab = state.docTabs.find((t) => t.id === state.activeTabId)
      const updatedTabs = currentTab
        ? state.docTabs.map((t) => t.id === currentTab.id ? { ...t, content: state.documentContent, isDirty: state.isDirty } : t)
        : state.docTabs
      // Load the new tab's content
      const { words, chars } = countWords(tab.content)
      set({
        activeTabId: id,
        docTabs: updatedTabs,
        documentContent: tab.content,
        documentTitle: tab.title,
        currentFilePath: tab.filePath,
        isDirty: tab.isDirty,
        wordCount: words,
        charCount: chars
      })
    } else {
      set({ activeTabId: id })
    }
  },
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
  setFocusMode: (on) => set({ focusMode: on }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  addToast: (type, message) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, type, message, timestamp: Date.now() }] }))
    setTimeout(() => { useAppStore.getState().removeToast(id) }, 4000)
    return id
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setMdPreviewOpen: (open) => set({ mdPreviewOpen: open }),
  setMdPreviewHtml: (html) => set({ mdPreviewHtml: html }),
  setOutlineOpen: (open) => set({ outlineOpen: open }),
  setOutlineHeadings: (headings) => set({ outlineHeadings: headings }),
  setDocStatsPanelOpen: (open) => set({ docStatsPanelOpen: open }),
  setDocStats: (stats) => set({ docStats: stats }),
  setSmartSuggestions: (suggestions) => set({ smartSuggestions: suggestions }),
  addSmartSuggestion: (s) => {
    const id = crypto.randomUUID()
    set((state) => ({ smartSuggestions: [...state.smartSuggestions, { ...s, id, timestamp: Date.now() }] }))
  },
  clearSmartSuggestions: () => set({ smartSuggestions: [] }),
  setSmartSuggestionsLoading: (loading) => set({ smartSuggestionsLoading: loading }),
  setInlineEditOpen: (open) => set({ inlineEditOpen: open }),
  setInlineEditSelection: (selection) => set({ inlineEditSelection: selection }),
  setInlineEditCallback: (callback) => set({ inlineEditCallback: callback }),

  // ─── v0.3.3 actions ───
  setInlineDiffOpen: (open) => set({ inlineDiffOpen: open }),
  setInlineDiffFromCommitId: (id) => set({ inlineDiffFromCommitId: id }),

  setTocOpen: (open) => set({ tocOpen: open }),

  setPrintPreviewOpen: (open) => set({ printPreviewOpen: open }),

  setPageHeaderFooter: (hf) => {
    const updated = { ...get().pageHeaderFooter, ...hf }
    localStorage.setItem('aw-pageHeaderFooter', JSON.stringify(updated))
    set({ pageHeaderFooter: updated })
  },

  setCommentPanelOpen: (open) => set({ commentPanelOpen: open }),
  addCommentThread: (thread) => {
    const id = crypto.randomUUID()
    set((s) => ({ commentThreads: [...s.commentThreads, { ...thread, id }] }))
    return id
  },
  addCommentReply: (threadId, reply) => set((s) => ({
    commentThreads: s.commentThreads.map((t) => t.id === threadId ? {
      ...t, replies: [...t.replies, { ...reply, id: crypto.randomUUID(), timestamp: Date.now() }]
    } : t)
  })),
  resolveCommentThread: (threadId) => set((s) => ({
    commentThreads: s.commentThreads.map((t) => t.id === threadId ? { ...t, resolved: true } : t)
  })),
  unresolveCommentThread: (threadId) => set((s) => ({
    commentThreads: s.commentThreads.map((t) => t.id === threadId ? { ...t, resolved: false } : t)
  })),
  deleteCommentThread: (threadId) => set((s) => ({
    commentThreads: s.commentThreads.filter((t) => t.id !== threadId)
  })),
  setCommentInputOpen: (open) => set({ commentInputOpen: open }),
  setCommentSelection: (from, to, text) => set({ commentSelectionFrom: from, commentSelectionTo: to, commentSelectionText: text }),

  setTrackChangesOn: (on) => set({ trackChangesOn: on }),
  addTrackedChange: (change) => {
    const id = crypto.randomUUID()
    set((s) => ({ trackedChanges: [...s.trackedChanges, { ...change, id, timestamp: Date.now(), accepted: false, rejected: false }] }))
  },
  acceptTrackedChange: (id) => set((s) => ({
    trackedChanges: s.trackedChanges.map((c) => c.id === id ? { ...c, accepted: true } : c)
  })),
  rejectTrackedChange: (id) => set((s) => ({
    trackedChanges: s.trackedChanges.map((c) => c.id === id ? { ...c, rejected: true } : c)
  })),
  acceptAllTrackedChanges: () => set((s) => ({
    trackedChanges: s.trackedChanges.map((c) => c.accepted || c.rejected ? c : { ...c, accepted: true })
  })),
  rejectAllTrackedChanges: () => set((s) => ({
    trackedChanges: s.trackedChanges.map((c) => c.accepted || c.rejected ? c : { ...c, rejected: true })
  })),

  setAutocorrectEnabled: (on) => { localStorage.setItem('aw-autocorrectEnabled', JSON.stringify(on)); set({ autocorrectEnabled: on }) },
  setSmartQuotesEnabled: (on) => { localStorage.setItem('aw-smartQuotesEnabled', JSON.stringify(on)); set({ smartQuotesEnabled: on }) },
  setEmDashEnabled: (on) => { localStorage.setItem('aw-emDashEnabled', JSON.stringify(on)); set({ emDashEnabled: on }) },

  setPageBreakCount: (count) => set({ pageBreakCount: count }),

  // ─── v0.3.4 actions ───
  setAgentSessions: (sessions) => set({ agentSessions: sessions }),
  setAgentActiveSessionId: (id) => set({ agentActiveSessionId: id }),
  setAgentProfiles: (profiles) => set({ agentProfiles: profiles }),
  setMultiAgentMode: (on) => set({ multiAgentMode: on }),
  setMultiAgentActiveNames: (names) => set({ multiAgentActiveNames: names }),
  setMultiAgentResults: (results) => set({ multiAgentResults: results }),
  setInlineSuggestion: (suggestion) => set({ inlineSuggestion: suggestion }),
  setInlineSuggestionVisible: (visible) => set({ inlineSuggestionVisible: visible }),

  // ─── v0.3.5 Advanced VCS ───
  setVcsStashList: (list) => set({ vcsStashList: list }),
  setVcsBlameData: (data) => set({ vcsBlameData: data }),
  setVcsBlameOpen: (open) => set({ vcsBlameOpen: open }),
  setVcsGraphEdges: (edges) => set({ vcsGraphEdges: edges }),
  setVcsHooks: (hooks) => set((s) => ({ vcsHooks: { ...s.vcsHooks, ...hooks } })),
  setVcsRebaseMode: (on) => set({ vcsRebaseMode: on }),
  setVcsRebaseSelectedIds: (ids) => set({ vcsRebaseSelectedIds: ids }),

  // ─── v0.3.6 Plugin Ecosystem ───
  setPluginList: (list) => set({ pluginList: list }),
  setPluginMarketplace: (marketplace) => set({ pluginMarketplace: marketplace }),
  setPluginToolbarButtons: (buttons) => set({ pluginToolbarButtons: buttons }),
  setPluginCommands: (commands) => set({ pluginCommands: commands }),
  addPluginToolbarButton: (button) => set((s) => ({ pluginToolbarButtons: [...s.pluginToolbarButtons, button] })),
  addPluginCommand: (command) => set((s) => ({ pluginCommands: [...s.pluginCommands, command] }))
}))
