// ─── Agentic Word Renderer Type Declarations ───
// Renderer-only types, including the window.wordapp IPC bridge declaration.

import type {
  VcsCommit,
  VcsBranchInfo,
  VcsTag,
  VcsMergeConflict,
  VcsGraphNode,
  VcsDiffLine,
  VcsStashEntry,
  VcsHooks,
  VcsBlameLine,
  AgentConfig,
  AgentPreset,
  AgentSession,
  AgentProfile,
  PluginManifest,
  PluginCommand,
  PluginToolbarButton,
  DocStats
} from '../shared/types'

declare global {
  interface Window {
    wordapp: {
      vcs: {
        commit: (message: string, content: string) => Promise<VcsCommit>
        log: () => Promise<VcsCommit[]>
        diff: (fromId?: string, toId?: string) => Promise<{
          from: string
          to: string
          fromContent: string
          toContent: string
          changes: VcsDiffLine[]
        }>
        createBranch: (name: string) => Promise<{ name: string; head: string }>
        switchBranch: (name: string) => Promise<boolean>
        listBranches: () => Promise<VcsBranchInfo[]>
        revert: (commitId: string) => Promise<string | null>
        currentBranch: () => Promise<string>
        merge: (sourceBranch: string, content: string, message?: string) => Promise<{
          success: boolean
          commit?: VcsCommit
          conflicts?: VcsMergeConflict[]
        }>
        cherryPick: (commitId: string) => Promise<{
          success: boolean
          commit?: VcsCommit
          conflicts?: VcsMergeConflict[]
        }>
        tagCreate: (name: string, commitId?: string) => Promise<VcsTag | null>
        tagDelete: (name: string) => Promise<boolean>
        tagList: () => Promise<VcsTag[]>
        graph: () => Promise<VcsGraphNode[]>
        // v0.3.5
        graphLanes: () => Promise<{ nodes: VcsGraphNode[]; edges: Array<{ from: string; to: string }> }>
        stashPush: (message?: string) => Promise<VcsStashEntry | null>
        stashPop: () => Promise<VcsStashEntry | null>
        stashApply: (id: string) => Promise<VcsStashEntry | null>
        stashDrop: (id: string) => Promise<boolean>
        stashList: () => Promise<VcsStashEntry[]>
        rebaseSquash: (commitIds: string[], message?: string) => Promise<VcsCommit | null>
        rebaseReorder: (commitIds: string[]) => Promise<boolean>
        rebaseEdit: (commitId: string, newMessage: string) => Promise<boolean>
        blame: (content: string) => Promise<VcsBlameLine[]>
        exportPatch: (fromId?: string, toId?: string) => Promise<string>
        exportPatchFile: (filePath: string, fromId?: string, toId?: string) => Promise<{ success: boolean }>
        importPatch: (patchContent: string) => Promise<{ success: boolean; content?: string; message?: string }>
        getHooks: () => Promise<VcsHooks>
        setHooks: (hooks: Record<string, unknown>) => Promise<VcsHooks>
        validateCommit: (message: string) => Promise<{ valid: boolean; errors: string[] }>
      }
      agent: {
        chat: (messages: Array<{ role: string; content: string }>) => Promise<unknown>
        executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
        listTools: () => Promise<Array<{ name: string; description: string }>>
        configure: (config: { endpoint?: string; apiKey?: string; model?: string }) => Promise<AgentConfig>
        configureAdvanced: (opts: { maxToolTurns?: number; temperature?: number }) => Promise<{ success: boolean }>
        getAdvanced: () => Promise<{ maxToolTurns: number; temperature: number }>
        suggest: (docContent: string) => Promise<Array<{ type: string; message: string; context: string }>>
        chatStream: (messages: Array<{ role: string; content: string }>, context: Record<string, unknown>) => Promise<void>
        abort: () => Promise<void>
        listPresets: () => Promise<AgentPreset[]>
        addPreset: (preset: Omit<AgentPreset, 'id'>) => Promise<AgentPreset>
        applyPreset: (id: string) => Promise<AgentConfig | null>
        deletePreset: (id: string) => Promise<boolean>
        getPresets: () => Promise<AgentPreset[]>
        getScratchpad: () => Promise<string>
        setScratchpad: (content: string) => Promise<{ success: boolean }>
        // v0.3.4: Session persistence
        sessionGetOrCreate: (documentId: string, agentName: string, systemPrompt?: string) => Promise<AgentSession>
        sessionAddMessage: (sessionId: string, role: string, content: string) => Promise<{ success: boolean }>
        sessionMessages: (sessionId: string) => Promise<Array<{ role: string; content: string }>>
        sessionClear: (sessionId: string) => Promise<{ success: boolean }>
        sessionDelete: (sessionId: string) => Promise<{ success: boolean }>
        sessionList: (documentId?: string) => Promise<AgentSession[]>
        // v0.3.4: Multi-agent
        profiles: () => Promise<AgentProfile[]>
        profileAdd: (profile: Omit<AgentProfile, 'id'>) => Promise<AgentProfile>
        profileDelete: (id: string) => Promise<boolean>
        multiRun: (documentId: string, userMessage: string, agentNames: string[], context?: { documentContent?: string; currentBranch?: string; selection?: string }) => Promise<Array<{ agentName: string; content: string; toolCalls: unknown[] }>>
        // v0.3.4: Inline suggestions
        inlineSuggest: (documentContent: string, cursorPosition: number, contextBefore: string) => Promise<string | null>
        // v0.3.4: Dedicated tools
        summarize: (documentContent: string, style: string, maxLength: number) => Promise<string>
        plugin: {
          list: () => Promise<Array<PluginManifest & { lastError?: string }>>
          get: (name: string) => Promise<PluginManifest | null>
          install: (manifest: PluginManifest, code: string) => Promise<PluginManifest | null>
          uninstall: (name: string) => Promise<boolean>
          enable: (name: string) => Promise<boolean>
          disable: (name: string) => Promise<boolean>
          marketplace: () => Promise<PluginManifest[]>
          builtinCode: (name: string) => Promise<string | null>
        }
      }
      file: {
        openDialog: () => Promise<string | null>
        saveDialog: () => Promise<string | null>
        saveAsDialog: (filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
        importDocx: (filePath: string) => Promise<{ content: string; filePath: string }>
        saveFile: (filePath: string, content: string) => Promise<{ success: boolean }>
        exportPdf: (filePath: string) => Promise<{ success: boolean; error?: string }>
        exportMarkdown: (filePath: string, content: string) => Promise<{ success: boolean }>
        exportEpub: (filePath: string, content: string) => Promise<{ success: boolean; error?: string; warning?: string }>
        openImageDialog: () => Promise<string | null>
      }
      template: {
        customSave: (name: string, content: string) => Promise<{ success: boolean }>
        customList: () => Promise<Array<{ name: string; description: string }>>
        get: (name: string) => Promise<string | null>
        delete: (name: string) => Promise<boolean>
      }
      recent: {
        list: () => Promise<string[]>
        clear: () => Promise<void>
      }
      update: {
        check: () => Promise<{ available: boolean; version?: string; url?: string }>
      }
      markdown: {
        toHtml: (md: string) => Promise<string>
      }
      settings: {
        setSpellCheckLang: (lang: string) => Promise<{ success: boolean }>
        vcsAutoCommit: (message: string, content: string) => Promise<VcsCommit>
        vcsPruneCommits: (max: number) => Promise<{ pruned: number }>
      }
      docStats: {
        compute: (htmlContent: string) => Promise<DocStats>
      }
      collab: {
        start: (port: number) => Promise<{ success: boolean; status?: string; port?: number; error?: string }>
        stop: () => Promise<{ status: string }>
        status: () => Promise<{ running: boolean; port?: number; rooms?: Array<{ code: string; users: number }> }>
        generateCode: () => Promise<{ code: string | null; error?: string }>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => void
    }
  }
}
