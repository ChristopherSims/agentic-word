// ─── Lexicon Shared Type Definitions ───
// Consolidated types used by both main and renderer processes.

// ─── VCS Types ───

export interface VcsCommit {
  id: string
  message: string
  content: string
  timestamp: number
  parents: string[]
  branch: string
  tags: string[]
  author?: string
}

export interface VcsBranch {
  name: string
  head: string
  protected?: boolean
}

export interface VcsBranchInfo {
  name: string
  head: string
  current: boolean
}

export interface VcsTag {
  name: string
  commitId: string
  timestamp: number
}

export interface VcsMergeResult {
  success: boolean
  commit?: VcsCommit
  conflicts?: VcsMergeConflict[]
}

export interface VcsMergeConflict {
  path: string
  ours: string
  theirs: string
  base: string
  resolved?: string
}

// v0.4.8: Advanced Merge & Conflict Resolution
export type MergeStrategy = 'recursive' | 'resolve' | 'ours' | 'theirs' | 'octopus'

export interface VcsMergeOptions {
  strategy?: MergeStrategy
  allowUnrelatedHistories?: boolean
  squash?: boolean
  noFf?: boolean // no fast-forward
  verifySignature?: boolean
}

export interface VcsBranchProtection {
  branch: string
  requireCodeReview?: boolean
  requiredReviewCount?: number
  dismissStaleReviews?: boolean
  requireStatusChecks?: boolean
  requiredStatusChecks?: string[]
  dismissalRestrictions?: string[]
  allowForcePush?: boolean
  allowDeletion?: boolean
}

export interface VcsMergeRequest {
  id: string
  sourceBranch: string
  targetBranch: string
  title: string
  description: string
  createdAt: number
  updatedAt: number
  creator: string
  status: 'open' | 'approved' | 'rejected' | 'merged' | 'closed'
  reviews: VcsReview[]
  requiredApprovals: number
  currentApprovals: number
  checks: VcsStatusCheck[]
}

export interface VcsReview {
  id: string
  reviewer: string
  status: 'pending' | 'approved' | 'requested-changes' | 'commented'
  comment?: string
  submittedAt: number
}

export interface VcsStatusCheck {
  name: string
  status: 'pending' | 'success' | 'failure' | 'skipped'
  description?: string
  url?: string
  timestamp?: number
}

export interface VcsGraphNode {
  id: string
  message: string
  timestamp: number
  branch: string
  parents: string[]
  tags: string[]
  isMerge: boolean
  branches: string[]
  lane: number
}

export interface VcsDiffLine {
  type: 'add' | 'remove' | 'same'
  line: number
  content: string
}

export interface VcsStashEntry {
  id: string
  content: string
  branch: string
  message: string
  timestamp: number
}

export interface VcsHooks {
  preCommitLint: boolean
  commitMessageTemplate: string
  protectedBranches: string[]
  requireCommitMessage: boolean
}

export interface VcsBlameLine {
  line: number
  text: string
  commitId: string
  author: string
  date: string
  message: string
}

// ─── Agent Types ───

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export interface AgentToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  enum?: string[] | number[]
}

export interface AgentConfig {
  endpoint: string
  apiKey: string
  model: string
}

export interface AgentPreset {
  id: string
  name: string
  endpoint: string
  apiKey: string
  model: string
}

export interface AgentSession {
  id: string
  documentId: string
  agentName: string
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  createdAt: number
  updatedAt: number
}

export interface AgentProfile {
  id: string
  name: string
  role: 'writer' | 'reviewer' | 'custom'
  systemPrompt: string
  color: string
}

// ─── Plugin Types ───

export interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  entry: string
  permissions: PluginPermission[]
  hooks: PluginHookName[]
  commands?: PluginCommand[]
  toolbarButtons?: PluginToolbarButton[]
  enabled: boolean
  installed: boolean
}

export type PluginPermission =
  | 'document:read'
  | 'document:write'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'ui:toolbar'
  | 'ui:commands'
  | 'vcs:read'
  | 'agent:read'

export type PluginHookName =
  | 'onDocumentOpen'
  | 'onDocumentSave'
  | 'onContentChange'
  | 'onToolbarRender'
  | 'onCommandRegister'

export interface PluginCommand {
  id: string
  label: string
  shortcut?: string
}

export interface PluginToolbarButton {
  id: string
  label: string
  icon?: string
  tooltip: string
}

export interface PluginInstance {
  manifest: PluginManifest
  dir: string
  lastError?: string
}

export interface PluginHookEvent {
  onDocumentOpen: { filePath: string; content: string }
  onDocumentSave: { filePath: string; content: string }
  onContentChange: { content: string; selection: string }
  onToolbarRender: { buttons: PluginToolbarButton[] }
  onCommandRegister: { commands: PluginCommand[] }
}

// ─── Chat Types ───

// Tool execution result type — can be success object, error object, or string
export type ToolExecutionResult = 
  | string 
  | number 
  | boolean 
  | { [key: string]: unknown }
  | { error: string }
  | null

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  toolCalls?: Array<{ toolName: string; result: ToolExecutionResult }>
  streaming?: boolean
}

// ─── Collab Types ───

export interface CollabCursor {
  id: string
  name: string
  color: string
  position: number
  lastSeen: number
  selection?: { from: number; to: number }
  userId: string // v0.4.5: Track user ID
}

export interface CollabUser {
  id: string // v0.4.5: Add unique user ID
  name: string
  color: string
  online: boolean
  lastSeen?: number // v0.4.5: Track last activity
  sessionId?: string // v0.4.5: Track session
}

// ─── UI Types ───

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  timestamp: number
}

export interface CommentThread {
  id: string
  documentId: string
  selectionFrom: number
  selectionTo: number
  selectionText: string
  resolved: boolean
  createdBy: string // v0.4.5: Track creator
  createdAt: number // v0.4.5: Track creation time
  replies: Array<{ 
    id: string
    author: string
    authorId: string // v0.4.5: Track author ID
    content: string
    timestamp: number
    mentions?: string[] // v0.4.5: Track @mentions
  }>
  permissions?: {
    view: string[] // userIds who can view
    edit: string[] // userIds who can edit
  } // v0.4.5: Comment permissions
}

// v0.4.5: Collaboration Activity Log
export interface CollaborationEvent {
  id: string
  type: 'edit' | 'comment' | 'mention' | 'resolve' | 'merge' | 'conflict'
  userId: string
  userName: string
  timestamp: number
  content: {
    description: string
    data?: Record<string, unknown>
  }
  documentId: string
}

// v0.4.5: Document Snapshot for History
export interface DocumentSnapshot {
  id: string
  documentId: string
  content: string
  timestamp: number
  author: string
  authorId: string
  description: string
  parentSnapshotId?: string // For version tree
}

// v0.4.5: Conflict Resolution
export interface ConflictResolution {
  id: string
  type: 'edit-edit' | 'edit-delete'
  position: number
  userA: { id: string; name: string; version: string }
  userB: { id: string; name: string; version: string }
  resolved: boolean
  resolution?: 'theirs' | 'ours' | 'custom'
  customResolution?: string
}

// v0.4.5: Undo/Redo with Attribution
export interface AttributedEdit {
  id: string
  userId: string
  userName: string
  timestamp: number
  type: 'insert' | 'delete' | 'replace'
  position: number
  content: string
  oldContent?: string
}

export interface TrackedChange {
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

export interface DocStats {
  fleschKincaid: number
  avgSentenceLen: number
  paragraphCount: number
  readingTimeMin: number
  sentenceCount: number
  syllableCount: number
}

export interface OutlineHeading {
  id: string
  level: number
  text: string
  position: number
}

export interface SmartSuggestion {
  id: string
  type: 'grammar' | 'style' | 'structure'
  message: string
  context: string
  timestamp: number
}

export interface PageHeaderFooter {
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

export interface DocTab {
  id: string
  title: string
  filePath: string | null
  content: string
  isDirty: boolean
  /** 'document' (default) | 'storyboard' — companion markdown file */
  type?: 'document' | 'storyboard'
  /** For storyboard tabs: the document filePath this storyboard belongs to */
  parentFilePath?: string
}

// ─── IPC Event Message Types ───

/** File save-as event from main process to renderer */
export interface FileSaveAsEvent {
  filePath: string
}

/** File opened event from main process to renderer */
export interface FileOpenedEvent {
  filePath: string
  content: string
}

/** Export markdown event from main process to renderer */
export interface ExportMarkdownEvent {
  filePath: string
}

/** EPUB export event from main process to renderer */
export interface ExportEpubEvent {
  filePath: string
}

/** Update available event from main process to renderer */
export interface UpdateAvailableEvent {
  version: string
  url: string
  notes?: string
}

/** Plugin editor-insert event from main process to renderer */
export interface PluginEditorInsertEvent {
  pluginName: string
  content: string
}

/** Plugin editor-replace-selection event from main process to renderer */
export interface PluginEditorReplaceSelectionEvent {
  pluginName: string
  content: string
}

/** Plugin register-command event from main process to renderer */
export interface PluginRegisterCommandEvent {
  pluginName: string
  command: PluginCommand
}

/** Plugin add-toolbar-button event from main process to renderer */
export interface PluginAddToolbarButtonEvent {
  pluginName: string
  button: PluginToolbarButton
}

/** Plugin notification event from main process to renderer */
export interface PluginNotificationEvent {
  pluginName: string
  message: string
  type: string
}

/** All IPC event data types */
export type IpcEventData = 
  | FileSaveAsEvent
  | FileOpenedEvent
  | ExportMarkdownEvent
  | ExportEpubEvent
  | UpdateAvailableEvent
  | PluginEditorInsertEvent
  | PluginEditorReplaceSelectionEvent
  | PluginRegisterCommandEvent
  | PluginAddToolbarButtonEvent
  | PluginNotificationEvent
