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
}

export const useAppStore = create<AppState>((set) => ({
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
  clearChat: () => set({ chatMessages: [] })
}))
