/**
 * Type definitions for IPC return values and renderer-specific concerns.
 * Re-exports common types from shared/types.ts to avoid duplication.
 * IPC-specific and implementation-specific types are defined here.
 */

// ─── Re-exports from shared types (single source of truth) ───
export type {
  VcsCommit,
  VcsBranch,
  VcsBranchInfo,
  VcsTag,
  VcsMergeConflict,
  VcsGraphNode,
  VcsDiffLine,
  VcsStashEntry,
  VcsHooks,
  VcsBlameLine,
  AgentToolDefinition,
  AgentToolParameter,
  AgentConfig,
  AgentPreset,
  AgentSession,
  AgentProfile,
  PluginPermission,
  PluginHookName,
  PluginCommand,
  PluginToolbarButton,
  PluginInstance,
  PluginHookEvent,
  ChatMessage,
  CollabCursor,
  CollabUser,
  ToastMessage,
  CommentThread,
  TrackedChange,
  DocStats,
  OutlineHeading,
  SmartSuggestion,
  PageHeaderFooter,
  PendingChange,
  DocTab,
  VcsMergeResult,
  PluginManifest,
  FileSaveAsEvent,
  FileOpenedEvent,
  ExportMarkdownEvent,
  ExportEpubEvent,
  UpdateAvailableEvent,
  PluginEditorInsertEvent,
  PluginEditorReplaceSelectionEvent,
  PluginRegisterCommandEvent,
  PluginAddToolbarButtonEvent,
  PluginNotificationEvent,
  IpcEventData,
  ToolExecutionResult,
  AgentPermissions,
  AgentRole,
  TaskStatus,
  AgentTask,
  TaskGraphNode,
  AgentMemoryEntry,
  AgentMemoryResult
} from '../shared/types'

// ─── VCS Types: IPC-specific results ───

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
    lane: number
  }>
  edges: Array<{ from: string; to: string }>
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

// ─── Agent Types: IPC-specific results ───

export interface AgentMultiRunResult {
  agentName: string
  content: string
}


// ─── Plugin Types: Marketplace entry ───

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
