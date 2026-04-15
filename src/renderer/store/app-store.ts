import { create } from 'zustand'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  toolCalls?: Array<{ toolName: string; result: unknown }>
}

interface VcsCommit {
  id: string
  message: string
  timestamp: number
  parent: string | null
  branch: string
}

interface Branch {
  name: string
  head: string
  current: boolean
}

export interface PendingChange {
  id: string
  toolName: string
  args: Record<string, unknown>
  contentBefore: string
  contentAfter: string
  description: string
  timestamp: number
  status: 'pending' | 'accepted' | 'rejected'
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

  // VCS
  vcsPanelOpen: boolean
  vcsPanelView: 'log' | 'diff' | 'branches' | 'commit'
  commits: VcsCommit[]
  branches: Branch[]
  currentBranch: string
  diffData: { from: string; to: string; changes: Array<{ type: string; line: number; content: string }> } | null

  // Agent
  agentConfig: { endpoint: string; apiKey: string; model: string }
  agentConfigOpen: boolean
  availableTools: Array<{ name: string; description: string }>

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
  setVcsPanelView: (view: 'log' | 'diff' | 'branches' | 'commit') => void
  setCommits: (commits: VcsCommit[]) => void
  setBranches: (branches: Branch[]) => void
  setCurrentBranch: (branch: string) => void
  setDiffData: (data: AppState['diffData']) => void
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
}

function countWords(html: string): { words: number; chars: number } {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').filter((w) => w.length > 0).length : 0
  const chars = text.length
  return { words, chars }
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

  vcsPanelOpen: false,
  vcsPanelView: 'log',
  commits: [],
  branches: [],
  currentBranch: 'main',
  diffData: null,

  agentConfig: { endpoint: 'http://localhost:11434/v1', apiKey: '', model: 'hermes3' },
  agentConfigOpen: false,
  availableTools: [],

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
  setLastAutoSave: (ts) => set({ lastAutoSave: ts })
}))
