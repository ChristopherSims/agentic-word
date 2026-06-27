import { create } from 'zustand'
import { countWords, loadSetting, saveSetting } from '../utils'
let updateDocumentStats: (content: string) => void = () => {}
import type {
  ChatMessage,
  AgentPreset,
  DocTab,
  ToastMessage,
  CollabCursor,
  CollabUser,
  VcsCommit,
  VcsTag,
  VcsGraphNode,
  VcsMergeConflict,
  OutlineHeading,
  DocStats,
  SmartSuggestion,
  CommentThread,
  TrackedChange,
  PageHeaderFooter,
  PendingChange,
  CollaborationEvent,
  DocumentSnapshot,
  ConflictResolution,
  AttributedEdit,
  AgentPermissions
} from '../../shared/types'
import type { SpellingError, Dictionary } from '../utils/spell-check-utils'
import type { GrammarIssue, ToneAnalysis } from '../utils/grammar-utils'
import { WritingSuggestion, ReadabilityScore } from '../utils/writing-suggestions-utils'
import type { ShortcutBinding } from '../utils/keyboard-shortcuts'
import { getDefaultShortcuts } from '../utils/keyboard-shortcuts'

// Local type for branch info specific to renderer state
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
  wordCount: number
  charCount: number

  // Chat
  chatMessages: ChatMessage[]
  chatLoading: boolean
  chatSidebarOpen: boolean
  chatStreamingId: string | null
  chatStreamContent: string
  agentStatus: string // typing indicator: "Editing document...", "Working...", etc.

  // VCS
  vcsPanelOpen: boolean
  vcsPanelView: 'log' | 'diff' | 'branches' | 'commit' | 'graph' | 'merge' | 'tags' | 'stash' | 'blame' | 'rebase' | 'patches' | 'hooks' | 'merge-strategies' | 'branch-protection' | 'merge-requests'
  commits: VcsCommit[]
  branches: Branch[]
  currentBranch: string
  diffData: { from: string; to: string; fromContent: string; toContent: string; changes: Array<{ type: string; line: number; content: string }> } | null
  diffSideBySide: boolean
  vcsTags: VcsTag[]
  graphNodes: VcsGraphNode[]
  mergeConflicts: VcsMergeConflict[]
  mergeSourceBranch: string

  // Agent
  agentConfig: { endpoint: string; apiKey: string; model: string; fastModel?: string; smartModel?: string }
  ollamaFormat: boolean
  availableTools: Array<{ name: string; description: string }>
  agentPresets: AgentPreset[]
  scratchpadContent: string
  agentPermissions: AgentPermissions
  setAgentPermissions: (permissions: Partial<AgentPermissions>) => void

  // Collaboration
  collabCursors: CollabCursor[]
  collabUsers: CollabUser[]
  collabConnected: boolean
  collabRoomCode: string | null
  collabPanelOpen: boolean

  // v0.4.5: Collaboration 2.0
  // Activity Log
  collaborationEvents: CollaborationEvent[]
  collaborationTimelineOpen: boolean
  
  // Document History & Snapshots
  documentSnapshots: DocumentSnapshot[]
  currentSnapshotId: string | null
  
  // Conflict Resolution
  pendingConflicts: ConflictResolution[]
  conflictResolutionOpen: boolean
  
  // Attributed Edits (Undo/Redo with attribution)
  attributedEdits: AttributedEdit[]
  editHistoryOpen: boolean
  
  // Current User Session
  currentUserId: string | null
  currentUserColor: string

  // Command palette
  commandPaletteOpen: boolean

  // Tabs
  docTabs: DocTab[]
  activeTabId: string
  openStoryboardTab: (parentFilePath: string) => void
  closeStoryboardTab: () => void

  // Storyboard popup
  storyboardOpen: boolean
  storyboardFilePath: string | null
  openStoryboardPopup: (filePath: string | null) => void
  closeStoryboardPopup: () => void

  // Split view
  splitViewOpen: boolean
  splitViewRightTabId: string | null  // Tab ID for right pane in split view

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
  settingsPanelView: 'appearance' | 'agent' | 'editor' | 'behavior' | 'advanced' | 'vcs' | 'collab' | 'plugins' | 'keybindings'
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
  documentMarginTop: number
  documentMarginBottom: number
  documentMarginLeft: number
  documentMarginRight: number
  vcsDefaultBranch: string
  vcsAutoCommitOnSave: boolean
  vcsMaxCommits: number
  collabDisplayName: string
  collabCursorColor: string
  collabMcpPort: number  // collab

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

  pluginList: Array<{ name: string; version: string; description: string; author: string; enabled: boolean; installed: boolean; permissions: string[]; hooks: string[]; lastError?: string }>
  pluginMarketplace: Array<{ name: string; version: string; description: string; author: string; enabled: boolean; installed: boolean }>
  pluginToolbarButtons: Array<{ id: string; label: string; tooltip: string; pluginName: string }>
  pluginCommands: Array<{ id: string; label: string; shortcut?: string; pluginName: string }>

  // v0.3.8: Advanced text editing
  smartFormattingRules: {
    smartQuotes: boolean
    autoEmdash: boolean
    autoEndash: boolean
    removeDuplicateSpaces: boolean
    autoCorrection: boolean
  }
  findReplaceOpen: boolean
  findReplaceQuery: string
  findReplaceRegex: boolean
  findReplaceCaseSensitive: boolean
  findReplaceWholeWord: boolean
  findReplaceHistory: string[]
  floatingToolbarVisible: boolean
  textStats: {
    characters: number
    charactersWithoutSpaces: number
    words: number
    sentences: number
    paragraphs: number
    readingTimeMinutes: number
    readingTimeSeconds: number
    readabilityScore: number
    averageWordLength: number
  }
  textDensity: 'compact' | 'normal' | 'comfortable'
  columnWidth: number // in pixels
  showAlignmentGuides: boolean

  // v0.3.9: Export & Format Support
  exportDialogOpen: boolean
  templateGalleryOpen: boolean
  importDialogOpen: boolean
  isExporting: boolean
  isImporting: boolean
  exportProgress: number // 0-100
  importProgress: number // 0-100

  // v0.4.0: Dark Mode & Accessibility
  themeMode: 'light' | 'dark' | 'auto'
  accessibilityMode: 'normal' | 'high-contrast' | 'eye-comfort' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  useSystemThemePreference: boolean
  scheduledDarkModeEnabled: boolean
  scheduledDarkModeStart: number // 0-23 hours
  scheduledDarkModeEnd: number // 0-23 hours
  globalFontSize: number // percentage, 100 = normal
  globalLineHeight: number // 1.2-3.0
  globalLetterSpacing: number // -1 to 2 px
  reducedMotion: boolean
  screenReaderOptimized: boolean
  keyboardNavigationEnabled: boolean
  highlightFocusIndicators: boolean
  language: string // BCP 47 format e.g. 'en-US'
  accessibilityPanelOpen: boolean
  themeCustomizerOpen: boolean
  fontManagerOpen: boolean

  // v0.4.6: Documentation & Help
  helpPanelOpen: boolean
  helpPanelView: 'tutorials' | 'faq' | 'resources' | 'highlights'
  tutorialMode: boolean
  tutorialCurrentStep: number
  featureHighlightsShown: string[] // array of feature IDs that have been shown
  featureHighlightsOpen: boolean
  contextualHelpContent: string
  contextualHelpVisible: boolean

  // v0.4.7: AI Writing Assistant
  aiAssistantOpen: boolean
  aiContentGenerationTask: 'outline' | 'title' | 'intro' | 'conclusion' | 'paragraph'
  aiEnhancementTask: 'tone' | 'paraphrase' | 'complexity' | 'translate'
  aiGeneratedContent: string
  aiSuggestions: Array<{ type: string; text: string; confidence: number }>
  
  // v0.4.7: Inline Smart Suggestions
  inlineSuggestionsEnabled: boolean
  inlineSuggestionTriggerWordCount: number
  inlineSuggestionContextLength: number
  inlineSuggestionDebounceMs: number
  inlineSuggestionTimeoutMs: number
  inlineSuggestionCooldownMs: number
  pendingSuggestionInsert: string | null  // Text to insert at cursor position
  pendingEditorOperation: { type: 'insert' | 'replace'; content?: string; search?: string; replace?: string; position?: 'end' | 'start' | 'cursor'; replaceAll?: boolean } | null  // From agent tools
  pendingAgentReviews: Array<{ id: string; type: 'insert' | 'replace'; content?: string; search?: string; replace?: string; position?: 'end' | 'start' | 'cursor'; replaceAll?: boolean }>  // Agent diff review queue

  // Background agent tasks
  backgroundTasks: Array<{ id: string; prompt: string; status: 'running' | 'done' | 'error'; result?: string; error?: string }>

  // v0.4.9: Performance Optimization
  performanceDashboardOpen: boolean
  virtualScrollingEnabled: boolean
  lazyLoadMediaEnabled: boolean
  documentCompressionEnabled: boolean
  performanceStats: { totalMetrics: number; avgMemoryUsage: number; peakMemoryUsage: number; avgLoadTime: number; avgSaveTime: number; totalDocumentsProcessed: number }

  // v0.5.0: Cloud & Sync
  cloudSettingsPanelOpen: boolean
  backupManagementPanelOpen: boolean
  autoSyncEnabled: boolean
  syncInterval: number // in seconds
  selectiveSyncFolders: string[]
  autoBackupEnabled: boolean
  backupFrequency: number // in minutes
  maxBackupVersions: number
  backupRetentionDays: number

  // v0.5.1: Security & Privacy
  documentEncryptionPanelOpen: boolean
  accessControlPanelOpen: boolean
  privacySettingsPanelOpen: boolean
  auditLogViewerOpen: boolean
  privacyMode: boolean
  dnsOverHttps: boolean
  dataResidency: 'us' | 'eu' | 'local' | 'canada' | 'australia'
  gdprConsent: boolean
  analyticsEnabled: boolean

  // v0.5.2: Advanced Collaboration Integration
  operationalTransformEnabled: boolean
  contributionAnalyticsPanelOpen: boolean
  activityTimelineOpen: boolean
  currentSessionId: string | null
  replayMode: boolean
  replayTimestamp: number
  sessionHistoryOpen: boolean
  presenceIndicatorsEnabled: boolean

  // v0.5.3: AI Phase 3 Final Integration & Phase 4
  editorSelection: { from: number; to: number } | null
  userPreference?: { tone: 'formal' | 'casual' | 'neutral'; vocabulary: 'technical' | 'simple' | 'mixed'; customTerms: Record<string, string> }
  contextAwareWritingEnabled: boolean
  aiPersonalizationEnabled: boolean
  suggestionHistoryEnabled: boolean

  // Actions
  setDocumentContent: (content: string) => void
  updateDocumentStats: (content: string) => void
  setDocumentTitle: (title: string) => void
  setCurrentFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  setWordCount: (count: number) => void
  setCharCount: (count: number) => void
  addChatMessage: (msg: ChatMessage) => void
  setChatLoading: (loading: boolean) => void
  setAgentStatus: (status: string) => void
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
  setGraphNodes: (nodes: VcsGraphNode[]) => void
  setMergeConflicts: (conflicts: VcsMergeConflict[]) => void
  setMergeSourceBranch: (branch: string) => void
  setAgentConfig: (config: Partial<AppState['agentConfig']>) => void
  setOllamaFormat: (enabled: boolean) => void
  addBackgroundTask: (prompt: string) => string
  updateBackgroundTask: (id: string, updates: Partial<{ status: 'running' | 'done' | 'error'; result: string; error: string }>) => void
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
  appendChatStreamToken: (id: string, token: string) => void
  finalizeStreamingMessage: (id: string, finalContent?: string) => void
  addChatErrorMessage: (error: string) => void
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
  setDocumentMarginTop: (margin: number) => void
  setDocumentMarginBottom: (margin: number) => void
  setDocumentMarginLeft: (margin: number) => void
  setDocumentMarginRight: (margin: number) => void
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
  reorderDocTabs: (fromIndex: number, toIndex: number) => void
  // Split view
  setSplitViewOpen: (open: boolean) => void
  setSplitViewRightTab: (tabId: string | null) => void
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
  addCommentReply: (threadId: string, reply: { author: string; authorId: string; content: string; mentions?: string[] }) => void
  resolveCommentThread: (threadId: string) => void
  unresolveCommentThread: (threadId: string) => void
  deleteCommentThread: (threadId: string) => void
  setCommentInputOpen: (open: boolean) => void
  setCommentSelection: (from: number, to: number, text: string) => void

  // v0.4.5: Collaboration 2.0
  // Activity Log
  addCollaborationEvent: (event: Omit<CollaborationEvent, 'id' | 'timestamp'>) => void
  setCollaborationTimelineOpen: (open: boolean) => void
  clearCollaborationEvents: () => void

  // Document History & Snapshots
  addDocumentSnapshot: (snapshot: Omit<DocumentSnapshot, 'id'>) => string
  setDocumentSnapshots: (snapshots: DocumentSnapshot[]) => void
  setCurrentSnapshotId: (id: string | null) => void
  deleteSnapshot: (id: string) => void

  // Conflict Resolution
  addPendingConflict: (conflict: Omit<ConflictResolution, 'id'>) => void
  resolvePendingConflict: (conflictId: string, resolution: 'theirs' | 'ours' | 'custom', customResolution?: string) => void
  removePendingConflict: (conflictId: string) => void
  setConflictResolutionOpen: (open: boolean) => void

  // Attributed Edits (Undo/Redo with attribution)
  addAttributedEdit: (edit: Omit<AttributedEdit, 'id' | 'timestamp'>) => void
  setAttributedEdits: (edits: AttributedEdit[]) => void
  setEditHistoryOpen: (open: boolean) => void

  // Current User Session
  setCurrentUserId: (id: string) => void
  setCurrentUserColor: (color: string) => void

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

  setAgentSessions: (sessions: AppState['agentSessions']) => void
  setAgentActiveSessionId: (id: string | null) => void
  setAgentProfiles: (profiles: AppState['agentProfiles']) => void
  setMultiAgentMode: (on: boolean) => void
  setMultiAgentActiveNames: (names: string[]) => void
  setMultiAgentResults: (results: AppState['multiAgentResults']) => void
  setInlineSuggestion: (suggestion: string | null) => void
  setInlineSuggestionVisible: (visible: boolean) => void

  setVcsStashList: (list: AppState['vcsStashList']) => void
  setVcsBlameData: (data: AppState['vcsBlameData']) => void
  setVcsBlameOpen: (open: boolean) => void
  setVcsGraphEdges: (edges: AppState['vcsGraphEdges']) => void
  setVcsHooks: (hooks: Partial<AppState['vcsHooks']>) => void
  setVcsRebaseMode: (on: boolean) => void
  setVcsRebaseSelectedIds: (ids: string[]) => void

  setPluginList: (list: AppState['pluginList']) => void
  setPluginMarketplace: (marketplace: AppState['pluginMarketplace']) => void
  setPluginToolbarButtons: (buttons: AppState['pluginToolbarButtons']) => void
  setPluginCommands: (commands: AppState['pluginCommands']) => void
  addPluginToolbarButton: (button: { id: string; label: string; tooltip: string; pluginName: string }) => void
  addPluginCommand: (command: { id: string; label: string; shortcut?: string; pluginName: string }) => void

  // v0.3.8: Advanced text editing
  setSmartFormattingRules: (rules: Partial<AppState['smartFormattingRules']>) => void
  setFindReplaceOpen: (open: boolean) => void
  setFindReplaceQuery: (query: string) => void
  setFindReplaceOptions: (options: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean }) => void
  addFindReplaceHistory: (query: string) => void
  setFloatingToolbarVisible: (visible: boolean) => void
  setTextStats: (stats: Partial<AppState['textStats']>) => void
  setTextDensity: (density: 'compact' | 'normal' | 'comfortable') => void
  setColumnWidth: (width: number) => void
  setShowAlignmentGuides: (show: boolean) => void

  // v0.3.9: Export & Format Support
  setExportDialogOpen: (open: boolean) => void
  setImportDialogOpen: (open: boolean) => void
  setIsExporting: (exporting: boolean) => void
  setIsImporting: (importing: boolean) => void
  setExportProgress: (progress: number) => void
  setImportProgress: (progress: number) => void

  // v0.4.0: Dark Mode & Accessibility
  setThemeMode: (mode: 'light' | 'dark' | 'auto') => void
  setAccessibilityMode: (mode: 'normal' | 'high-contrast' | 'eye-comfort' | 'deuteranopia' | 'protanopia' | 'tritanopia') => void
  setUseSystemThemePreference: (use: boolean) => void
  setScheduledDarkMode: (enabled: boolean, startHour?: number, endHour?: number) => void
  setGlobalFontSize: (percentage: number) => void
  setGlobalLineHeight: (height: number) => void
  setGlobalLetterSpacing: (spacing: number) => void
  setReducedMotion: (enabled: boolean) => void
  setScreenReaderOptimized: (enabled: boolean) => void
  setKeyboardNavigationEnabled: (enabled: boolean) => void
  setHighlightFocusIndicators: (enabled: boolean) => void
  setLanguage: (lang: string) => void
  setAccessibilityPanelOpen: (open: boolean) => void
  setThemeCustomizerOpen: (open: boolean) => void
  setFontManagerOpen: (open: boolean) => void

  // v0.4.6: Help System Actions
  setHelpPanelOpen: (open: boolean) => void
  setHelpPanelView: (view: AppState['helpPanelView']) => void
  setTutorialMode: (enabled: boolean) => void
  setTutorialCurrentStep: (step: number) => void
  markFeatureHighlightShown: (featureId: string) => void
  setFeatureHighlightsOpen: (open: boolean) => void
  setContextualHelpContent: (content: string, visible: boolean) => void

  // v0.4.7: AI Writing Assistant Actions
  setAIAssistantOpen: (open: boolean) => void
  setAIContentGenerationTask: (task: AppState['aiContentGenerationTask']) => void
  setAIEnhancementTask: (task: AppState['aiEnhancementTask']) => void
  setAIGeneratedContent: (content: string) => void
  setAISuggestions: (suggestions: AppState['aiSuggestions']) => void

  // v0.4.7: Inline Smart Suggestions Actions
  setInlineSuggestionsEnabled: (enabled: boolean) => void
  setInlineSuggestionTriggerWordCount: (count: number) => void
  setInlineSuggestionContextLength: (length: number) => void
  setInlineSuggestionDebounceMs: (ms: number) => void
  setInlineSuggestionTimeoutMs: (ms: number) => void
  setInlineSuggestionCooldownMs: (ms: number) => void
  setPendingSuggestionInsert: (text: string | null) => void
  setPendingEditorOperation: (op: { type: 'insert' | 'replace'; content?: string; search?: string; replace?: string; position?: 'end' | 'start' | 'cursor'; replaceAll?: boolean } | null) => void
  addAgentReview: (review: Omit<AppState['pendingAgentReviews'][0], 'id'>) => void
  removeAgentReview: (id: string) => void
  acceptAgentReview: (id: string) => void
  rejectAgentReview: (id: string) => void
  acceptAllAgentReviews: () => void

  // v0.4.9: Performance Optimization Actions
  setPerformanceDashboardOpen: (open: boolean) => void
  setVirtualScrollingEnabled: (enabled: boolean) => void
  setLazyLoadMediaEnabled: (enabled: boolean) => void
  setDocumentCompressionEnabled: (enabled: boolean) => void
  setPerformanceStats: (stats: any) => void

  // v0.5.0: Cloud & Sync Actions
  setCloudSettingsPanelOpen: (open: boolean) => void
  setBackupManagementPanelOpen: (open: boolean) => void
  setAutoSyncEnabled: (enabled: boolean) => void
  setSyncInterval: (interval: number) => void
  setSelectiveSyncFolders: (folders: string[]) => void
  setAutoBackupEnabled: (enabled: boolean) => void
  setBackupFrequency: (frequency: number) => void
  setMaxBackupVersions: (max: number) => void
  setBackupRetentionDays: (days: number) => void

  // v0.5.1: Security & Privacy Actions
  setDocumentEncryptionPanelOpen: (open: boolean) => void
  setAccessControlPanelOpen: (open: boolean) => void
  setPrivacySettingsPanelOpen: (open: boolean) => void
  setAuditLogViewerOpen: (open: boolean) => void
  setPrivacyMode: (enabled: boolean) => void
  setDnsOverHttps: (enabled: boolean) => void
  setDataResidency: (residency: 'us' | 'eu' | 'local' | 'canada' | 'australia') => void
  setGdprConsent: (consent: boolean) => void
  setAnalyticsEnabled: (enabled: boolean) => void

  // v0.5.2: Advanced Collaboration Integration Actions
  setOperationalTransformEnabled: (enabled: boolean) => void
  setContributionAnalyticsPanelOpen: (open: boolean) => void
  setActivityTimelineOpen: (open: boolean) => void
  setCurrentSessionId: (id: string | null) => void
  setReplayMode: (enabled: boolean) => void
  setReplayTimestamp: (timestamp: number) => void
  setSessionHistoryOpen: (open: boolean) => void
  setPresenceIndicatorsEnabled: (enabled: boolean) => void

  // v0.5.3: AI Phase 3 Final Integration & Phase 4
  setEditorSelection: (selection: { from: number; to: number } | null) => void
  setUserPreference: (preference: AppState['userPreference']) => void
  setContextAwareWritingEnabled: (enabled: boolean) => void
  setAiPersonalizationEnabled: (enabled: boolean) => void
  setSuggestionHistoryEnabled: (enabled: boolean) => void

  // v0.4.1: Search & Navigation
  globalSearchOpen: boolean
  globalSearchQuery: string
  globalSearchResults: Array<{ id: string; documentId: string; documentTitle: string; content: string; lineNumber?: number; context: string; timestamp: number }>
  globalSearchHistory: Array<{ query: string; timestamp: number; resultCount: number }>
  globalSearchSavedSearches: Array<{ id: string; name: string; query: string; createdAt: number }>
  globalSearchFilters: { contentType?: string; dateFrom?: number; dateTo?: number }
  globalSearchAllTabs: boolean // search across all open tabs
  goToLineDialogOpen: boolean
  goToLineNumber: number
  breadcrumbOpen: boolean
  breadcrumbItems: Array<{ label: string; level: number; id: string; lineNumber: number }>
  currentBookmarks: Array<{ id: string; label: string; lineNumber: number; documentId: string }>
  recentDocumentsQuickAccess: Array<{ id: string; title: string; path?: string; lastAccessed: number }>

  // v0.4.2: Spell Check & Grammar
  spellCheckPanelOpen: boolean
  grammarPanelOpen: boolean
  writingPanelOpen: boolean
  spellCheckEnabled: boolean
  grammarCheckEnabled: boolean
  spellCheckErrors: SpellingError[]
  grammarIssues: GrammarIssue[]
  writingSuggestions: WritingSuggestion[]
  selectedDictionary: string // 'en-US', 'en-GB', etc.
  useCustomDictionary: boolean
  ignoreWords: Set<string>
  readabilityScore: ReadabilityScore | null
  toneAnalysis: ToneAnalysis | null
  spellCheckAutoRun: boolean
  spellCheckStats: { totalErrors: number; errorDensity: number; topErrors: Array<{ word: string; count: number }> } | null

  // Actions for v0.4.1
  setGlobalSearchOpen: (open: boolean) => void
  setGlobalSearchQuery: (query: string) => void
  setGlobalSearchResults: (results: Array<{ id: string; documentId: string; documentTitle: string; content: string; lineNumber?: number; context: string; timestamp: number }>) => void
  addToSearchHistory: (query: string, resultCount: number) => void
  clearSearchHistory: () => void
  addSavedSearch: (name: string, query: string) => void
  removeSavedSearch: (id: string) => void
  setGlobalSearchFilters: (filters: { contentType?: string; dateFrom?: number; dateTo?: number }) => void
  setGlobalSearchAllTabs: (all: boolean) => void
  setGoToLineDialogOpen: (open: boolean) => void
  setGoToLineNumber: (line: number) => void
  setBreadcrumbItems: (items: Array<{ label: string; level: number; id: string; lineNumber: number }>) => void
  setBreadcrumbOpen: (open: boolean) => void
  addBookmark: (label: string, lineNumber: number, documentId: string) => void
  removeBookmark: (id: string) => void
  addRecentDocument: (id: string, title: string, path?: string) => void

  // v0.4.2: Spell Check & Grammar actions
  setSpellCheckPanelOpen: (open: boolean) => void
  setGrammarPanelOpen: (open: boolean) => void
  setWritingPanelOpen: (open: boolean) => void
  setSpellCheckEnabled: (enabled: boolean) => void
  setGrammarCheckEnabled: (enabled: boolean) => void
  setSpellCheckErrors: (errors: SpellingError[]) => void
  setGrammarIssues: (issues: GrammarIssue[]) => void
  setWritingSuggestions: (suggestions: WritingSuggestion[]) => void
  setSelectedDictionary: (lang: string) => void
  setUseCustomDictionary: (use: boolean) => void
  addIgnoreWord: (word: string) => void
  removeIgnoreWord: (word: string) => void
  clearIgnoreWords: () => void
  setReadabilityScore: (score: ReadabilityScore | null) => void
  setToneAnalysis: (analysis: ToneAnalysis | null) => void
  setSpellCheckAutoRun: (enabled: boolean) => void
  setSpellCheckStats: (stats: { totalErrors: number; errorDensity: number; topErrors: Array<{ word: string; count: number }> } | null) => void

  // v0.4.3: Keyboard & Shortcuts
  keyboardShortcutsOpen: boolean
  shortcutCheatSheetOpen: boolean
  keyboardShortcuts: ShortcutBinding[]
  currentShortcutPreset: string
  setKeyboardShortcutsOpen: (open: boolean) => void
  setShortcutCheatSheetOpen: (open: boolean) => void
  setKeyboardShortcuts: (shortcuts: ShortcutBinding[]) => void
  setCurrentShortcutPreset: (preset: string) => void

  // v0.4.4: Settings & Preferences
  // Editor Settings
  tabSize: number
  useTabsForIndentation: boolean
  wordWrap: boolean

  // Behavior Settings
  autoSaveOnFocusLoss: boolean
  autoFormatOnPaste: boolean
  scrollPastEnd: boolean
  rememberLastDocument: boolean
  sessionRestoration: boolean
  autocorrectAggressiveLevel: 'off' | 'conservative' | 'aggressive'

  // Advanced Settings
  performanceTuning: 'balanced' | 'low-power' | 'high-performance'
  cacheSize: number // in MB
  updateFrequency: 'never' | 'weekly' | 'daily'
  enableBackupExport: boolean

  // Setters for v0.4.4
  setTabSize: (size: number) => void
  setUseTabsForIndentation: (use: boolean) => void
  setWordWrap: (wrap: boolean) => void
  setAutoSaveOnFocusLoss: (enabled: boolean) => void
  setAutoFormatOnPaste: (enabled: boolean) => void
  setScrollPastEnd: (enabled: boolean) => void
  setRememberLastDocument: (enabled: boolean) => void
  setSessionRestoration: (enabled: boolean) => void
  setAutocorrectAggressiveLevel: (level: 'off' | 'conservative' | 'aggressive') => void
  setPerformanceTuning: (mode: 'balanced' | 'low-power' | 'high-performance') => void
  setCacheSize: (sizeMB: number) => void
  setUpdateFrequency: (frequency: 'never' | 'weekly' | 'daily') => void
  setEnableBackupExport: (enabled: boolean) => void
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
  agentStatus: '',

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

  agentConfig: { endpoint: 'http://localhost:11434/v1/chat/completions', apiKey: '', model: 'hermes3' },
  ollamaFormat: loadSetting('ollamaFormat', false),
  availableTools: [],
  agentPresets: [],
  scratchpadContent: '',
  agentPermissions: {
    write: false,
    edit: false,
    save: false,
    revert: false,
    storyboard: false,
    vcs: false,
    streaming: false,
    web: false
  },

  collabCursors: [],
  collabUsers: [],
  collabConnected: false,
  collabRoomCode: null,
  collabPanelOpen: false,

  // v0.4.5: Collaboration 2.0
  collaborationEvents: [],
  collaborationTimelineOpen: false,
  documentSnapshots: [],
  currentSnapshotId: null,
  pendingConflicts: [],
  conflictResolutionOpen: false,
  attributedEdits: [],
  editHistoryOpen: false,
  currentUserId: null,
  currentUserColor: '#89b4fa',

  commandPaletteOpen: false,

  docTabs: [{ id: 'default', title: 'Untitled', filePath: null, content: '', isDirty: false }],
  activeTabId: 'default',

  // Storyboard popup
  storyboardOpen: false,
  storyboardFilePath: null,

  // Split view
  splitViewOpen: false,
  splitViewRightTabId: null,

  recentFiles: [],

  updateAvailable: false,
  updateVersion: '',
  updateUrl: '',

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
  documentMarginTop: loadSetting('documentMarginTop', 40),
  documentMarginBottom: loadSetting('documentMarginBottom', 40),
  documentMarginLeft: loadSetting('documentMarginLeft', 40),
  documentMarginRight: loadSetting('documentMarginRight', 40),
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

  pluginList: [],
  pluginMarketplace: [],
  pluginToolbarButtons: [],
  pluginCommands: [],

  // v0.3.8: Advanced text editing
  smartFormattingRules: {
    smartQuotes: loadSetting('smartQuotes', true),
    autoEmdash: loadSetting('autoEmdash', true),
    autoEndash: loadSetting('autoEndash', true),
    removeDuplicateSpaces: loadSetting('removeDuplicateSpaces', true),
    autoCorrection: loadSetting('autoCorrection', true)
  },
  findReplaceOpen: false,
  findReplaceQuery: '',
  findReplaceRegex: false,
  findReplaceCaseSensitive: false,
  findReplaceWholeWord: false,
  findReplaceHistory: loadSetting('findReplaceHistory', []),
  floatingToolbarVisible: false,
  textStats: {
    characters: 0,
    charactersWithoutSpaces: 0,
    words: 0,
    sentences: 0,
    paragraphs: 0,
    readingTimeMinutes: 0,
    readingTimeSeconds: 0,
    readabilityScore: 0,
    averageWordLength: 0
  },
  textDensity: loadSetting('textDensity', 'normal') as 'compact' | 'normal' | 'comfortable',
  columnWidth: loadSetting('columnWidth', 800),
  showAlignmentGuides: loadSetting('showAlignmentGuides', false),

  // v0.3.9: Export & Format Support
  exportDialogOpen: false,
  templateGalleryOpen: false,
  importDialogOpen: false,
  isExporting: false,
  isImporting: false,
  exportProgress: 0,
  importProgress: 0,

  // v0.4.0: Dark Mode & Accessibility
  themeMode: loadSetting('themeMode', 'auto') as any,
  accessibilityMode: loadSetting('accessibilityMode', 'normal') as any,
  useSystemThemePreference: loadSetting('useSystemThemePreference', true),
  scheduledDarkModeEnabled: loadSetting('scheduledDarkModeEnabled', false),
  scheduledDarkModeStart: loadSetting('scheduledDarkModeStart', 22),
  scheduledDarkModeEnd: loadSetting('scheduledDarkModeEnd', 7),
  globalFontSize: loadSetting('globalFontSize', 100),
  globalLineHeight: loadSetting('globalLineHeight', 1.6),
  globalLetterSpacing: loadSetting('globalLetterSpacing', 0),
  reducedMotion: loadSetting('reducedMotion', false),
  screenReaderOptimized: loadSetting('screenReaderOptimized', false),
  keyboardNavigationEnabled: loadSetting('keyboardNavigationEnabled', true),
  highlightFocusIndicators: loadSetting('highlightFocusIndicators', false),
  language: loadSetting('language', 'en-US'),
  accessibilityPanelOpen: false,
  themeCustomizerOpen: false,
  fontManagerOpen: false,

  // v0.4.6: Help System
  helpPanelOpen: false,
  helpPanelView: 'tutorials',
  tutorialMode: false,
  tutorialCurrentStep: 0,
  featureHighlightsShown: [],
  featureHighlightsOpen: false,
  contextualHelpContent: '',
  contextualHelpVisible: false,

  // v0.4.7: AI Writing Assistant
  aiAssistantOpen: false,
  aiContentGenerationTask: 'outline',
  aiEnhancementTask: 'tone',
  aiGeneratedContent: '',
  aiSuggestions: [],

  // v0.4.7: Inline Smart Suggestions
  inlineSuggestionsEnabled: true,
  inlineSuggestionTriggerWordCount: 3,
  inlineSuggestionContextLength: 150,
  inlineSuggestionDebounceMs: 1000,
  inlineSuggestionTimeoutMs: 10000,
  inlineSuggestionCooldownMs: 30000,
  pendingSuggestionInsert: null,
  pendingEditorOperation: null,
  pendingAgentReviews: [],
  backgroundTasks: [],

  // v0.4.9: Performance Optimization
  performanceDashboardOpen: false,
  virtualScrollingEnabled: true,
  lazyLoadMediaEnabled: true,
  documentCompressionEnabled: false,
  performanceStats: { totalMetrics: 0, avgMemoryUsage: 0, peakMemoryUsage: 0, avgLoadTime: 0, avgSaveTime: 0, totalDocumentsProcessed: 0 },

  // v0.5.0: Cloud & Sync
  cloudSettingsPanelOpen: false,
  backupManagementPanelOpen: false,
  autoSyncEnabled: loadSetting('autoSyncEnabled', false),
  syncInterval: loadSetting('syncInterval', 300),
  selectiveSyncFolders: loadSetting('selectiveSyncFolders', []),
  autoBackupEnabled: loadSetting('autoBackupEnabled', true),
  backupFrequency: loadSetting('backupFrequency', 60),
  maxBackupVersions: loadSetting('maxBackupVersions', 30),
  backupRetentionDays: loadSetting('backupRetentionDays', 90),

  // v0.5.1: Security & Privacy
  documentEncryptionPanelOpen: false,
  accessControlPanelOpen: false,
  privacySettingsPanelOpen: false,
  auditLogViewerOpen: false,
  privacyMode: loadSetting('privacyMode', false),
  dnsOverHttps: loadSetting('dnsOverHttps', true),
  dataResidency: loadSetting('dataResidency', 'us') as 'us' | 'eu' | 'local' | 'canada' | 'australia',
  gdprConsent: loadSetting('gdprConsent', false),
  analyticsEnabled: loadSetting('analyticsEnabled', true),

  // v0.5.2: Advanced Collaboration Integration
  operationalTransformEnabled: loadSetting('operationalTransformEnabled', true),
  contributionAnalyticsPanelOpen: false,
  activityTimelineOpen: false,
  currentSessionId: null,
  replayMode: false,
  replayTimestamp: 0,
  sessionHistoryOpen: false,
  presenceIndicatorsEnabled: loadSetting('presenceIndicatorsEnabled', true),

  // v0.5.3: AI Phase 3 Final Integration & Phase 4
  editorSelection: null,
  userPreference: { tone: 'neutral', vocabulary: 'mixed', customTerms: {} },
  contextAwareWritingEnabled: loadSetting('contextAwareWritingEnabled', true),
  aiPersonalizationEnabled: loadSetting('aiPersonalizationEnabled', true),
  suggestionHistoryEnabled: loadSetting('suggestionHistoryEnabled', true),

  // v0.4.1: Search & Navigation
  globalSearchOpen: false,
  globalSearchQuery: '',
  globalSearchResults: [],
  globalSearchHistory: loadSetting('globalSearchHistory', []),
  globalSearchSavedSearches: loadSetting('globalSearchSavedSearches', []),
  globalSearchFilters: {},
  globalSearchAllTabs: loadSetting('globalSearchAllTabs', false),
  goToLineDialogOpen: false,
  goToLineNumber: 1,
  breadcrumbOpen: true,
  breadcrumbItems: [],
  currentBookmarks: loadSetting('currentBookmarks', []),
  recentDocumentsQuickAccess: loadSetting('recentDocumentsQuickAccess', []),

  // v0.4.2: Spell Check & Grammar
  spellCheckPanelOpen: false,
  grammarPanelOpen: false,
  writingPanelOpen: false,
  spellCheckEnabled: loadSetting('spellCheckEnabled', true),
  grammarCheckEnabled: loadSetting('grammarCheckEnabled', true),
  spellCheckErrors: [],
  grammarIssues: [],
  writingSuggestions: [],
  selectedDictionary: loadSetting('selectedDictionary', 'en-US'),
  useCustomDictionary: loadSetting('useCustomDictionary', false),
  ignoreWords: new Set(loadSetting('ignoreWords', [])),
  readabilityScore: null,
  toneAnalysis: null,
  spellCheckAutoRun: loadSetting('spellCheckAutoRun', true),
  spellCheckStats: null,

  // v0.4.3: Keyboard & Shortcuts
  keyboardShortcutsOpen: false,
  shortcutCheatSheetOpen: false,
  keyboardShortcuts: loadSetting('keyboardShortcuts', getDefaultShortcuts()),
  currentShortcutPreset: loadSetting('currentShortcutPreset', 'vscode'),

  // v0.4.4: Settings & Preferences
  // Editor Settings
  tabSize: loadSetting('tabSize', 2),
  useTabsForIndentation: loadSetting('useTabsForIndentation', false),
  wordWrap: loadSetting('wordWrap', true),

  // Behavior Settings
  autoSaveOnFocusLoss: loadSetting('autoSaveOnFocusLoss', true),
  autoFormatOnPaste: loadSetting('autoFormatOnPaste', true),
  scrollPastEnd: loadSetting('scrollPastEnd', false),
  rememberLastDocument: loadSetting('rememberLastDocument', true),
  sessionRestoration: loadSetting('sessionRestoration', true),
  autocorrectAggressiveLevel: loadSetting('autocorrectAggressiveLevel', 'conservative') as 'off' | 'conservative' | 'aggressive',

  // Advanced Settings
  performanceTuning: loadSetting('performanceTuning', 'balanced') as 'balanced' | 'low-power' | 'high-performance',
  cacheSize: loadSetting('cacheSize', 100), // 100 MB
  updateFrequency: loadSetting('updateFrequency', 'weekly') as 'never' | 'weekly' | 'daily',
  enableBackupExport: loadSetting('enableBackupExport', true),

  setDocumentContent: (content) => {
    // Fast update: just set content and dirty flag without expensive word counting
    set({ documentContent: content, isDirty: true })
  },
  updateDocumentStats: (content) => {
    // Calculate word/char counts - should be called with debounce from component
    const { words, chars } = countWords(content)
    set({ wordCount: words, charCount: chars })
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
  setAgentConfig: (config) => set((s) => {
    const updated = { ...s.agentConfig, ...config }
    localStorage.setItem('aw-agentConfig', JSON.stringify(updated))
    return { agentConfig: updated }
  }),
  setOllamaFormat: (enabled) => {
    saveSetting('ollamaFormat', enabled)
    set({ ollamaFormat: enabled })
    // Push to native agent bridge
    window.wordapp?.agent.configureAdvanced?.({ ollamaFormat: enabled })
  },
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
    set((s) => ({
      documentContent: change.contentAfter, isDirty: true,
      pendingChanges: s.pendingChanges.map((c) => c.id === id ? { ...c, status: 'accepted' as const } : c),
      activePendingChangeId: s.pendingChanges.find((c) => c.id !== id && c.status === 'pending')?.id || null
    }))
    // Update word counts separately with debounce in component
    setTimeout(() => updateDocumentStats(change.contentAfter), 0)
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
    set({
      documentContent: lastChange.contentAfter, isDirty: true,
      pendingChanges: state.pendingChanges.map((c) => c.status === 'pending' ? { ...c, status: 'accepted' as const } : c),
      activePendingChangeId: null
    })
    // Update word counts separately
    setTimeout(() => updateDocumentStats(lastChange.contentAfter), 0)
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
  setAgentStatus: (status) => set({ agentStatus: status }),
  updateStreamingMessage: (id, content) => set((s) => ({
    chatMessages: s.chatMessages.map((m) => m.id === id ? { ...m, content, streaming: false } : m),
    chatStreamingId: null,
    chatStreamContent: ''
  })),
  appendChatStreamToken: (id, token) => set((s) => ({
    chatMessages: s.chatMessages.map((m) => m.id === id ? { ...m, content: m.content + token, streaming: true } : m)
  })),
  finalizeStreamingMessage: (id, finalContent) => set((s) => ({
    chatMessages: s.chatMessages.map((m) => m.id === id ? { ...m, content: finalContent ?? m.content, streaming: false } : m),
    chatStreamingId: null,
    chatStreamContent: ''
  })),
  addChatErrorMessage: (error) => set((s) => ({
    chatMessages: [...s.chatMessages, { id: crypto.randomUUID(), role: 'error' as const, content: error, streaming: false }],
    chatLoading: false,
    chatStreamingId: null
  })),
  setAgentPresets: (presets) => {
    localStorage.setItem('aw-agentPresets', JSON.stringify(presets))
    set({ agentPresets: presets })
  },
  setScratchpadContent: (content) => set({ scratchpadContent: content }),
  setAgentPermissions: (permissions: Partial<AgentPermissions>) => set((state) => ({
    agentPermissions: { ...state.agentPermissions, ...permissions },
  })),
  setCollabCursors: (cursors) => set({ collabCursors: cursors }),
  setCollabUsers: (users: CollabUser[]) => set({ collabUsers: users }),
  setCollabConnected: (connected: boolean) => set({ collabConnected: connected }),
  setCollabRoomCode: (code: string | null) => set({ collabRoomCode: code }),
  setCollabPanelOpen: (open: boolean) => set({ collabPanelOpen: open }),
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
  setTheme: (theme) => saveSetting('theme', theme, set, { theme }),
  setAccentColor: (color) => saveSetting('accentColor', color, set, { accentColor: color }),
  setUiFontSize: (size) => saveSetting('uiFontSize', size, set, { uiFontSize: size }),
  setEditorFont: (font) => saveSetting('editorFont', font, set, { editorFont: font }),
  setAgentMaxToolTurns: (turns) => saveSetting('agentMaxToolTurns', turns, set, { agentMaxToolTurns: turns }),
  setAgentAutoApplyThreshold: (threshold) => saveSetting('agentAutoApplyThreshold', threshold, set, { agentAutoApplyThreshold: threshold }),
  setAgentTemperature: (temp) => saveSetting('agentTemperature', temp, set, { agentTemperature: temp }),
  setSpellCheckLang: (lang) => saveSetting('spellCheckLang', lang, set, { spellCheckLang: lang }),
  setDefaultFontFamily: (font) => saveSetting('defaultFontFamily', font, set, { defaultFontFamily: font }),
  setDefaultFontSize: (size) => saveSetting('defaultFontSize', size, set, { defaultFontSize: size }),
  setShowWordCount: (show) => saveSetting('showWordCount', show, set, { showWordCount: show }),
  setLineSpacing: (spacing) => saveSetting('lineSpacing', spacing, set, { lineSpacing: spacing }),
  setDocumentMarginTop: (margin) => saveSetting('documentMarginTop', margin, set, { documentMarginTop: margin }),
  setDocumentMarginBottom: (margin) => saveSetting('documentMarginBottom', margin, set, { documentMarginBottom: margin }),
  setDocumentMarginLeft: (margin) => saveSetting('documentMarginLeft', margin, set, { documentMarginLeft: margin }),
  setDocumentMarginRight: (margin) => saveSetting('documentMarginRight', margin, set, { documentMarginRight: margin }),
  setVcsDefaultBranch: (name) => saveSetting('vcsDefaultBranch', name, set, { vcsDefaultBranch: name }),
  setVcsAutoCommitOnSave: (auto) => saveSetting('vcsAutoCommitOnSave', auto, set, { vcsAutoCommitOnSave: auto }),
  setVcsMaxCommits: (max) => saveSetting('vcsMaxCommits', max, set, { vcsMaxCommits: max }),
  setCollabDisplayName: (name) => saveSetting('collabDisplayName', name, set, { collabDisplayName: name }),
  setCollabCursorColor: (color) => saveSetting('collabCursorColor', color, set, { collabCursorColor: color }),
  setCollabMcpPort: (port) => saveSetting('collabMcpPort', port, set, { collabMcpPort: port }),
  addDocTab: (tab) => {
    const state = get()
    // Save current editor content to current tab before switching
    const currentTab = state.docTabs.find((t) => t.id === state.activeTabId)
    const currentContent = state.documentContent
    const currentDirty = state.isDirty
    const updatedTabs = currentTab
      ? state.docTabs.map((t) => t.id === currentTab.id ? { ...t, content: currentContent, isDirty: currentDirty } : t)
      : state.docTabs

    const id = crypto.randomUUID()
    set({
      docTabs: [...updatedTabs, { ...tab, id }],
      activeTabId: id,
      documentContent: tab.content,  // new tab starts with its own content
      documentTitle: tab.title,
      currentFilePath: tab.filePath ?? null,  // new tab's file path (null for unsaved docs)
      isDirty: tab.isDirty ?? false,
      wordCount: 0,
      charCount: 0
    })
    return id
  },
  switchDocTab: (id) => {
    const state = get()
    const tab = state.docTabs.find((t) => t.id === id)
    if (tab && tab.id !== state.activeTabId) {
      const currentTab = state.docTabs.find((t) => t.id === state.activeTabId)
      const updatedTabs = currentTab
        ? state.docTabs.map((t) => t.id === currentTab.id ? { ...t, content: state.documentContent, isDirty: state.isDirty } : t)
        : state.docTabs
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
    if (tabs.length === 0) return { 
      docTabs: [{ id: 'default', title: 'Untitled', filePath: null, content: '', isDirty: false }], 
      activeTabId: 'default',
      splitViewRightTabId: null
    }
    const newActive = s.activeTabId === id ? tabs[tabs.length - 1].id : s.activeTabId
    const newSplitViewRightTabId = s.splitViewRightTabId === id ? null : s.splitViewRightTabId
    return { 
      docTabs: tabs, 
      activeTabId: newActive,
      splitViewRightTabId: newSplitViewRightTabId
    }
  }),
  updateDocTab: (id, updates) => set((s) => ({
    docTabs: s.docTabs.map((t) => t.id === id ? { ...t, ...updates } : t)
  })),
  reorderDocTabs: (fromIndex, toIndex) => set((s) => {
    const tabs = [...s.docTabs]
    const [draggedTab] = tabs.splice(fromIndex, 1)
    tabs.splice(toIndex, 0, draggedTab)
    return { docTabs: tabs }
  }),
  openStoryboardTab: (filePath) => {
    const state = get()
    const effectivePath = filePath || 'Untitled'
    // Check if storyboard tab already exists for this document
    const existing = state.docTabs.find((t) => t.type === 'storyboard' && t.parentFilePath === effectivePath)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    // Create new storyboard tab
    const fileName = (filePath ? filePath.split(/[\\\\/]/).pop() : 'Untitled') || 'Untitled'
    const id = `storyboard-${crypto.randomUUID()}`
    const sbTab: DocTab = {
      id,
      title: `📋 ${fileName}`,
      filePath: null,
      content: '',
      isDirty: false,
      type: 'storyboard',
      parentFilePath: effectivePath
    }
    set((s) => ({ docTabs: [...s.docTabs, sbTab], activeTabId: id }))
  },
  closeStoryboardTab: () => {
    const state = get()
    const activeTab = state.docTabs.find((t) => t.id === state.activeTabId)
    if (activeTab?.type !== 'storyboard') return
    set((s) => {
      const tabs = s.docTabs.filter((t) => t.id !== s.activeTabId)
      const newActive = tabs.length > 0 ? tabs[tabs.length - 1].id : 'default'
      return { docTabs: tabs, activeTabId: newActive }
    })
  },
  openStoryboardPopup: (filePath) => set({ storyboardOpen: true, storyboardFilePath: filePath || null }),
  closeStoryboardPopup: () => set({ storyboardOpen: false }),
  setSplitViewOpen: (open) => set({ splitViewOpen: open }),
  setSplitViewRightTab: (tabId) => set({ splitViewRightTabId: tabId }),
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

  setInlineDiffOpen: (open) => set({ inlineDiffOpen: open }),
  setInlineDiffFromCommitId: (id) => set({ inlineDiffFromCommitId: id }),

  setTocOpen: (open) => set({ tocOpen: open }),

  setPrintPreviewOpen: (open) => set({ printPreviewOpen: open }),

  setPageHeaderFooter: (hf) => {
    const updated = { ...get().pageHeaderFooter, ...hf }
    saveSetting('pageHeaderFooter', updated, set, { pageHeaderFooter: updated })
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

  // v0.4.5: Collaboration 2.0 Setters
  addCollaborationEvent: (event) => {
    const id = crypto.randomUUID()
    set((s) => ({
      collaborationEvents: [...s.collaborationEvents, { ...event, id, timestamp: Date.now() }]
    }))
  },
  setCollaborationTimelineOpen: (open) => set({ collaborationTimelineOpen: open }),
  clearCollaborationEvents: () => set({ collaborationEvents: [] }),

  addDocumentSnapshot: (snapshot) => {
    const id = crypto.randomUUID()
    set((s) => ({
      documentSnapshots: [...s.documentSnapshots, { ...snapshot, id }]
    }))
    return id
  },
  setDocumentSnapshots: (snapshots) => set({ documentSnapshots: snapshots }),
  setCurrentSnapshotId: (id) => set({ currentSnapshotId: id }),
  deleteSnapshot: (id) => set((s) => ({
    documentSnapshots: s.documentSnapshots.filter((snap) => snap.id !== id),
    currentSnapshotId: s.currentSnapshotId === id ? null : s.currentSnapshotId
  })),

  addPendingConflict: (conflict) => {
    const id = crypto.randomUUID()
    set((s) => ({
      pendingConflicts: [...s.pendingConflicts, { ...conflict, id }]
    }))
  },
  resolvePendingConflict: (conflictId, resolution, customResolution) => set((s) => ({
    pendingConflicts: s.pendingConflicts.map((c) =>
      c.id === conflictId ? { ...c, resolved: true, resolution, customResolution } : c
    )
  })),
  removePendingConflict: (conflictId) => set((s) => ({
    pendingConflicts: s.pendingConflicts.filter((c) => c.id !== conflictId)
  })),
  setConflictResolutionOpen: (open) => set({ conflictResolutionOpen: open }),

  addAttributedEdit: (edit) => {
    const id = crypto.randomUUID()
    set((s) => ({
      attributedEdits: [...s.attributedEdits, { ...edit, id, timestamp: Date.now() }]
    }))
  },
  setAttributedEdits: (edits) => set({ attributedEdits: edits }),
  setEditHistoryOpen: (open) => set({ editHistoryOpen: open }),

  setCurrentUserId: (id) => set({ currentUserId: id }),
  setCurrentUserColor: (color) => set({ currentUserColor: color }),

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

  setAutocorrectEnabled: (on) => saveSetting('autocorrectEnabled', on, set, { autocorrectEnabled: on }),
  setSmartQuotesEnabled: (on) => saveSetting('smartQuotesEnabled', on, set, { smartQuotesEnabled: on }),
  setEmDashEnabled: (on) => saveSetting('emDashEnabled', on, set, { emDashEnabled: on }),

  setPageBreakCount: (count) => set({ pageBreakCount: count }),

  setAgentSessions: (sessions) => set({ agentSessions: sessions }),
  setAgentActiveSessionId: (id) => set({ agentActiveSessionId: id }),
  setAgentProfiles: (profiles) => set({ agentProfiles: profiles }),
  setMultiAgentMode: (on) => set({ multiAgentMode: on }),
  setMultiAgentActiveNames: (names) => set({ multiAgentActiveNames: names }),
  setMultiAgentResults: (results) => set({ multiAgentResults: results }),
  setInlineSuggestion: (suggestion) => set({ inlineSuggestion: suggestion }),
  setInlineSuggestionVisible: (visible) => set({ inlineSuggestionVisible: visible }),

  setVcsStashList: (list) => set({ vcsStashList: list }),
  setVcsBlameData: (data) => set({ vcsBlameData: data }),
  setVcsBlameOpen: (open) => set({ vcsBlameOpen: open }),
  setVcsGraphEdges: (edges) => set({ vcsGraphEdges: edges }),
  setVcsHooks: (hooks) => set((s) => ({ vcsHooks: { ...s.vcsHooks, ...hooks } })),
  setVcsRebaseMode: (on) => set({ vcsRebaseMode: on }),
  setVcsRebaseSelectedIds: (ids) => set({ vcsRebaseSelectedIds: ids }),

  setPluginList: (list) => set({ pluginList: list }),
  setPluginMarketplace: (marketplace) => set({ pluginMarketplace: marketplace }),
  setPluginToolbarButtons: (buttons) => set({ pluginToolbarButtons: buttons }),
  setPluginCommands: (commands) => set({ pluginCommands: commands }),
  addPluginToolbarButton: (button) => set((s) => ({ pluginToolbarButtons: [...s.pluginToolbarButtons, button] })),
  addPluginCommand: (command) => set((s) => ({ pluginCommands: [...s.pluginCommands, command] })),

  // v0.3.8: Advanced text editing
  setSmartFormattingRules: (rules) => set((s) => ({ smartFormattingRules: { ...s.smartFormattingRules, ...rules } })),
  setFindReplaceOpen: (open) => set({ findReplaceOpen: open }),
  setFindReplaceQuery: (query) => set({ findReplaceQuery: query }),
  setFindReplaceOptions: (options) => set((s) => ({
    findReplaceRegex: options.regex !== undefined ? options.regex : s.findReplaceRegex,
    findReplaceCaseSensitive: options.caseSensitive !== undefined ? options.caseSensitive : s.findReplaceCaseSensitive,
    findReplaceWholeWord: options.wholeWord !== undefined ? options.wholeWord : s.findReplaceWholeWord
  })),
  addFindReplaceHistory: (query) => set((s) => {
    const history = [query, ...s.findReplaceHistory.filter(q => q !== query)].slice(0, 10)
    saveSetting('findReplaceHistory', history)
    return { findReplaceHistory: history }
  }),
  setFloatingToolbarVisible: (visible) => set({ floatingToolbarVisible: visible }),
  setTextStats: (stats) => set((s) => ({ textStats: { ...s.textStats, ...stats } })),
  setTextDensity: (density) => {
    saveSetting('textDensity', density)
    set({ textDensity: density })
  },
  setColumnWidth: (width) => {
    saveSetting('columnWidth', width)
    set({ columnWidth: width })
  },
  setShowAlignmentGuides: (show) => {
    saveSetting('showAlignmentGuides', show)
    set({ showAlignmentGuides: show })
  },

  // v0.3.9: Export & Format Support
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),
  setTemplateGalleryOpen: (open) => set({ templateGalleryOpen: open }),
  setImportDialogOpen: (open) => set({ importDialogOpen: open }),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setIsImporting: (importing) => set({ isImporting: importing }),
  setExportProgress: (progress) => set({ exportProgress: Math.min(100, Math.max(0, progress)) }),
  setImportProgress: (progress) => set({ importProgress: Math.min(100, Math.max(0, progress)) }),

  // v0.4.0: Dark Mode & Accessibility
  setThemeMode: (mode) => {
    saveSetting('themeMode', mode)
    set({ themeMode: mode })
  },
  setAccessibilityMode: (mode) => {
    saveSetting('accessibilityMode', mode)
    set({ accessibilityMode: mode })
  },
  setUseSystemThemePreference: (use) => {
    saveSetting('useSystemThemePreference', use)
    set({ useSystemThemePreference: use })
  },
  setScheduledDarkMode: (enabled, startHour, endHour) => {
    saveSetting('scheduledDarkModeEnabled', enabled)
    if (startHour !== undefined) saveSetting('scheduledDarkModeStart', startHour)
    if (endHour !== undefined) saveSetting('scheduledDarkModeEnd', endHour)
    set({
      scheduledDarkModeEnabled: enabled,
      ...(startHour !== undefined && { scheduledDarkModeStart: startHour }),
      ...(endHour !== undefined && { scheduledDarkModeEnd: endHour })
    })
  },
  setGlobalFontSize: (percentage) => {
    const clamped = Math.min(200, Math.max(50, percentage))
    saveSetting('globalFontSize', clamped)
    set({ globalFontSize: clamped })
  },
  setGlobalLineHeight: (height) => {
    const clamped = Math.min(3, Math.max(1.2, height))
    saveSetting('globalLineHeight', clamped)
    set({ globalLineHeight: clamped })
  },
  setGlobalLetterSpacing: (spacing) => {
    const clamped = Math.min(2, Math.max(-1, spacing))
    saveSetting('globalLetterSpacing', clamped)
    set({ globalLetterSpacing: clamped })
  },
  setReducedMotion: (enabled) => {
    saveSetting('reducedMotion', enabled)
    set({ reducedMotion: enabled })
  },
  setScreenReaderOptimized: (enabled) => {
    saveSetting('screenReaderOptimized', enabled)
    set({ screenReaderOptimized: enabled })
  },
  setKeyboardNavigationEnabled: (enabled) => {
    saveSetting('keyboardNavigationEnabled', enabled)
    set({ keyboardNavigationEnabled: enabled })
  },
  setHighlightFocusIndicators: (enabled) => {
    saveSetting('highlightFocusIndicators', enabled)
    set({ highlightFocusIndicators: enabled })
  },
  setLanguage: (lang) => {
    saveSetting('language', lang)
    set({ language: lang })
  },
  setAccessibilityPanelOpen: (open) => set({ accessibilityPanelOpen: open }),
  setThemeCustomizerOpen: (open) => set({ themeCustomizerOpen: open }),
  setFontManagerOpen: (open) => set({ fontManagerOpen: open }),

  // v0.4.6: Help System actions
  setHelpPanelOpen: (open) => set({ helpPanelOpen: open }),
  setHelpPanelView: (view) => set({ helpPanelView: view }),
  setTutorialMode: (enabled) => set({ tutorialMode: enabled }),
  setTutorialCurrentStep: (step) => set({ tutorialCurrentStep: step }),
  markFeatureHighlightShown: (featureId) => set((s) => ({
    featureHighlightsShown: [...new Set([...s.featureHighlightsShown, featureId])]
  })),
  setFeatureHighlightsOpen: (open) => set({ featureHighlightsOpen: open }),
  setContextualHelpContent: (content, visible) => set({ contextualHelpContent: content, contextualHelpVisible: visible }),

  // v0.4.7: AI Writing Assistant actions
  setAIAssistantOpen: (open) => set({ aiAssistantOpen: open }),
  setAIContentGenerationTask: (task) => set({ aiContentGenerationTask: task }),
  setAIEnhancementTask: (task) => set({ aiEnhancementTask: task }),
  setAIGeneratedContent: (content) => set({ aiGeneratedContent: content }),
  setAISuggestions: (suggestions) => set({ aiSuggestions: suggestions }),

  // v0.4.7: Inline Smart Suggestions actions
  setInlineSuggestionsEnabled: (enabled) => set({ inlineSuggestionsEnabled: enabled }),
  setInlineSuggestionTriggerWordCount: (count) => set({ inlineSuggestionTriggerWordCount: count }),
  setInlineSuggestionContextLength: (length) => set({ inlineSuggestionContextLength: length }),
  setInlineSuggestionDebounceMs: (ms) => set({ inlineSuggestionDebounceMs: ms }),
  setInlineSuggestionTimeoutMs: (ms) => set({ inlineSuggestionTimeoutMs: ms }),
  setInlineSuggestionCooldownMs: (ms) => set({ inlineSuggestionCooldownMs: ms }),
  setPendingSuggestionInsert: (text) => set({ pendingSuggestionInsert: text }),
  setPendingEditorOperation: (op) => set({ pendingEditorOperation: op }),
  addAgentReview: (review) => set((s) => ({ pendingAgentReviews: [...s.pendingAgentReviews, { ...review, id: crypto.randomUUID() }] })),
  removeAgentReview: (id) => set((s) => ({ pendingAgentReviews: s.pendingAgentReviews.filter(r => r.id !== id) })),
  acceptAgentReview: (id) => {
    const state = get()
    const review = state.pendingAgentReviews.find(r => r.id === id)
    if (review) {
      set({ pendingEditorOperation: review, pendingAgentReviews: state.pendingAgentReviews.filter(r => r.id !== id) })
    }
  },
  rejectAgentReview: (id) => set((s) => ({ pendingAgentReviews: s.pendingAgentReviews.filter(r => r.id !== id) })),
  acceptAllAgentReviews: () => {
    const state = get()
    if (state.pendingAgentReviews.length === 0) return
    // Apply the last review (most recent change) — others may be stale
    const last = state.pendingAgentReviews[state.pendingAgentReviews.length - 1]
    set({ pendingEditorOperation: last, pendingAgentReviews: [] })
  },
  addBackgroundTask: (prompt) => {
    const id = crypto.randomUUID()
    set((s) => ({ backgroundTasks: [...s.backgroundTasks, { id, prompt, status: 'running' }] }))
    return id
  },
  updateBackgroundTask: (id, updates) => set((s) => ({
    backgroundTasks: s.backgroundTasks.map(t => t.id === id ? { ...t, ...updates } : t)
  })),

  // v0.4.9: Performance Optimization actions
  setPerformanceDashboardOpen: (open) => set({ performanceDashboardOpen: open }),
  setVirtualScrollingEnabled: (enabled) => set({ virtualScrollingEnabled: enabled }),
  setLazyLoadMediaEnabled: (enabled) => set({ lazyLoadMediaEnabled: enabled }),
  setDocumentCompressionEnabled: (enabled) => set({ documentCompressionEnabled: enabled }),
  setPerformanceStats: (stats) => set({ performanceStats: stats }),

  // v0.5.0: Cloud & Sync actions
  setCloudSettingsPanelOpen: (open) => set({ cloudSettingsPanelOpen: open }),
  setBackupManagementPanelOpen: (open) => set({ backupManagementPanelOpen: open }),
  setAutoSyncEnabled: (enabled) => {
    saveSetting('autoSyncEnabled', enabled)
    set({ autoSyncEnabled: enabled })
  },
  setSyncInterval: (interval) => {
    saveSetting('syncInterval', interval)
    set({ syncInterval: interval })
  },
  setSelectiveSyncFolders: (folders) => {
    saveSetting('selectiveSyncFolders', folders)
    set({ selectiveSyncFolders: folders })
  },
  setAutoBackupEnabled: (enabled) => {
    saveSetting('autoBackupEnabled', enabled)
    set({ autoBackupEnabled: enabled })
  },
  setBackupFrequency: (frequency) => {
    const clamped = Math.max(5, Math.min(240, frequency))
    saveSetting('backupFrequency', clamped)
    set({ backupFrequency: clamped })
  },
  setMaxBackupVersions: (max) => {
    saveSetting('maxBackupVersions', max)
    set({ maxBackupVersions: max })
  },
  setBackupRetentionDays: (days) => {
    saveSetting('backupRetentionDays', days)
    set({ backupRetentionDays: days })
  },

  // v0.5.1: Security & Privacy actions
  setDocumentEncryptionPanelOpen: (open) => set({ documentEncryptionPanelOpen: open }),
  setAccessControlPanelOpen: (open) => set({ accessControlPanelOpen: open }),
  setPrivacySettingsPanelOpen: (open) => set({ privacySettingsPanelOpen: open }),
  setAuditLogViewerOpen: (open) => set({ auditLogViewerOpen: open }),
  setPrivacyMode: (enabled) => {
    saveSetting('privacyMode', enabled)
    set({ privacyMode: enabled })
  },
  setDnsOverHttps: (enabled) => {
    saveSetting('dnsOverHttps', enabled)
    set({ dnsOverHttps: enabled })
  },
  setDataResidency: (residency) => {
    saveSetting('dataResidency', residency)
    set({ dataResidency: residency })
  },
  setGdprConsent: (consent) => {
    saveSetting('gdprConsent', consent)
    set({ gdprConsent: consent })
  },
  setAnalyticsEnabled: (enabled) => {
    saveSetting('analyticsEnabled', enabled)
    set({ analyticsEnabled: enabled })
  },

  // v0.5.2: Advanced Collaboration Integration actions
  setOperationalTransformEnabled: (enabled) => {
    saveSetting('operationalTransformEnabled', enabled)
    set({ operationalTransformEnabled: enabled })
  },
  setContributionAnalyticsPanelOpen: (open) => set({ contributionAnalyticsPanelOpen: open }),
  setActivityTimelineOpen: (open) => set({ activityTimelineOpen: open }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setReplayMode: (enabled) => set({ replayMode: enabled }),
  setReplayTimestamp: (timestamp) => set({ replayTimestamp: timestamp }),
  setSessionHistoryOpen: (open) => set({ sessionHistoryOpen: open }),
  setPresenceIndicatorsEnabled: (enabled) => {
    saveSetting('presenceIndicatorsEnabled', enabled)
    set({ presenceIndicatorsEnabled: enabled })
  },

  // v0.4.1: Search & Navigation actions
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),
  setGlobalSearchResults: (results) => set({ globalSearchResults: results }),
  addToSearchHistory: (query, resultCount) => {
    const history = get().globalSearchHistory
    const filtered = history.filter((h) => h.query.toLowerCase() !== query.toLowerCase())
    const updated = [{ query, timestamp: Date.now(), resultCount }, ...filtered].slice(0, 50)
    saveSetting('globalSearchHistory', updated)
    set({ globalSearchHistory: updated })
  },
  clearSearchHistory: () => {
    saveSetting('globalSearchHistory', [])
    set({ globalSearchHistory: [] })
  },
  addSavedSearch: (name, query) => {
    const saved = get().globalSearchSavedSearches
    const newSearch = { id: `search-${Date.now()}`, name, query, createdAt: Date.now() }
    const updated = [newSearch, ...saved]
    saveSetting('globalSearchSavedSearches', updated)
    set({ globalSearchSavedSearches: updated })
  },
  removeSavedSearch: (id) => {
    const saved = get().globalSearchSavedSearches.filter((s) => s.id !== id)
    saveSetting('globalSearchSavedSearches', saved)
    set({ globalSearchSavedSearches: saved })
  },
  setGlobalSearchFilters: (filters) => set({ globalSearchFilters: filters }),
  setGlobalSearchAllTabs: (all) => {
    saveSetting('globalSearchAllTabs', all)
    set({ globalSearchAllTabs: all })
  },
  setGoToLineDialogOpen: (open) => set({ goToLineDialogOpen: open }),
  setGoToLineNumber: (line) => set({ goToLineNumber: Math.max(1, line) }),
  setBreadcrumbItems: (items) => set({ breadcrumbItems: items }),
  setBreadcrumbOpen: (open) => set({ breadcrumbOpen: open }),
  addBookmark: (label, lineNumber, documentId) => {
    const bookmarks = get().currentBookmarks
    const newBookmark = { id: `bookmark-${Date.now()}`, label, lineNumber, documentId }
    const updated = [newBookmark, ...bookmarks]
    saveSetting('currentBookmarks', updated)
    set({ currentBookmarks: updated })
  },
  removeBookmark: (id) => {
    const bookmarks = get().currentBookmarks.filter((b) => b.id !== id)
    saveSetting('currentBookmarks', bookmarks)
    set({ currentBookmarks: bookmarks })
  },
  addRecentDocument: (id, title, path) => {
    const recent = get().recentDocumentsQuickAccess
    const filtered = recent.filter((r) => r.id !== id)
    const updated = [{ id, title, path, lastAccessed: Date.now() }, ...filtered].slice(0, 10)
    saveSetting('recentDocumentsQuickAccess', updated)
    set({ recentDocumentsQuickAccess: updated })
  },

  // v0.4.2: Spell Check & Grammar actions
  setSpellCheckPanelOpen: (open) => set({ spellCheckPanelOpen: open }),
  setGrammarPanelOpen: (open) => set({ grammarPanelOpen: open }),
  setWritingPanelOpen: (open) => set({ writingPanelOpen: open }),
  setSpellCheckEnabled: (enabled) => {
    saveSetting('spellCheckEnabled', enabled)
    set({ spellCheckEnabled: enabled })
  },
  setGrammarCheckEnabled: (enabled) => {
    saveSetting('grammarCheckEnabled', enabled)
    set({ grammarCheckEnabled: enabled })
  },
  setSpellCheckErrors: (errors) => set({ spellCheckErrors: errors }),
  setGrammarIssues: (issues) => set({ grammarIssues: issues }),
  setWritingSuggestions: (suggestions) => set({ writingSuggestions: suggestions }),
  setSelectedDictionary: (lang) => {
    saveSetting('selectedDictionary', lang)
    set({ selectedDictionary: lang })
  },
  setUseCustomDictionary: (use) => {
    saveSetting('useCustomDictionary', use)
    set({ useCustomDictionary: use })
  },
  addIgnoreWord: (word) => {
    const state = get()
    const updated = new Set(state.ignoreWords)
    updated.add(word.toLowerCase())
    saveSetting('ignoreWords', Array.from(updated))
    set({ ignoreWords: updated })
  },
  removeIgnoreWord: (word) => {
    const state = get()
    const updated = new Set(state.ignoreWords)
    updated.delete(word.toLowerCase())
    saveSetting('ignoreWords', Array.from(updated))
    set({ ignoreWords: updated })
  },
  clearIgnoreWords: () => {
    saveSetting('ignoreWords', [])
    set({ ignoreWords: new Set() })
  },
  setReadabilityScore: (score) => set({ readabilityScore: score }),
  setToneAnalysis: (analysis) => set({ toneAnalysis: analysis }),
  setSpellCheckAutoRun: (enabled) => {
    saveSetting('spellCheckAutoRun', enabled)
    set({ spellCheckAutoRun: enabled })
  },
  setSpellCheckStats: (stats) => set({ spellCheckStats: stats }),

  // v0.4.3: Keyboard & Shortcuts
  setKeyboardShortcutsOpen: (open) => set({ keyboardShortcutsOpen: open }),
  setShortcutCheatSheetOpen: (open) => set({ shortcutCheatSheetOpen: open }),
  setKeyboardShortcuts: (shortcuts) => {
    saveSetting('keyboardShortcuts', shortcuts)
    set({ keyboardShortcuts: shortcuts })
  },
  setCurrentShortcutPreset: (preset) => {
    saveSetting('currentShortcutPreset', preset)
    set({ currentShortcutPreset: preset })
  },

  // v0.4.4: Settings & Preferences
  setTabSize: (size) => {
    const clamped = Math.min(8, Math.max(1, size))
    saveSetting('tabSize', clamped)
    set({ tabSize: clamped })
  },
  setUseTabsForIndentation: (use) => {
    saveSetting('useTabsForIndentation', use)
    set({ useTabsForIndentation: use })
  },
  setWordWrap: (wrap) => {
    saveSetting('wordWrap', wrap)
    set({ wordWrap: wrap })
  },
  setAutoSaveOnFocusLoss: (enabled) => {
    saveSetting('autoSaveOnFocusLoss', enabled)
    set({ autoSaveOnFocusLoss: enabled })
  },
  setAutoFormatOnPaste: (enabled) => {
    saveSetting('autoFormatOnPaste', enabled)
    set({ autoFormatOnPaste: enabled })
  },
  setScrollPastEnd: (enabled) => {
    saveSetting('scrollPastEnd', enabled)
    set({ scrollPastEnd: enabled })
  },
  setRememberLastDocument: (enabled) => {
    saveSetting('rememberLastDocument', enabled)
    set({ rememberLastDocument: enabled })
  },
  setSessionRestoration: (enabled) => {
    saveSetting('sessionRestoration', enabled)
    set({ sessionRestoration: enabled })
  },
  setAutocorrectAggressiveLevel: (level) => {
    saveSetting('autocorrectAggressiveLevel', level)
    set({ autocorrectAggressiveLevel: level })
  },
  setPerformanceTuning: (mode) => {
    saveSetting('performanceTuning', mode)
    set({ performanceTuning: mode })
  },
  setCacheSize: (sizeMB) => {
    const clamped = Math.min(1000, Math.max(50, sizeMB)) // 50 MB to 1 GB
    saveSetting('cacheSize', clamped)
    set({ cacheSize: clamped })
  },
  setUpdateFrequency: (frequency) => {
    saveSetting('updateFrequency', frequency)
    set({ updateFrequency: frequency })
  },
  setEnableBackupExport: (enabled) => {
    saveSetting('enableBackupExport', enabled)
    set({ enableBackupExport: enabled })
  },

  // v0.5.3: AI Phase 3 Final Integration & Phase 4
  setEditorSelection: (selection) => set({ editorSelection: selection }),
  setUserPreference: (preference) => {
    saveSetting('userPreference', preference)
    set({ userPreference: preference })
  },
  setContextAwareWritingEnabled: (enabled) => {
    saveSetting('contextAwareWritingEnabled', enabled)
    set({ contextAwareWritingEnabled: enabled })
  },
  setAiPersonalizationEnabled: (enabled) => {
    saveSetting('aiPersonalizationEnabled', enabled)
    set({ aiPersonalizationEnabled: enabled })
  },
  setSuggestionHistoryEnabled: (enabled) => {
    saveSetting('suggestionHistoryEnabled', enabled)
    set({ suggestionHistoryEnabled: enabled })
  },

  // Load all settings from localStorage
  loadAllSettings: () => {
    const state = useAppStore.getState()
    const updates: Record<string, unknown> = {}

    // Appearance settings
    const theme = loadSetting('theme', 'catppuccin-mocha')
    const accentColor = loadSetting('accentColor', '')
    const uiFontSize = loadSetting('uiFontSize', 14)
    const editorFont = loadSetting('editorFont', 'Cascadia Code')
    updates.theme = theme
    updates.accentColor = accentColor
    updates.uiFontSize = uiFontSize
    updates.editorFont = editorFont

    // Editor settings
    const spellCheckLang = loadSetting('spellCheckLang', 'en-US')
    const defaultFontFamily = loadSetting('defaultFontFamily', '')
    const defaultFontSize = loadSetting('defaultFontSize', '16px')
    const showWordCount = loadSetting('showWordCount', true)
    const lineSpacing = loadSetting('lineSpacing', '1.15')
    const tabSize = loadSetting('tabSize', 2)
    const useTabsForIndentation = loadSetting('useTabsForIndentation', false)
    const wordWrap = loadSetting('wordWrap', true)
    updates.spellCheckLang = spellCheckLang
    updates.defaultFontFamily = defaultFontFamily
    updates.defaultFontSize = defaultFontSize
    updates.showWordCount = showWordCount
    updates.lineSpacing = lineSpacing
    updates.tabSize = tabSize
    updates.useTabsForIndentation = useTabsForIndentation
    updates.wordWrap = wordWrap

    // Agent settings
    const agentConfig = loadSetting('agentConfig', { endpoint: 'http://localhost:11434/v1/chat/completions', apiKey: '', model: 'hermes3' })
    const ollamaFormat = loadSetting('ollamaFormat', false)
    updates.ollamaFormat = ollamaFormat
    const agentPresets = loadSetting('agentPresets', [])
    const agentMaxToolTurns = loadSetting('agentMaxToolTurns', 5)
    const agentAutoApplyThreshold = loadSetting('agentAutoApplyThreshold', 0)
    const agentTemperature = loadSetting('agentTemperature', 0.7)
    updates.agentConfig = agentConfig
    updates.agentPresets = agentPresets
    updates.agentMaxToolTurns = agentMaxToolTurns
    updates.agentAutoApplyThreshold = agentAutoApplyThreshold
    updates.agentTemperature = agentTemperature

    // VCS settings
    const vcsDefaultBranch = loadSetting('vcsDefaultBranch', 'main')
    const vcsAutoCommitOnSave = loadSetting('vcsAutoCommitOnSave', false)
    const vcsMaxCommits = loadSetting('vcsMaxCommits', 0)
    updates.vcsDefaultBranch = vcsDefaultBranch
    updates.vcsAutoCommitOnSave = vcsAutoCommitOnSave
    updates.vcsMaxCommits = vcsMaxCommits

    // Collaboration settings
    const collabDisplayName = loadSetting('collabDisplayName', 'User')
    const collabCursorColor = loadSetting('collabCursorColor', '#89b4fa')
    const collabMcpPort = loadSetting('collabMcpPort', 0)
    updates.collabDisplayName = collabDisplayName
    updates.collabCursorColor = collabCursorColor
    updates.collabMcpPort = collabMcpPort

    // Behavior settings
    const autoSaveEnabled = loadSetting('autoSaveEnabled', true)
    const autoSaveIntervalMs = loadSetting('autoSaveIntervalMs', 60000)
    const autoSaveOnFocusLoss = loadSetting('autoSaveOnFocusLoss', true)
    const autoFormatOnPaste = loadSetting('autoFormatOnPaste', true)
    const scrollPastEnd = loadSetting('scrollPastEnd', false)
    const rememberLastDocument = loadSetting('rememberLastDocument', true)
    const sessionRestoration = loadSetting('sessionRestoration', true)
    updates.autoSaveEnabled = autoSaveEnabled
    updates.autoSaveIntervalMs = autoSaveIntervalMs
    updates.autoSaveOnFocusLoss = autoSaveOnFocusLoss
    updates.autoFormatOnPaste = autoFormatOnPaste
    updates.scrollPastEnd = scrollPastEnd
    updates.rememberLastDocument = rememberLastDocument
    updates.sessionRestoration = sessionRestoration

    // Autocorrect settings
    const autocorrectEnabled = loadSetting('autocorrectEnabled', true)
    const smartQuotesEnabled = loadSetting('smartQuotesEnabled', true)
    const emDashEnabled = loadSetting('emDashEnabled', true)
    const autocorrectAggressiveLevel = loadSetting('autocorrectAggressiveLevel', 'balanced')
    updates.autocorrectEnabled = autocorrectEnabled
    updates.smartQuotesEnabled = smartQuotesEnabled
    updates.emDashEnabled = emDashEnabled
    updates.autocorrectAggressiveLevel = autocorrectAggressiveLevel

    // Advanced settings
    const backupFrequency = loadSetting('backupFrequency', 60)
    const performanceTuning = loadSetting('performanceTuning', 'balanced')
    const cacheSize = loadSetting('cacheSize', 256)
    const updateFrequency = loadSetting('updateFrequency', 'weekly')
    const enableBackupExport = loadSetting('enableBackupExport', true)
    updates.backupFrequency = backupFrequency
    updates.performanceTuning = performanceTuning
    updates.cacheSize = cacheSize
    updates.updateFrequency = updateFrequency
    updates.enableBackupExport = enableBackupExport

    // Security & Privacy settings
    const privacyMode = loadSetting('privacyMode', false)
    const dnsOverHttps = loadSetting('dnsOverHttps', false)
    const dataResidency = loadSetting('dataResidency', 'auto')
    const gdprConsent = loadSetting('gdprConsent', false)
    const analyticsEnabled = loadSetting('analyticsEnabled', false)
    updates.privacyMode = privacyMode
    updates.dnsOverHttps = dnsOverHttps
    updates.dataResidency = dataResidency
    updates.gdprConsent = gdprConsent
    updates.analyticsEnabled = analyticsEnabled

    // Cloud Sync settings
    const autoSyncEnabled = loadSetting('autoSyncEnabled', false)
    const syncInterval = loadSetting('syncInterval', 300000)
    const selectiveSyncFolders = loadSetting('selectiveSyncFolders', [])
    const autoBackupEnabled = loadSetting('autoBackupEnabled', false)
    const maxBackupVersions = loadSetting('maxBackupVersions', 10)
    const backupRetentionDays = loadSetting('backupRetentionDays', 30)
    updates.autoSyncEnabled = autoSyncEnabled
    updates.syncInterval = syncInterval
    updates.selectiveSyncFolders = selectiveSyncFolders
    updates.autoBackupEnabled = autoBackupEnabled
    updates.maxBackupVersions = maxBackupVersions
    updates.backupRetentionDays = backupRetentionDays

    // Spell check settings
    const spellCheckEnabled = loadSetting('spellCheckEnabled', true)
    const grammarCheckEnabled = loadSetting('grammarCheckEnabled', true)
    const selectedDictionary = loadSetting('selectedDictionary', 'en-US')
    const useCustomDictionary = loadSetting('useCustomDictionary', false)
    updates.spellCheckEnabled = spellCheckEnabled
    updates.grammarCheckEnabled = grammarCheckEnabled
    updates.selectedDictionary = selectedDictionary
    updates.useCustomDictionary = useCustomDictionary

    useAppStore.setState(updates)
  },

  // Save all current settings to localStorage
  saveAllSettings: () => {
    const state = useAppStore.getState()

    // Helper to save to localStorage with 'aw-' prefix
    const saveLs = (key: string, value: unknown) => {
      localStorage.setItem(`aw-${key}`, JSON.stringify(value))
    }

    // Appearance
    saveLs('theme', state.theme)
    saveLs('accentColor', state.accentColor)
    saveLs('uiFontSize', state.uiFontSize)
    saveLs('editorFont', state.editorFont)

    // Editor
    saveLs('spellCheckLang', state.spellCheckLang)
    saveLs('defaultFontFamily', state.defaultFontFamily)
    saveLs('defaultFontSize', state.defaultFontSize)
    saveLs('showWordCount', state.showWordCount)
    saveLs('lineSpacing', state.lineSpacing)
    saveLs('tabSize', state.tabSize)
    saveLs('useTabsForIndentation', state.useTabsForIndentation)
    saveLs('wordWrap', state.wordWrap)

    // Agent
    saveLs('agentConfig', state.agentConfig)
    saveLs('ollamaFormat', state.ollamaFormat)
    saveLs('agentPresets', state.agentPresets)
    saveLs('agentMaxToolTurns', state.agentMaxToolTurns)
    saveLs('agentAutoApplyThreshold', state.agentAutoApplyThreshold)
    saveLs('agentTemperature', state.agentTemperature)

    // VCS
    saveLs('vcsDefaultBranch', state.vcsDefaultBranch)
    saveLs('vcsAutoCommitOnSave', state.vcsAutoCommitOnSave)
    saveLs('vcsMaxCommits', state.vcsMaxCommits)

    // Collaboration
    saveLs('collabDisplayName', state.collabDisplayName)
    saveLs('collabCursorColor', state.collabCursorColor)
    saveLs('collabMcpPort', state.collabMcpPort)

    // Behavior
    saveLs('autoSaveEnabled', state.autoSaveEnabled)
    saveLs('autoSaveIntervalMs', state.autoSaveIntervalMs)
    saveLs('autoSaveOnFocusLoss', state.autoSaveOnFocusLoss)
    saveLs('autoFormatOnPaste', state.autoFormatOnPaste)
    saveLs('scrollPastEnd', state.scrollPastEnd)
    saveLs('rememberLastDocument', state.rememberLastDocument)
    saveLs('sessionRestoration', state.sessionRestoration)

    // Autocorrect
    saveLs('autocorrectEnabled', state.autocorrectEnabled)
    saveLs('smartQuotesEnabled', state.smartQuotesEnabled)
    saveLs('emDashEnabled', state.emDashEnabled)
    saveLs('autocorrectAggressiveLevel', state.autocorrectAggressiveLevel)

    // Advanced
    saveLs('backupFrequency', state.backupFrequency)
    saveLs('performanceTuning', state.performanceTuning)
    saveLs('cacheSize', state.cacheSize)
    saveLs('updateFrequency', state.updateFrequency)
    saveLs('enableBackupExport', state.enableBackupExport)

    // Security & Privacy
    saveLs('privacyMode', state.privacyMode)
    saveLs('dnsOverHttps', state.dnsOverHttps)
    saveLs('dataResidency', state.dataResidency)
    saveLs('gdprConsent', state.gdprConsent)
    saveLs('analyticsEnabled', state.analyticsEnabled)

    // Cloud Sync
    saveLs('autoSyncEnabled', state.autoSyncEnabled)
    saveLs('syncInterval', state.syncInterval)
    saveLs('selectiveSyncFolders', state.selectiveSyncFolders)
    saveLs('autoBackupEnabled', state.autoBackupEnabled)
    saveLs('maxBackupVersions', state.maxBackupVersions)
    saveLs('backupRetentionDays', state.backupRetentionDays)

    // Spell check
    saveLs('spellCheckEnabled', state.spellCheckEnabled)
    saveLs('grammarCheckEnabled', state.grammarCheckEnabled)
    saveLs('selectedDictionary', state.selectedDictionary)
    saveLs('useCustomDictionary', state.useCustomDictionary)
  }
}))

// Export alias for convenience in components
export const useStore = useAppStore
