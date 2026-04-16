// ─── Agentic Word Shared Type Definitions ───
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

export interface VcsGraphNode {
  id: string
  message: string
  timestamp: number
  branch: string
  parents: string[]
  tags: string[]
  isMerge: boolean
  branches: string[]
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
  parameters: Record<string, AgentToolParameter>
}

export interface AgentToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  enum?: string[]
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  toolCalls?: Array<{ toolName: string; result: unknown }>
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
}

export interface CollabUser {
  name: string
  color: string
  online: boolean
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
  replies: Array<{ id: string; author: string; content: string; timestamp: number }>
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
}
