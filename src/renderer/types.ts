/**
 * Strong types for IPC return values from the main process.
 * These replace `any` / `unknown` casts used when handling IPC results.
 */

// ─── VCS Types ───

export interface VcsCommitResult {
  id: string
  message: string
  timestamp: number
  parents: string[]
  branch: string
  tags: string[]
  author?: string
}

export interface VcsGraphLanesResult {
  nodes: Array<{
    id: string
    message: string
    timestamp: number
    branch: string
    parents: string[]
    tags: string[]
    isMerge: boolean
    branches: string[]
  }>
  edges: Array<{ from: string; to: string }>
}

export interface VcsStashEntry {
  id: string
  content: string
  branch: string
  message: string
  timestamp: number
}

export interface VcsBlameLine {
  line: number
  text: string
  commitId: string
  author: string
  date: string
  message: string
}

export interface VcsHooks {
  preCommitLint: boolean
  commitMessageTemplate: string
  protectedBranches: string[]
  requireCommitMessage: boolean
}

export interface VcsMergeResult {
  success: boolean
  conflicts?: Array<{
    path: string
    ours: string
    theirs: string
    base: string
    resolved?: string
  }>
}

export interface VcsValidateCommitResult {
  valid: boolean
  errors: string[]
}

export interface VcsImportPatchResult {
  success: boolean
  content?: string
  message?: string
}

// ─── Agent Types ───

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
  role: string
  systemPrompt: string
  color: string
}

export interface AgentMultiRunResult {
  agentName: string
  content: string
}

// ─── Plugin Types ───

export interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  permissions: string[]
  hooks: string[]
  enabled: boolean
  installed: boolean
  lastError?: string
}

export interface PluginMarketplaceEntry {
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  installed: boolean
}

// ─── Collab Types ───

export interface CollabStartResult {
  success: boolean
  status?: string
  port?: number
  error?: string
}

export interface CollabStatusResult {
  running: boolean
  port?: number
  rooms?: Array<{ code: string; users: number }>
}

export interface CollabGenerateCodeResult {
  code: string | null
  error?: string
}

// ─── File Types ───

export interface FileExportResult {
  success: boolean
  error?: string
  warning?: string
}

// ─── Awareness State (Y.js) ───

export interface AwarenessState {
  user?: {
    name: string
    color: string
  }
}

// ─── Presence user from server ───

export interface PresenceUser {
  name: string
  color: string
}

// ─── ProseMirror Editor View (minimal for cursor access) ───

export interface EditorViewLike {
  state: {
    selection: {
      from: number
      to: number
    }
    doc: {
      content: { size: number }
    }
  }
}

export interface TipTapElement extends HTMLElement {
  editorView: EditorViewLike
}
