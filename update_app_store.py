import re

with open(r'G:\Droid\WordApp\src\renderer\store\app-store.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_interfaces = """interface ChatMessage {
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
}"""

new_import = """import type {
  ChatMessage,
  AgentPreset,
  DocTab,
  ToastMessage,
  CollabCursor,
  CollabUser,
  VcsCommit,
  VcsBranchInfo as Branch,
  VcsTag,
  VcsGraphNode as GraphNode,
  VcsMergeConflict as MergeConflict,
  OutlineHeading,
  DocStats,
  SmartSuggestion,
  CommentThread,
  TrackedChange,
  PageHeaderFooter,
  PendingChange,
  VcsStashEntry,
  VcsBlameLine,
  VcsHooks,
  VcsDiffLine,
  AgentSession,
  AgentProfile,
  PluginManifest
} from '../../shared/types'

export type { PendingChange }"""

if old_interfaces in content:
    content = content.replace(old_interfaces, new_import)
    print("Interface replacement done")
else:
    print("ERROR: Old interfaces block not found")
    exit(1)

# Now replace inline type literals in the AppState interface with imported type names
# 1. diffData changes type
content = content.replace(
    "changes: Array<{ type: string; line: number; content: string }> } | null",
    "changes: VcsDiffLine[] } | null"
)

# 2. agentSessions
content = content.replace(
    "agentSessions: Array<{ id: string; documentId: string; agentName: string; systemPrompt: string; messages: Array<{ role: string; content: string }>; createdAt: number; updatedAt: number }>",
    "agentSessions: AgentSession[]"
)

# 3. agentProfiles
content = content.replace(
    "agentProfiles: Array<{ id: string; name: string; role: string; systemPrompt: string; color: string }>",
    "agentProfiles: AgentProfile[]"
)

# 4. vcsStashList
content = content.replace(
    "vcsStashList: Array<{ id: string; content: string; branch: string; message: string; timestamp: number }>",
    "vcsStashList: VcsStashEntry[]"
)

# 5. vcsBlameData
content = content.replace(
    "vcsBlameData: Array<{ line: number; text: string; commitId: string; author: string; date: string; message: string }>",
    "vcsBlameData: VcsBlameLine[]"
)

# 6. vcsHooks inline type -> VcsHooks
content = content.replace(
    """vcsHooks: {
    preCommitLint: boolean
    commitMessageTemplate: string
    protectedBranches: string[]
    requireCommitMessage: boolean
  }""",
    "vcsHooks: VcsHooks"
)

# 7. vcsGraphEdges
content = content.replace(
    "vcsGraphEdges: Array<{ from: string; to: string }>",
    "vcsGraphEdges: Array<{ from: string; to: string }>"
)

# 8. pluginList - use PluginManifest & { lastError?: string }
content = content.replace(
    "pluginList: Array<{ name: string; version: string; description: string; author: string; enabled: boolean; installed: boolean; permissions: string[]; hooks: string[]; lastError?: string }>",
    "pluginList: Array<PluginManifest & { lastError?: string }>"
)

# 9. pluginMarketplace - use Pick<PluginManifest, ...>
content = content.replace(
    "pluginMarketplace: Array<{ name: string; version: string; description: string; author: string; enabled: boolean; installed: boolean }>",
    "pluginMarketplace: Array<Pick<PluginManifest, 'name' | 'version' | 'description' | 'author' | 'enabled' | 'installed'>>"
)

# 10. pluginToolbarButtons and pluginCommands extend shared types with pluginName
content = content.replace(
    "pluginToolbarButtons: Array<{ id: string; label: string; tooltip: string; pluginName: string }>",
    "pluginToolbarButtons: Array<{ id: string; label: string; tooltip: string; pluginName: string }>"
)
content = content.replace(
    "pluginCommands: Array<{ id: string; label: string; shortcut?: string; pluginName: string }>",
    "pluginCommands: Array<{ id: string; label: string; shortcut?: string; pluginName: string }>"
)

# 11. multiAgentResults
content = content.replace(
    "multiAgentResults: Array<{ agentName: string; content: string }>",
    "multiAgentResults: Array<{ agentName: string; content: string }>"
)

# 12. diffData - update to use VcsDiffLine
# Already handled above in item 1

with open(r'G:\Droid\WordApp\src\renderer\store\app-store.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("All replacements done successfully")
