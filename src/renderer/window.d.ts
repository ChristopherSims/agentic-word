/**
 * Global Window interface for Electron IPC APIs.
 * Provides access to window.wordapp and all exposed APIs from the main process.
 */

import type {
  VcsGraphLanesResult,
  VcsValidateCommitResult,
  VcsImportPatchResult,
  AgentMultiRunResult,
  PluginMarketplaceEntry,
  VcsMergeResult,
  VcsStashEntry,
  VcsBlameLine,
  VcsHooks,
  AgentSession,
  AgentProfile,
  PluginManifest,
  ChatMessage,
  CollabStartResult,
  CollabStatusResult,
  CollabGenerateCodeResult,
  FileExportResult,
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
  AgentPermissions,
  AgentTask
} from './types'

declare global {
  interface Window {
    wordapp: {
      window: {
        minimize: () => Promise<{ success: boolean }>
        maximize: () => Promise<{ maximized: boolean }>
        close: () => Promise<{ success: boolean }>
      }
      ai: {
        generateOutline: (topic: string, depth?: number) => Promise<unknown>
        generateTitles: (topic: string, count?: number) => Promise<unknown>
        generateIntroduction: (topic: string, style?: 'brief' | 'medium' | 'detailed') => Promise<string>
        generateConclusion: (docType: string, mainPoints: string[], style?: 'brief' | 'medium' | 'detailed') => Promise<string>
        adjustTone: (text: string, targetTone: 'formal' | 'casual' | 'professional') => Promise<string>
        paraphrase: (text: string, count?: number) => Promise<string[]>
        adjustComplexity: (text: string, level: 'simple' | 'moderate' | 'advanced') => Promise<string>
        translate: (text: string, targetLanguage: string) => Promise<string>
      }
      vcs: {
        commit: (message: string, content: string) => Promise<{ id: string; message: string; timestamp: number }>
        log: () => Promise<Array<{ id: string; message: string; timestamp: number; parents: string[]; branch: string }>>
        diff: (fromId?: string, toId?: string) => Promise<{ from: string; to: string; changes: Array<{ type: string; line: number; content: string }> }>
        createBranch: (name: string) => Promise<{ name: string; head: string }>
        switchBranch: (name: string) => Promise<boolean>
        listBranches: () => Promise<Array<{ name: string; head: string; current: boolean }>>
        revert: (commitId: string) => Promise<string | null>
        currentBranch: () => Promise<string>
        merge: (sourceBranch: string, content: string, message?: string) => Promise<VcsMergeResult>
        cherryPick: (commitId: string) => Promise<string | null>
        createTag: (name: string, commitId?: string) => Promise<{ name: string; commitId: string }>
        deleteTag: (name: string) => Promise<boolean>
        listTags: () => Promise<Array<{ name: string; commitId: string; timestamp: number }>>
        graphLanes: () => Promise<VcsGraphLanesResult>
        stashPush: (message?: string) => Promise<VcsStashEntry>
        stashPop: () => Promise<VcsStashEntry | null>
        stashApply: (id: string) => Promise<VcsStashEntry | null>
        stashDrop: (id: string) => Promise<boolean>
        stashList: () => Promise<VcsStashEntry[]>
        rebaseSquash: (commitIds: string[], message?: string) => Promise<{ success: boolean }>
        rebaseReorder: (commitIds: string[]) => Promise<boolean>
        rebaseEdit: (commitId: string, newMessage: string) => Promise<boolean>
        blame: (content: string) => Promise<VcsBlameLine[]>
        exportPatch: (fromId?: string, toId?: string) => Promise<string>
        exportPatchFile: (filePath: string, fromId?: string, toId?: string) => Promise<{ success: boolean }>
        importPatch: (patchContent: string) => Promise<VcsImportPatchResult>
        getHooks: () => Promise<VcsHooks>
        setHooks: (hooks: VcsHooks) => Promise<VcsHooks>
        validateCommit: (message: string) => Promise<VcsValidateCommitResult>
      }
      agent: {
        executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
        listTools: () => Promise<Array<{ name: string; description: string }>>
        configure: (config: { endpoint?: string; apiKey?: string; model?: string }) => Promise<{ endpoint: string; apiKey: string; model: string }>
        configureAdvanced: (opts: { maxToolTurns?: number; temperature?: number; ollamaFormat?: boolean }) => Promise<{ success: boolean }>
        getAdvanced: () => Promise<{ maxToolTurns: number; temperature: number }>
        suggest: (docContent: string) => Promise<Array<{ type: string; message: string; context: string }>>
        chatStream: (messages: Array<{ role: string; content: string }>, context: Record<string, unknown>) => Promise<void>
        abort: () => Promise<void>
        getPresets: () => Promise<Array<{ id: string; name: string; endpoint: string; apiKey: string; model: string }>>
        addPreset: (preset: { name: string; endpoint: string; apiKey: string; model: string }) => Promise<{ id: string; name: string; endpoint: string; apiKey: string; model: string }>
        applyPreset: (id: string) => Promise<{ endpoint: string; apiKey: string; model: string } | null>
        deletePreset: (id: string) => Promise<boolean>
        getPresets: () => Promise<Array<{ id: string; name: string; endpoint: string; apiKey: string; model: string }>>
        getScratchpad: () => Promise<string>
        setScratchpad: (content: string) => Promise<{ success: boolean }>
        sessionGetOrCreate: (documentId: string, agentName: string, systemPrompt?: string) => Promise<AgentSession>
        sessionAddMessage: (sessionId: string, role: string, content: string) => Promise<{ success: boolean }>
        sessionMessages: (sessionId: string) => Promise<Array<{ role: string; content: string }>>
        sessionClear: (sessionId: string) => Promise<{ success: boolean }>
        sessionDelete: (sessionId: string) => Promise<{ success: boolean }>
        sessionList: (documentId?: string) => Promise<AgentSession[]>
        profiles: () => Promise<AgentProfile[]>
        profileAdd: (profile: { name: string; role: string; systemPrompt: string; color: string }) => Promise<AgentProfile>
        profileDelete: (id: string) => Promise<boolean>
        multiRun: (documentId: string, userMessage: string, agentNames: string[], context?: { documentContent?: string; currentBranch?: string; selection?: string }) => Promise<AgentMultiRunResult[]>
        orchestrate: (documentId: string, userMessage: string, context?: { documentContent?: string; currentBranch?: string; selection?: string; currentFilePath?: string }) => Promise<AgentTask[]>
        cancelTaskGraph: (graphId: string) => Promise<void>
        inlineSuggest: (documentContent: string, cursorPosition: number, contextBefore: string) => Promise<string | null>
        summarize: (documentContent: string, style: string, maxLength: number) => Promise<string>
        streamInsertStart: (position: 'end' | 'start' | 'cursor') => Promise<{ success: boolean; sessionId: string; message: string }>
        streamInsertChunk: (sessionId: string, chunk: string) => Promise<{ success: boolean; received: number; message: string }>
        streamInsertEnd: (sessionId: string) => Promise<{ success: boolean; message: string }>
        streamInsertCancel: (sessionId: string) => Promise<{ success: boolean; message: string }>
        streamInsertWithFormat: (sessionId: string, chunk: string, format?: { bold?: boolean; italic?: boolean; heading?: 1 | 2 | 3 }) => Promise<{ success: boolean; received: number; format?: unknown; message: string }>
        insertAfterElement: (searchText: string, content: string, elementType?: string) => Promise<{ success: boolean; operation: string; message: string }>
        streamInsertStatus: (sessionId: string) => Promise<{ success: boolean; sessionStatus: { bufferedBytes: number; chunksReceived: number; wordCount: number; elapsedMs: number; position: string } }>
        streamReplace: (search: string) => Promise<{ success: boolean; sessionId: string; search: string; message: string }>
        streamInsertPreview: (sessionId: string) => Promise<{ success: boolean; preview: string; byteCount: number; wordCount: number; message: string }>
        undoLastStream: () => Promise<{ success: boolean; message: string }>
        insertMultipleLocations: (insertions: Array<{ position?: string; content: string; afterElement?: string }>) => Promise<{ success: boolean; inserted: number; message: string }>
        validateStream: (sessionId: string, checks?: string[]) => Promise<{ success: boolean; valid: boolean; warnings: Array<{ type: string; message: string }>; stats: { wordCount: number; characterCount: number; readingLevel: string } }>
        docGetStructure: () => Promise<{ success: boolean; structure: Array<{ level: number; heading: string; position: number }>; message: string }>
        docGetSection: (headingText: string, includeSubsections?: boolean) => Promise<{ success: boolean; section: { heading: string; content: string; position: number; length: number }; message: string }>
        docSearch: (query: string, contextLines?: number, caseSensitive?: boolean) => Promise<{ success: boolean; results: Array<{ position: number; match: string; before: string; after: string }>; message: string }>
        docGetMetadata: () => Promise<{ success: boolean; metadata: { wordCount: number; charCount: number; lineCount: number; headingCount: number; readingTimeMinutes: number; lastModified: number }; message: string }>
        docFindAndFormat: (search: string, format: unknown, occurrence?: number) => Promise<{ success: boolean; operation: string; message: string }>
        docBatchReplace: (replacements: Array<{ search: string; replace: string }>, useRegex?: boolean) => Promise<{ success: boolean; replacementsCount: number; message: string }>
        docCreateList: (items: string[], type: string, position?: string) => Promise<{ success: boolean; itemCount: number; type: string; message: string }>
        confirmToolApproval: (approved: boolean) => Promise<boolean>
        setAgentPermissions: (permissions: Partial<AgentPermissions>) => Promise<boolean>
        fetchModels: (providerId: string, baseUrl: string, apiKey: string) Promise<{ models: Array<{ id: string; name: string }>; error?: string }>
        testConnection: (providerId: string, baseUrl: string, apiKey: string) Promise<{ success: boolean; message?: string; error?: string }>
        validateModel: (providerId: string, baseUrl: string, apiKey: string, model: string) => Promise<{ valid: boolean; message?: string; error?: string }>
        plugin: {
          list: () => Promise<PluginManifest[]>
          get: (name: string) => Promise<PluginManifest | null>
          install: (manifest: PluginManifest, code: string) => Promise<PluginManifest | null>
          uninstall: (name: string) => Promise<boolean>
          enable: (name: string) => Promise<boolean>
          disable: (name: string) => Promise<boolean>
          marketplace: () => Promise<PluginMarketplaceEntry[]>
          builtinCode: (name: string) => Promise<string | null>
        }
      }
      editor: {
        insertContent: (content: string, position: 'end' | 'start' | 'cursor') => Promise<{ success: boolean }>
        replaceText: (search: string, replace: string, replaceAll?: boolean) => Promise<{ success: boolean }>
      }
      file: {
        openDialog: () => Promise<string | null>
        saveDialog: () => Promise<string | null>
        saveAsDialog: (formats?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
        importDocx: (filePath: string) => Promise<string>
        saveFile: (filePath: string, content: string) => Promise<boolean>
        exportPdf: (filePath: string) => Promise<FileExportResult>
        exportMarkdown: (filePath: string, content: string) => Promise<FileExportResult>
        exportEpub: (filePath: string, content: string) => Promise<FileExportResult>
        openImageDialog: () => Promise<string | null>
      }
      // v0.7.0: Rust compute bridge
      compute: {
        analyzeDocument: (pmJson: string) => Promise<any>
        searchDocuments: (query: string, limit?: number) => Promise<Array<{ documentId: string; title: string; snippet: string; score: number }>>
        isRustAvailable: () => Promise<boolean>
        // Language operations
        checkLanguage: (pmJson: string) => Promise<{
          spell_issues: Array<{ word: string; position: number; suggestions: string[] }>
          grammar_issues: Array<{ id: string; position: number; original: string; suggestion: string; explanation: string; confidence: number }>
        } | null>
        formatDocument: (pmJson: string) => Promise<string | null>
        getStats: (htmlContent: string) => Promise<{
          fleschKincaid: number; avgSentenceLen: number; paragraphCount: number;
          readingTimeMin: number; sentenceCount: number; syllableCount: number
        }>
        // Parallel document processing
        processParallel: (pmJson: string, operation: string, search?: string, replace?: string) => Promise<{
          operation: string; chunks_processed: number; spell_issues?: Array<{ word: string; position: number; suggestions: string[] }>;
          grammar_issues?: Array<{ id: string; position: number; original: string; suggestion: string; explanation: string; confidence: number }>;
          find_results?: Array<{ chunk_index: number; node_type: string; positions: number[]; context: string }>;
          replaced_document?: string; stats?: { word_count: number; char_count: number; sentence_count: number; paragraph_count: number }
        } | null>
      }
      template: {
        customSave: (name: string, content: string) => Promise<{ success: boolean }>
        customList: () => Promise<Array<{ name: string }>>
        get: (name: string) => Promise<{ content: string }>
        delete: (name: string) => Promise<{ success: boolean }>
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
        vcsAutoCommit: (message: string, content: string) => Promise<{ id: string; message: string; timestamp: number }>
        vcsPruneCommits: (max: number) => Promise<{ pruned: number }>
      }
      docStats: {
        compute: (htmlContent: string) => Promise<{
          fleschKincaid: number
          avgSentenceLen: number
          paragraphCount: number
          readingTimeMin: number
          sentenceCount: number
          syllableCount: number
        }>
      }
      collab: {
        start: (port: number) => Promise<CollabStartResult>
        stop: () => Promise<{ status: string }>
        status: () => Promise<CollabStatusResult>
        generateCode: () => Promise<CollabGenerateCodeResult>
      }
      cloud: {
        authStart: (provider: string) => Promise<{ success: boolean; error?: string }>
        authStatus: (provider: string) => Promise<{ isAuthenticated: boolean; displayName?: string }>
        disconnect: (provider: string) => Promise<{ success: boolean; error?: string }>
        syncStart: (provider: string, interval: number) => Promise<{ success: boolean }>
        syncStop: (provider: string) => Promise<{ success: boolean }>
        syncStatus: () => Promise<Array<{ provider: string; isAuthenticated: boolean; displayName: string; syncStatus?: string; lastSyncTime?: number }>>
        syncNow: (provider: string) => Promise<{ success: boolean; error?: string }>
        checkConflicts: (provider: string) => Promise<{ conflicts: unknown[] }>
        resolveConflict: (conflictId: string, resolution: 'local' | 'remote' | 'merge') => Promise<{ success: boolean }>
        backupCreate: (title: string, content: string) => Promise<{ success: boolean; id?: string }>
        backupList: (documentTitle: string) => Promise<unknown[]>
        backupRestore: (documentTitle: string, backupId: string) => Promise<{ success: boolean; content?: string }>
        backupDelete: (documentTitle: string, backupId: string) => Promise<{ success: boolean }>
        backupStats: () => Promise<{ totalBackups: number; totalSize: number }>
      }
      storyboard: {
        read: (documentPath: string) => Promise<string>
        write: (documentPath: string, content: string) => Promise<void>
        apply: (documentPath: string) => Promise<{ success: boolean }>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
    }
  }
}
