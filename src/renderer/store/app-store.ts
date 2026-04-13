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

// Pending diff change from the AI agent — shown as inline diff, must be accepted/rejected
export interface PendingChange {
  id: string
  toolName: string
  args: Record<string, unknown>
  /** The document content BEFORE this change */
  contentBefore: string
  /** The document content AFTER this change would be applied */
  contentAfter: string
  /** Human-readable description of the change */
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

  // Pending AI changes (inline diff)
  pendingChanges: PendingChange[]
  activePendingChangeId: string | null

  // Actions
  setDocumentContent: (content: string) => void
  setDocumentTitle: (title: string) => void
  setCurrentFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void
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

  // Pending change actions
  addPendingChange: (change: Omit<PendingChange, 'id' | 'timestamp' | 'status'>) => string
  acceptPendingChange: (id: string) => void
  rejectPendingChange: (id: string) => void
  acceptAllPendingChanges: () => void
  rejectAllPendingChanges: () => void
  setActivePendingChange: (id: string | null) => void
  clearPendingChanges: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  documentContent: '',
  documentTitle: 'Untitled',
  currentFilePath: null,
  isDirty: false,

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

  setDocumentContent: (content) => set({ documentContent: content, isDirty: true }),
  setDocumentTitle: (title) => set({ documentTitle: title }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  setDirty: (dirty) => set({ isDirty: dirty }),
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
    const pending: PendingChange = {
      ...change,
      id,
      timestamp: Date.now(),
      status: 'pending'
    }
    set((s) => ({
      pendingChanges: [...s.pendingChanges, pending],
      activePendingChangeId: id
    }))
    return id
  },

  acceptPendingChange: (id) => {
    const state = get()
    const change = state.pendingChanges.find((c) => c.id === id)
    if (!change || change.status !== 'pending') return

    // Apply the change: set document to the after-content
    set((s) => ({
      documentContent: change.contentAfter,
      isDirty: true,
      pendingChanges: s.pendingChanges.map((c) =>
        c.id === id ? { ...c, status: 'accepted' as const } : c
      ),
      activePendingChangeId: s.pendingChanges.find((c) => c.id !== id && c.status === 'pending')?.id || null
    }))
  },

  rejectPendingChange: (id) => {
    const state = get()
    const change = state.pendingChanges.find((c) => c.id === id)
    if (!change || change.status !== 'pending') return

    // Revert: keep the document as contentBefore
    set((s) => ({
      documentContent: change.contentBefore,
      pendingChanges: s.pendingChanges.map((c) =>
        c.id === id ? { ...c, status: 'rejected' as const } : c
      ),
      activePendingChangeId: s.pendingChanges.find((c) => c.id !== id && c.status === 'pending')?.id || null
    }))
  },

  acceptAllPendingChanges: () => {
    const state = get()
    // Apply the last pending change's contentAfter (they are sequential)
    const pendingChanges = state.pendingChanges.filter((c) => c.status === 'pending')
    if (pendingChanges.length === 0) return

    // For sequential changes, apply the last one (which has accumulated all changes)
    const lastChange = pendingChanges[pendingChanges.length - 1]
    set({
      documentContent: lastChange.contentAfter,
      isDirty: true,
      pendingChanges: state.pendingChanges.map((c) =>
        c.status === 'pending' ? { ...c, status: 'accepted' as const } : c
      ),
      activePendingChangeId: null
    })
  },

  rejectAllPendingChanges: () => {
    const state = get()
    const pendingChanges = state.pendingChanges.filter((c) => c.status === 'pending')
    if (pendingChanges.length === 0) return

    // Revert to the first change's contentBefore (original state before any pending changes)
    const firstChange = pendingChanges[0]
    set({
      documentContent: firstChange.contentBefore,
      pendingChanges: state.pendingChanges.map((c) =>
        c.status === 'pending' ? { ...c, status: 'rejected' as const } : c
      ),
      activePendingChangeId: null
    })
  },

  setActivePendingChange: (id) => set({ activePendingChangeId: id }),

  clearPendingChanges: () => set({ pendingChanges: [], activePendingChangeId: null })
}))
