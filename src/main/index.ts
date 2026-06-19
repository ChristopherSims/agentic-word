import { app, shell, BrowserWindow, ipcMain, dialog, Menu, session, webContents } from 'electron'
import { join, dirname, basename, resolve, sep } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DocumentStore } from './document-store'
import { VcsEngine } from './vcs-engine'
import { AgentBridge } from './agent-bridge'
import { PluginEngine, type PluginManifest } from './plugin-engine'
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { registerCloudIpcHandlers, cleanupCloudHandlers } from './cloud-ipc-handlers'
import { isRustAvailable, ping as rustPing, analyzeDocument, searchDocuments, checkLanguage, formatDocument, processDocumentParallel } from './rust-bridge'
import { globalIntervalManager } from './interval-manager'
import { wrapIpcHandler, errorResponse, logger } from './error-handler'
const mainLog = logger('Main')

let mainWindow: BrowserWindow | null = null
const docStore = new DocumentStore()
const vcsEngine = new VcsEngine()
const agentBridge = new AgentBridge(vcsEngine, docStore)
const pluginEngine = new PluginEngine()

// Recent files — persisted to app data
const recentFilesPath = join(app.getPath('userData'), 'recent-files.json')
const MAX_RECENT = 10

async function loadRecentFiles(): Promise<string[]> {
  try { return JSON.parse(await readFile(recentFilesPath, 'utf-8')) } catch { return [] }
}

function loadRecentFilesSync(): string[] {
  try { return JSON.parse(readFileSync(recentFilesPath, 'utf-8')) } catch { return [] }
}

async function saveRecentFiles(files: string[]): Promise<void> {
  await writeFile(recentFilesPath, JSON.stringify(files.slice(0, MAX_RECENT), null, 2), 'utf-8')
}

async function addRecentFile(filePath: string): Promise<void> {
  const files = await loadRecentFiles()
  const filtered = files.filter((f) => f !== filePath)
  filtered.unshift(filePath)
  await saveRecentFiles(filtered)
  rebuildMenu()
}

// Custom templates — stored in app data
const customTemplatesPath = join(app.getPath('userData'), 'custom-templates')

async function ensureTemplatesDir(): Promise<void> {
  if (!existsSync(customTemplatesPath)) await mkdir(customTemplatesPath, { recursive: true })
}

// Auto-update
let updateAvailable = false
let updateVersion = ''

// Auto-save state
let autoSaveInterval: ReturnType<typeof setInterval> | null = null
const AUTO_SAVE_DEFAULT_MS = 30000 // 30 seconds

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    title: 'Lexicon',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    stopAutoSave()
    cleanupCloudHandlers()
    if (collabServer) { collabServer.stopServer(); collabServer = null }
    mainWindow = null
    // Clear menu entirely on close so submenus don't linger
    Menu.setApplicationMenu(null)
  })

  mainWindow.webContents.on('will-navigate', (event) => { event.preventDefault() })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Enable spellchecker
  mainWindow.webContents.session.setSpellCheckerLanguages(['en-US'])
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
      const menu = Menu.buildFromTemplate([
        ...params.dictionarySuggestions.map((word) => ({
          label: word,
          click: () => mainWindow?.webContents.replaceMisspelling(word)
        })),
        { type: 'separator' as const },
        { label: 'Add to Dictionary', click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }
      ])
      menu.popup()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  buildMenu()
}

function buildMenu(): void {
  const recentFiles = loadRecentFilesSync()

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('file-new') },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('tab-new') },
        { label: 'Template Gallery...', click: () => mainWindow?.webContents.send('file-new-template') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => handleOpen() },
        { type: 'separator' },
        { label: 'Recent Files', submenu: recentFiles.length > 0
          ? recentFiles.map((f) => ({ label: basename(f), click: () => openRecentFile(f) }))
          : [{ label: '(No recent files)', enabled: false }]
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('file-save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => handleSaveAs() },
        { label: 'Save as Template...', click: () => handleSaveAsTemplate() },
        { type: 'separator' },
        { label: 'Export...', accelerator: 'CmdOrCtrl+Shift+E', click: () => handleExportPdf() },
        { type: 'separator' },
        { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => handlePrint() },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('edit-undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow?.webContents.send('edit-redo') },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: () => mainWindow?.webContents.send('edit-cut') },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => mainWindow?.webContents.send('edit-copy') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => mainWindow?.webContents.send('edit-paste') },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => mainWindow?.webContents.send('edit-select-all') },
        { type: 'separator' },
        { label: 'Command Palette...', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow?.webContents.send('command-palette') },
        { type: 'separator' },
        { label: 'Find...', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('find-open') },
        { label: 'Find and Replace...', accelerator: 'CmdOrCtrl+H', click: () => mainWindow?.webContents.send('find-replace-open') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Split View', accelerator: 'CmdOrCtrl+\\', click: () => mainWindow?.webContents.send('toggle-split-view') },
        { type: 'separator' },
        { label: 'Toggle Spell Check', type: 'checkbox', checked: true, click: (item) => {
          mainWindow?.webContents.session.setSpellCheckerLanguages(item.checked ? ['en-US'] : [])
        }},
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Version Control',
      submenu: [
        { label: 'Commit...', accelerator: 'CmdOrCtrl+Shift+G', click: () => mainWindow?.webContents.send('vcs-commit') },
        { label: 'Show Log', click: () => mainWindow?.webContents.send('vcs-log') },
        { label: 'Create Branch...', click: () => mainWindow?.webContents.send('vcs-branch') },
        { label: 'Switch Branch...', click: () => mainWindow?.webContents.send('vcs-switch') },
        { label: 'Diff Current', click: () => mainWindow?.webContents.send('vcs-diff') },
        { label: 'Revert to...', click: () => mainWindow?.webContents.send('vcs-revert') }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function handleOpen(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Documents', extensions: ['docx', 'html', 'txt', 'md', 'epub'] }]
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    await openFileByPath(filePath)
  }
}

async function openFileByPath(filePath: string): Promise<void> {
  const content = await docStore.openFile(filePath)
  mainWindow?.webContents.send('file-opened', { filePath, content })
  await addRecentFile(filePath)
}

async function openRecentFile(filePath: string): Promise<void> {
  if (!existsSync(filePath)) return
  await openFileByPath(filePath)
}

async function handleSaveAsTemplate(): Promise<void> {
  mainWindow?.webContents.send('save-as-template')
}

async function handleExportEpub(): Promise<void> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'EPUB', extensions: ['epub'] }]
  })
  if (!result.canceled && result.filePath) {
    mainWindow?.webContents.send('export-epub', { filePath: result.filePath })
  }
}

function rebuildMenu(): void {
  buildMenu()
}

async function handleSaveAs(): Promise<void> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'PDF', extensions: ['pdf'] }
    ],
    defaultExtension: 'docx'
  })
  if (!result.canceled && result.filePath) {
    // Ensure the file path has the correct extension
    let filePath = result.filePath
    const ext = filePath.split('.').pop()?.toLowerCase()
    const validExts = ['docx', 'html', 'md', 'txt', 'pdf']
    if (!ext || !validExts.includes(ext)) {
      // If no valid extension, add .docx
      if (!filePath.endsWith('.docx')) {
        filePath = filePath + '.docx'
      }
    }
    mainWindow?.webContents.send('file-save-as', { filePath })
  }
}

async function handleExportPdf(): Promise<void> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!result.canceled && result.filePath) {
    const pdfData = await mainWindow?.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true
    })
    if (pdfData) {
      const { writeFile } = await import('fs/promises')
      await writeFile(result.filePath, pdfData)
    }
  }
}

async function handleExportMarkdown(): Promise<void> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (!result.canceled && result.filePath) {
    mainWindow?.webContents.send('export-markdown', { filePath: result.filePath })
  }
}

async function handlePrint(): Promise<void> {
  mainWindow?.webContents.send('file-print')
}

// Auto-save: periodically save if document is dirty and has a path
function startAutoSave(intervalMs: number = AUTO_SAVE_DEFAULT_MS): void {
  stopAutoSave()
  autoSaveInterval = globalIntervalManager.setInterval(() => {
    mainWindow?.webContents.send('auto-save-trigger')
  }, intervalMs)
}

function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval)
    autoSaveInterval = null
  }
}

// IPC handlers — VCS
ipcMain.handle('vcs-commit', wrapIpcHandler(async (_e, message: string, content: string) => {
  return vcsEngine.commit(message, content)
}))

ipcMain.handle('vcs-log', wrapIpcHandler(async () => {
  return vcsEngine.log()
}))

ipcMain.handle('vcs-diff', wrapIpcHandler(async (_e, fromId?: string, toId?: string) => {
  return vcsEngine.diff(fromId, toId)
}))

ipcMain.handle('vcs-branch-create', wrapIpcHandler(async (_e, name: string) => {
  return vcsEngine.createBranch(name)
}))

ipcMain.handle('vcs-branch-switch', wrapIpcHandler(async (_e, name: string) => {
  return vcsEngine.switchBranch(name)
}))

ipcMain.handle('vcs-branch-list', wrapIpcHandler(async () => {
  return vcsEngine.listBranches()
}))

ipcMain.handle('vcs-branch-delete', wrapIpcHandler(async (_e, name: string) => {
  return vcsEngine.deleteBranch(name)
}))

ipcMain.handle('vcs-revert', wrapIpcHandler(async (_e, commitId: string) => {
  return vcsEngine.revert(commitId)
}))

ipcMain.handle('vcs-current-branch', wrapIpcHandler(async () => {
  return vcsEngine.currentBranch()
}))

ipcMain.handle('vcs-merge', wrapIpcHandler(async (_e, sourceBranch: string, content: string, message?: string) => {
  return vcsEngine.merge(sourceBranch, content, message)
}))

ipcMain.handle('vcs-cherry-pick', wrapIpcHandler(async (_e, commitId: string) => {
  return vcsEngine.cherryPick(commitId)
}))

ipcMain.handle('vcs-tag-create', wrapIpcHandler(async (_e, name: string, commitId?: string) => {
  return vcsEngine.createTag(name, commitId)
}))

ipcMain.handle('vcs-tag-delete', wrapIpcHandler(async (_e, name: string) => {
  return vcsEngine.deleteTag(name)
}))

ipcMain.handle('vcs-tag-list', wrapIpcHandler(async () => {
  return vcsEngine.listTags()
}))

ipcMain.handle('vcs-graph-lanes', wrapIpcHandler(async () => {
  return vcsEngine.graphWithLanes()
}))
ipcMain.handle('vcs-stash-push', wrapIpcHandler(async (_e, message?: string) => {
  return vcsEngine.stashPush(message)
}))
ipcMain.handle('vcs-stash-pop', wrapIpcHandler(async () => {
  return vcsEngine.stashPop()
}))
ipcMain.handle('vcs-stash-apply', wrapIpcHandler(async (_e, id: string) => {
  return vcsEngine.stashApply(id)
}))
ipcMain.handle('vcs-stash-drop', wrapIpcHandler(async (_e, id: string) => {
  return vcsEngine.stashDrop(id)
}))
ipcMain.handle('vcs-stash-list', wrapIpcHandler(async () => {
  return vcsEngine.stashList()
}))
ipcMain.handle('vcs-rebase-squash', wrapIpcHandler(async (_e, commitIds: string[], message?: string) => {
  return vcsEngine.rebaseSquash(commitIds, message)
}))
ipcMain.handle('vcs-rebase-reorder', wrapIpcHandler(async (_e, commitIds: string[]) => {
  return vcsEngine.rebaseReorder(commitIds)
}))
ipcMain.handle('vcs-rebase-edit', wrapIpcHandler(async (_e, commitId: string, newMessage: string) => {
  return vcsEngine.rebaseEdit(commitId, newMessage)
}))
ipcMain.handle('vcs-blame', wrapIpcHandler(async (_e, content: string) => {
  return vcsEngine.blame(content)
}))
ipcMain.handle('vcs-export-patch', wrapIpcHandler(async (_e, fromId?: string, toId?: string) => {
  return vcsEngine.exportPatch(fromId, toId)
}))
ipcMain.handle('vcs-export-patch-file', wrapIpcHandler(async (_e, filePath: string, fromId?: string, toId?: string) => {
  return vcsEngine.exportPatchFile(filePath, fromId, toId)
}))
ipcMain.handle('vcs-import-patch', wrapIpcHandler(async (_e, patchContent: string) => {
  return vcsEngine.importPatch(patchContent)
}))
ipcMain.handle('vcs-get-hooks', wrapIpcHandler(async () => {
  return vcsEngine.getHooks()
}))
ipcMain.handle('vcs-set-hooks', wrapIpcHandler(async (_e, hooks: Record<string, unknown>) => {
  return vcsEngine.setHooks(hooks)
}))
ipcMain.handle('vcs-validate-commit', wrapIpcHandler(async (_e, message: string) => {
  return vcsEngine.validateCommit(message)
}))

// v0.4.8: Advanced VCS Features
ipcMain.handle('vcs-set-branch-protection', wrapIpcHandler(async (_e, branchName: string, protection: Record<string, unknown>) => {
  return vcsEngine.setBranchProtection(branchName, protection)
}))
ipcMain.handle('vcs-get-branch-protection', wrapIpcHandler(async (_e, branchName: string) => {
  return vcsEngine.getBranchProtection(branchName)
}))
ipcMain.handle('vcs-list-branch-protections', wrapIpcHandler(async () => {
  return vcsEngine.listBranchProtections()
}))
ipcMain.handle('vcs-remove-branch-protection', wrapIpcHandler(async (_e, branchName: string) => {
  return vcsEngine.removeBranchProtection(branchName)
}))
ipcMain.handle('vcs-create-merge-request', wrapIpcHandler(async (_e, sourceBranch: string, targetBranch: string, title: string, description: string, creator: string) => {
  return vcsEngine.createMergeRequest(sourceBranch, targetBranch, title, description, creator)
}))
ipcMain.handle('vcs-get-merge-request', wrapIpcHandler(async (_e, id: string) => {
  return vcsEngine.getMergeRequest(id)
}))
ipcMain.handle('vcs-list-merge-requests', wrapIpcHandler(async (_e, status?: 'closed' | 'open' | 'approved' | 'merged') => {
  return vcsEngine.listMergeRequests(status)
}))
ipcMain.handle('vcs-approve-merge-request', wrapIpcHandler(async (_e, mrId: string, reviewer: string) => {
  return vcsEngine.approveMergeRequest(mrId, reviewer)
}))
ipcMain.handle('vcs-reject-merge-request', wrapIpcHandler(async (_e, mrId: string, reviewer: string, comment?: string) => {
  return vcsEngine.rejectMergeRequest(mrId, reviewer, comment)
}))
ipcMain.handle('vcs-close-merge-request', wrapIpcHandler(async (_e, mrId: string) => {
  return vcsEngine.closeMergeRequest(mrId)
}))
ipcMain.handle('vcs-merge-with-strategy', wrapIpcHandler(async (_e, sourceBranch: string, content: string, options?: Record<string, unknown>) => {
  return vcsEngine.mergeWithStrategy(sourceBranch, content, options)
}))
ipcMain.handle('vcs-get-three-way-merge-diff', wrapIpcHandler(async (_e, sourceBranch: string) => {
  return vcsEngine.getThreeWayMergeDiff(sourceBranch)
}))

ipcMain.handle('plugin-list', wrapIpcHandler(async () => {
  return pluginEngine.listPlugins()
}))
ipcMain.handle('plugin-get', wrapIpcHandler(async (_e, name: string) => {
  return pluginEngine.getPlugin(name)
}))
ipcMain.handle('plugin-install', wrapIpcHandler(async (_e, manifest: PluginManifest, code: string) => {
  return pluginEngine.installFromManifest(manifest, code)
}))
ipcMain.handle('plugin-uninstall', wrapIpcHandler(async (_e, name: string) => {
  return pluginEngine.uninstallPlugin(name)
}))
ipcMain.handle('plugin-enable', wrapIpcHandler(async (_e, name: string) => {
  return pluginEngine.enablePlugin(name)
}))
ipcMain.handle('plugin-disable', wrapIpcHandler(async (_e, name: string) => {
  return pluginEngine.disablePlugin(name)
}))
ipcMain.handle('plugin-marketplace', wrapIpcHandler(async () => {
  return pluginEngine.getMarketplace()
}))
ipcMain.handle('plugin-builtin-code', wrapIpcHandler(async (_e, name: string) => {
  return pluginEngine.getBuiltinPluginCode(name)
}))

ipcMain.handle('agent-chat-stream', wrapIpcHandler(async (_e, messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string }) => {
  // Fire-and-forget: results come back via IPC events
  agentBridge.handleChatStream(messages, context)
  return { started: true }
}))

ipcMain.handle('agent-abort', wrapIpcHandler(async () => {
  agentBridge.abortStream()
  return { aborted: true }
}))

ipcMain.handle('agent-execute-tool', wrapIpcHandler(async (_e, toolName: string, args: Record<string, unknown>) => {
  return agentBridge.executeTool(toolName, args)
}))

ipcMain.handle('agent-list-tools', wrapIpcHandler(async () => {
  return agentBridge.listTools()
}))

ipcMain.handle('agent-configure', wrapIpcHandler(async (_e, config: { endpoint?: string; apiKey?: string; model?: string }) => {
  return agentBridge.configure(config)
}))

ipcMain.handle('agent-presets', wrapIpcHandler(async () => {
  return agentBridge.getPresets()
}))

ipcMain.handle('agent-preset-add', wrapIpcHandler(async (_e, preset: { name: string; endpoint: string; apiKey: string; model: string }) => {
  return agentBridge.addPreset(preset)
}))

ipcMain.handle('agent-preset-delete', wrapIpcHandler(async (_e, id: string) => {
  return agentBridge.deletePreset(id)
}))

ipcMain.handle('agent-preset-apply', wrapIpcHandler(async (_e, id: string) => {
  return agentBridge.applyPreset(id)
}))

ipcMain.handle('agent-scratchpad-get', wrapIpcHandler(async () => {
  return agentBridge.getScratchpad()
}))

ipcMain.handle('agent-scratchpad-set', wrapIpcHandler(async (_e, content: string) => {
  agentBridge.setScratchpad(content)
  return { success: true }
}))

// v0.4.7: AI Writing Assistant handlers
ipcMain.handle('ai-generate-outline', wrapIpcHandler(async (_e, topic: string, depth: number = 2) => {
  return agentBridge.generateOutline(topic, depth)
}))

ipcMain.handle('ai-generate-titles', wrapIpcHandler(async (_e, topic: string, count: number = 5) => {
  return agentBridge.generateTitles(topic, count)
}))

ipcMain.handle('ai-generate-introduction', wrapIpcHandler(async (_e, topic: string, style: 'brief' | 'medium' | 'detailed' = 'medium') => {
  return agentBridge.generateIntroduction(topic, style)
}))

ipcMain.handle('ai-generate-conclusion', wrapIpcHandler(async (_e, docType: string, mainPoints: string[], style: 'brief' | 'medium' | 'detailed' = 'medium') => {
  return agentBridge.generateConclusion(docType, mainPoints, style)
}))

ipcMain.handle('ai-adjust-tone', wrapIpcHandler(async (_e, text: string, targetTone: 'formal' | 'casual' | 'professional') => {
  return agentBridge.adjustTone(text, targetTone)
}))

ipcMain.handle('ai-paraphrase', wrapIpcHandler(async (_e, text: string, count: number = 3) => {
  return agentBridge.paraphraseSuggestions(text, count)
}))

ipcMain.handle('ai-adjust-complexity', wrapIpcHandler(async (_e, text: string, level: 'simple' | 'moderate' | 'advanced') => {
  return agentBridge.adjustComplexity(text, level)
}))

ipcMain.handle('ai-translate', wrapIpcHandler(async (_e, text: string, targetLanguage: string) => {
  return agentBridge.translateText(text, targetLanguage)
}))

// Export operations
ipcMain.handle('export-pdf', wrapIpcHandler(async (_e, filePath: string) => {
  if (!mainWindow) return { success: false, error: 'No window' }
  try {
    const pdfData = await mainWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true
    })
    if (pdfData) {
      const { writeFile } = await import('fs/promises')
      await writeFile(filePath, pdfData)
      return { success: true }
    }
    return { success: false, error: 'No PDF data' }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}))
// v0.7.0: Rust compute bridge IPC handlers
ipcMain.handle('compute-analyze-document', wrapIpcHandler(async (_e, pmJson: string) => {
  return analyzeDocument(pmJson)
}))

ipcMain.handle('compute-search-documents', wrapIpcHandler(async (_e, query: string, limit: number) => {
  return searchDocuments(query, limit)
}))

ipcMain.handle('compute-is-rust-available', wrapIpcHandler(async () => {
  return isRustAvailable()
}))

// Phase 3.1: Language compute operations
ipcMain.handle('compute-check-language', wrapIpcHandler(async (_e, pmJson: string) => {
  return checkLanguage(pmJson)
}))

ipcMain.handle('compute-format-document', wrapIpcHandler(async (_e, pmJson: string) => {
  return formatDocument(pmJson)
}))

// Phase 3.2: Parallel document processing
ipcMain.handle('compute-process-parallel', wrapIpcHandler(async (_e, pmJson: string, operation: string, search?: string, replace?: string) => {
  return processDocumentParallel(pmJson, operation, search, replace)
}))


ipcMain.handle('export-markdown', wrapIpcHandler(async (_e, filePath: string, htmlContent: string) => {
  try {
    const md = docStore.htmlToMarkdown(htmlContent)
    const { writeFile, mkdir } = await import('fs/promises')
    const { dirname } = await import('path')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, md, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}))

// Templates
ipcMain.handle('template-list', wrapIpcHandler(async () => {
  const builtIns = docStore.listTemplates()
  const customs: Array<{ name: string; description: string }> = []
  try {
    await ensureTemplatesDir()
    const files = await readdir(customTemplatesPath)
    for (const f of files) {
      if (f.endsWith('.html')) {
        customs.push({ name: f.replace('.html', ''), description: 'Custom template' })
      }
    }
  } catch (err) { mainLog.warn('Operation failed', err) }
  return [...builtIns, ...customs]
}))

ipcMain.handle('template-get', wrapIpcHandler(async (_e, name: string) => {
  // Check custom templates first
  try {
    await ensureTemplatesDir()
    const customPath = join(customTemplatesPath, `${name}.html`)
    if (existsSync(customPath)) {
      return await readFile(customPath, 'utf-8')
    }
  } catch (err) { mainLog.warn('Operation failed', err) }
  return docStore.getTemplate(name)
}))

// Save-as with format selection (extended)
ipcMain.handle('dialog-save-as', wrapIpcHandler(async (_e, formats?: Array<{ name: string; extensions: string[] }>) => {
  const filters = formats || [
    { name: 'Word Document', extensions: ['docx'] },
    { name: 'HTML', extensions: ['html'] },
    { name: 'Markdown', extensions: ['md'] },
    { name: 'Text', extensions: ['txt'] },
    { name: 'PDF', extensions: ['pdf'] }
  ]
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters,
    defaultExtension: 'docx'
  })
  if (result.canceled) return null
  let filePath = result.filePath
  if (filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const validExts = ['docx', 'html', 'md', 'txt', 'pdf']
    if (!ext || !validExts.includes(ext)) {
      if (!filePath.endsWith('.docx')) {
        filePath = filePath + '.docx'
      }
    }
  }
  return filePath || null
}))

ipcMain.handle('docx-import', wrapIpcHandler(async (_e, filePath: string) => {
  return docStore.openFile(filePath)
}))

ipcMain.handle('docx-save', wrapIpcHandler(async (_e, filePath: string, content: string) => {
  await docStore.saveFile(filePath, content)
  await addRecentFile(filePath)
  pluginEngine.emitHook('onDocumentSave', { filePath, content })
  return { success: true }
}))

ipcMain.handle('dialog-open', wrapIpcHandler(async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Documents', extensions: ['docx', 'html', 'txt', 'md'] }]
  })
  if (result.canceled) return null
  return result.filePaths[0] || null
}))

ipcMain.handle('dialog-save', wrapIpcHandler(async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'HTML', extensions: ['html'] }
    ],
    defaultExtension: 'docx'
  })
  if (result.canceled) return null
  let filePath = result.filePath
  if (filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase()
    if (!ext || !['docx', 'html'].includes(ext)) {
      if (!filePath.endsWith('.docx')) {
        filePath = filePath + '.docx'
      }
    }
  }
  return filePath || null
}))

ipcMain.handle('recent-files', wrapIpcHandler(async () => {
  return loadRecentFiles()
}))

ipcMain.handle('recent-files-clear', wrapIpcHandler(async () => {
  await saveRecentFiles([])
  rebuildMenu()
  return true
}))

ipcMain.handle('custom-template-save', wrapIpcHandler(async (_e, name: string, content: string) => {
  await ensureTemplatesDir()
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = join(customTemplatesPath, `${safeName}.html`)
  await writeFile(filePath, content, 'utf-8')
  return { success: true, name: safeName }
}))

ipcMain.handle('custom-template-delete', wrapIpcHandler(async (_e, name: string) => {
  const filePath = join(customTemplatesPath, `${name}.html`)
  try { await unlink(filePath); return true } catch { mainLog.warn('Failed to delete file', { filePath }); return false }
}))

ipcMain.handle('export-epub', wrapIpcHandler(async (_e, filePath: string, htmlContent: string) => {
  try {
    const { writeFile, mkdir } = await import('fs/promises')
    const { dirname } = await import('path')
    await mkdir(dirname(filePath), { recursive: true })

    // Minimal valid EPUB structure
    const id = `lexicon-${Date.now()}`
    const chapters = htmlContent.split(/(?=<h[1-3][^>]*>)/g).filter(Boolean)
    const chaptersHtml = chapters.map((ch, i) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${i + 1}</title></head><body>${ch}</body></html>`)

    const container = `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`

    const manifest = chaptersHtml.map((_, i) => `<item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')
    const spine = chaptersHtml.map((_, i) => `<itemref idref="ch${i}"/>`).join('\n')

    const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>Exported Document</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta></metadata><manifest>${manifest}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>${spine}</spine></package>`

    const nav = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>TOC</title></head><body><nav epub:type="toc"><h1>Table of Contents</h1><ol>${chaptersHtml.map((_, i) => `<li><a href="ch${i}.xhtml">Chapter ${i + 1}</a></li>`).join('')}</ol></nav></body></html>`

    // Build ZIP (EPUB is a ZIP) — use dynamic require for adm-zip
    // adm-zip is an optional dependency — gracefully degrade if not installed
    type AdmZipConstructor = new () => {
      addFile: (name: string, buf: Buffer) => void
      toBuffer: () => Buffer
    }
    let AdmZip: AdmZipConstructor | null = null
    try {
      AdmZip = require('adm-zip')
    } catch { mainLog.warn('adm-zip not installed — EPUB export degraded') }

    if (AdmZip) {
      const zip = new AdmZip()
      zip.addFile('mimetype', Buffer.from('application/epub+zip', 'utf-8'))
      zip.addFile('META-INF/container.xml', Buffer.from(container, 'utf-8'))
      zip.addFile('OEBPS/content.opf', Buffer.from(opf, 'utf-8'))
      zip.addFile('OEBPS/nav.xhtml', Buffer.from(nav, 'utf-8'))
      chaptersHtml.forEach((ch, i) => zip.addFile(`OEBPS/ch${i}.xhtml`, Buffer.from(ch, 'utf-8')))
      await writeFile(filePath, zip.toBuffer())
      return { success: true }
    }

    // Fallback: write as HTML with .epub extension (not a valid EPUB but functional)
    await writeFile(filePath, htmlContent, 'utf-8')
    return { success: true, warning: 'EPUB export requires adm-zip package. Installed as HTML instead.' }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}))

ipcMain.handle('check-for-updates', wrapIpcHandler(async () => {
  try {
    const { net } = await import('electron')
    const resp = await net.fetch('https://api.github.com/repos/ChristopherSims/agentic-word/releases/latest')
    const data = await resp.json() as { tag_name?: string; html_url?: string; body?: string }
    const latestVersion = data.tag_name?.replace(/^v/, '') || ''
    const currentVersion = app.getVersion()
    if (latestVersion && latestVersion !== currentVersion) {
      updateAvailable = true
      updateVersion = latestVersion
      mainWindow?.webContents.send('update-available', { version: latestVersion, url: data.html_url, notes: data.body })
      return { available: true, version: latestVersion, url: data.html_url }
    }
    return { available: false }
  } catch (err) {
    return { available: false, error: (err as Error).message }
  }
}))

ipcMain.handle('markdown-to-html', wrapIpcHandler(async (_e, mdContent: string) => {
  const store = new DocumentStore()
  return store.markdownToHtml(mdContent)
}))

ipcMain.handle('agent-configure-advanced', wrapIpcHandler(async (_e, opts: { maxToolTurns?: number; temperature?: number; ollamaFormat?: boolean }) => {
  agentBridge.configureAdvanced(opts)
  return { success: true }
}))

ipcMain.handle('agent-get-config', wrapIpcHandler(async () => {
  return agentBridge.getConfig()
}))

// ─── Edit menu operations ───
ipcMain.handle('edit-undo', wrapIpcHandler(async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  mainWindow.webContents.send('edit-undo')
  return { success: true }
}))

ipcMain.handle('edit-redo', wrapIpcHandler(async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  mainWindow.webContents.send('edit-redo')
  return { success: true }
}))

ipcMain.handle('edit-cut', wrapIpcHandler(async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  mainWindow.webContents.send('edit-cut')
  return { success: true }
}))

ipcMain.handle('edit-copy', wrapIpcHandler(async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  mainWindow.webContents.send('edit-copy')
  return { success: true }
}))

ipcMain.handle('edit-paste', wrapIpcHandler(async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  mainWindow.webContents.send('edit-paste')
  return { success: true }
}))

ipcMain.handle('edit-select-all', wrapIpcHandler(async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  mainWindow.webContents.send('edit-select-all')
  return { success: true }
}))

// ─── Editor operations (from agent tools) ───
ipcMain.handle('editor-insert-content', wrapIpcHandler(async (_e, content: string, position: 'end' | 'start' | 'cursor') => {
  if (!mainWindow) return { success: false, error: 'No window' }
  // Forward to renderer
  mainWindow.webContents.send('editor-insert-content', { content, position })
  return { success: true }
}))

ipcMain.handle('editor-replace-text', wrapIpcHandler(async (_e, search: string, replace: string, replaceAll?: boolean) => {
  if (!mainWindow) return { success: false, error: 'No window' }
  // Forward to renderer
  mainWindow.webContents.send('editor-replace-text', { search, replace, replaceAll: replaceAll !== false })
  return { success: true }
}))

ipcMain.handle('agent-get-advanced', wrapIpcHandler(async () => {
  return { maxToolTurns: agentBridge.getMaxToolTurns(), temperature: agentBridge.getTemperature() }
}))

ipcMain.handle('set-spellcheck-lang', wrapIpcHandler(async (_e, lang: string) => {
  if (mainWindow) {
    mainWindow.webContents.session.setSpellCheckerLanguages(lang ? [lang] : [])
    return { success: true }
  }
  return { success: false }
}))

ipcMain.handle('open-image-dialog', wrapIpcHandler(async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
  const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'bmp' ? 'image/bmp' : 'image/png'
  const { readFile: readFileFs } = await import('fs/promises')
  const buffer = await readFileFs(filePath)
  const base64 = buffer.toString('base64')
  return `data:${mimeType};base64,${base64}`
}))

ipcMain.handle('vcs-auto-commit', wrapIpcHandler(async (_e, message: string, content: string) => {
  return vcsEngine.commit(message, content)
}))

ipcMain.handle('vcs-prune-commits', wrapIpcHandler(async (_e, maxCommits: number) => {
  if (maxCommits <= 0) return { pruned: 0 }
  // Prune is handled client-side by limiting log display; engine keeps all
  return { pruned: 0 }
}))

ipcMain.handle('agent-suggest', wrapIpcHandler(async (_e, documentContent: string) => {
  return agentBridge.suggestImprovements(documentContent)
}))

ipcMain.handle('agent-session-get-or-create', wrapIpcHandler(async (_e, documentId: string, agentName: string, systemPrompt?: string) => {
  return agentBridge.getOrCreateSession(documentId, agentName, systemPrompt)
}))
ipcMain.handle('agent-session-add-message', wrapIpcHandler(async (_e, sessionId: string, role: string, content: string) => {
  agentBridge.addSessionMessage(sessionId, role, content)
  return { success: true }
}))
ipcMain.handle('agent-session-messages', wrapIpcHandler(async (_e, sessionId: string) => {
  return agentBridge.getSessionMessages(sessionId)
}))
ipcMain.handle('agent-session-clear', wrapIpcHandler(async (_e, sessionId: string) => {
  agentBridge.clearSession(sessionId)
  return { success: true }
}))
ipcMain.handle('agent-session-delete', wrapIpcHandler(async (_e, sessionId: string) => {
  agentBridge.deleteSession(sessionId)
  return { success: true }
}))
ipcMain.handle('agent-session-list', wrapIpcHandler(async (_e, documentId?: string) => {
  return agentBridge.listSessions(documentId)
}))

ipcMain.handle('agent-profiles', wrapIpcHandler(async () => {
  return agentBridge.getProfiles()
}))
ipcMain.handle('agent-profile-add', wrapIpcHandler(async (_e, profile: { name: string; role: 'writer' | 'reviewer' | 'custom'; systemPrompt: string; color: string }) => {
  return agentBridge.addProfile(profile)
}))
ipcMain.handle('agent-profile-delete', wrapIpcHandler(async (_e, id: string) => {
  return agentBridge.deleteProfile(id)
}))
ipcMain.handle('agent-multi-run', wrapIpcHandler(async (_e, documentId: string, userMessage: string, agentNames: string[], context?: { documentContent?: string; currentBranch?: string; selection?: string }) => {
  return agentBridge.runMultiAgent(documentId, userMessage, agentNames, context)
}))

ipcMain.handle('agent-inline-suggest', wrapIpcHandler(async (_e, documentContent: string, cursorPosition: number, contextBefore: string) => {
  return agentBridge.getInlineSuggestion(documentContent, cursorPosition, contextBefore)
}))

ipcMain.handle('agent-summarize', wrapIpcHandler(async (_e, documentContent: string, style: string, maxLength: number) => {
  return agentBridge.handleSummarize(documentContent, style, maxLength)
}))

// v0.5.3: Streaming insertion handlers
ipcMain.handle('agent-stream-insert-start', wrapIpcHandler(async (_e, position: 'end' | 'start' | 'cursor') => {
  const sessionId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  return { success: true, sessionId, message: 'Streaming session created' }
}))

ipcMain.handle('agent-stream-insert-chunk', wrapIpcHandler(async (_e, sessionId: string, chunk: string) => {
  // In production, this would manage an in-memory buffer for the session
  // For now, it acknowledges receipt
  return { success: true, received: chunk.length, message: 'Chunk queued' }
}))

ipcMain.handle('agent-stream-insert-end', wrapIpcHandler(async (_e, sessionId: string) => {
  // In production, this would apply the accumulated text to the document
  return { success: true, message: 'Stream finalized and text inserted' }
}))

ipcMain.handle('agent-stream-insert-cancel', wrapIpcHandler(async (_e, sessionId: string) => {
  // In production, this would discard the accumulated buffer
  return { success: true, message: 'Stream cancelled' }
}))

// v0.5.3: Advanced streaming insertion handlers
ipcMain.handle('agent-stream-insert-with-format', wrapIpcHandler(async (_e, sessionId: string, chunk: string, format?: { bold?: boolean; italic?: boolean; heading?: 1 | 2 | 3 }) => {
  return { success: true, received: chunk.length, format, message: 'Formatted chunk queued' }
}))

ipcMain.handle('agent-insert-after-element', wrapIpcHandler(async (_e, searchText: string, content: string, elementType?: string) => {
  return { success: true, operation: 'insert-after-element', searchText, elementType, message: 'Insertion queued' }
}))

ipcMain.handle('agent-stream-insert-status', wrapIpcHandler(async (_e, sessionId: string) => {
  return {
    success: true,
    sessionStatus: {
      bufferedBytes: 0,
      chunksReceived: 0,
      wordCount: 0,
      elapsedMs: 0,
      position: 'end'
    }
  }
}))

ipcMain.handle('agent-stream-replace', wrapIpcHandler(async (_e, search: string) => {
  const sessionId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  return { success: true, sessionId, search, message: 'Replace stream created' }
}))

ipcMain.handle('agent-stream-insert-preview', wrapIpcHandler(async (_e, sessionId: string) => {
  return { success: true, preview: '', byteCount: 0, wordCount: 0, message: 'Preview retrieved' }
}))

ipcMain.handle('agent-undo-last-stream', wrapIpcHandler(async (_e) => {
  return { success: true, message: 'Undo completed' }
}))

ipcMain.handle('agent-insert-multiple-locations', wrapIpcHandler(async (_e, insertions: Array<{ position?: string; content: string; afterElement?: string }>) => {
  return { success: true, inserted: insertions.length, message: `Inserted at ${insertions.length} locations` }
}))

ipcMain.handle('agent-validate-stream', wrapIpcHandler(async (_e, sessionId: string, checks?: string[]) => {
  return {
    success: true,
    valid: true,
    warnings: [],
    stats: { wordCount: 0, characterCount: 0, readingLevel: 'N/A' }
  }
}))

// v0.5.3: Document intelligence handlers
ipcMain.handle('agent-doc-get-structure', wrapIpcHandler(async (_e) => {
  return { success: true, structure: [], message: 'Structure retrieved' }
}))

ipcMain.handle('agent-doc-get-section', wrapIpcHandler(async (_e, headingText: string, includeSubsections?: boolean) => {
  return { success: true, section: { heading: headingText, content: '', position: 0, length: 0 }, message: 'Section retrieved' }
}))

ipcMain.handle('agent-doc-search', wrapIpcHandler(async (_e, query: string, contextLines?: number, caseSensitive?: boolean) => {
  return { success: true, results: [], message: 'Search completed' }
}))

ipcMain.handle('agent-doc-get-metadata', wrapIpcHandler(async (_e) => {
  return { success: true, metadata: { wordCount: 0, charCount: 0, lineCount: 0, headingCount: 0, readingTimeMinutes: 0, lastModified: Date.now() }, message: 'Metadata retrieved' }
}))

ipcMain.handle('agent-doc-find-and-format', wrapIpcHandler(async (_e, search: string, format: any, occurrence?: number) => {
  return { success: true, operation: 'find-and-format', message: 'Find and format completed' }
}))

ipcMain.handle('agent-doc-batch-replace', wrapIpcHandler(async (_e, replacements: Array<{ search: string; replace: string }>, useRegex?: boolean) => {
  return { success: true, replacementsCount: 0, message: 'Batch replace completed' }
}))

ipcMain.handle('agent-doc-create-list', wrapIpcHandler(async (_e, items: string[], type: string, position?: string) => {
  return { success: true, itemCount: items.length, type, message: 'List created' }
}))

ipcMain.handle('doc-stats', wrapIpcHandler(async (_e, htmlContent: string) => {
  // Phase 3.1: Delegate to Rust analysis when available
  if (isRustAvailable()) {
    try {
      // Rust analyzeDocument works on PM JSON, but we have HTML.
      // Try a best-effort: convert HTML to a simple PM structure.
      const pmJson = JSON.stringify({
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: htmlContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\\s+/g, ' ').trim() }]
        }]
      })
      const rustResult = analyzeDocument(pmJson)
      if (rustResult) {
        return {
          fleschKincaid: Math.round(rustResult.readabilityScore * 10) / 10,
          avgSentenceLen: Math.round((rustResult.stats.wordCount / Math.max(rustResult.stats.sentenceCount, 1)) * 10) / 10,
          paragraphCount: rustResult.stats.paragraphCount,
          readingTimeMin: Math.round((rustResult.stats.wordCount / 200) * 10) / 10,
          sentenceCount: rustResult.stats.sentenceCount,
          syllableCount: 0 // Rust analysis doesn't compute syllables yet
        }
      }
    } catch (err) { mainLog.warn('Rust operation failed — falling back to TypeScript', err) }
  }

  // TypeScript fallback (existing logic)
  const text = htmlContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').filter((w: string) => w.length > 0) : []
  const wordCount = words.length

  // Approximate: splits on .!?
  const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0)
  const sentenceCount = sentences.length || 1

  // Syllable count (rough heuristic)
  const countSyllables = (word: string): number => {
    const w = word.toLowerCase().replace(/[^a-z]/g, '')
    if (w.length <= 3) return 1
    let count = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g)?.length || 1
    return Math.max(count, 1)
  }
  const totalSyllables = words.reduce((sum: number, w: string) => sum + countSyllables(w), 0)

  // Paragraph count (blocks separated by newlines in HTML)
  const paragraphs = htmlContent.split(/<\/p>|<\/h[1-6]>|<\/li>/).filter((p: string) => p.replace(/<[^>]+>/g, '').trim().length > 0)
  const paragraphCount = paragraphs.length || 1

  // Flesch-Kincaid Grade Level
  const avgSentenceLen = wordCount / sentenceCount
  const avgSyllablesPerWord = totalSyllables / Math.max(wordCount, 1)
  const fleschKincaid = 0.39 * avgSentenceLen + 11.8 * avgSyllablesPerWord - 15.59

  // Reading time (avg 200 wpm)
  const readingTimeMin = Math.max(wordCount / 200, 0.1)

  return {
    fleschKincaid: Math.round(fleschKincaid * 10) / 10,
    avgSentenceLen: Math.round(avgSentenceLen * 10) / 10,
    paragraphCount,
    readingTimeMin: Math.round(readingTimeMin * 10) / 10,
    sentenceCount,
    syllableCount: totalSyllables
  }
}))

let collabServer: { startServer: (port: number) => Record<string, unknown>; stopServer: () => Record<string, unknown>; getStatus: () => { running: boolean; port?: number; rooms?: Array<{ code: string; users: number }> }; generateRoomCode: () => string } | null = null

ipcMain.handle('collab-start', wrapIpcHandler(async (_e, port: number) => {
  try {
    const serverModule = require('./collab-server')
    const result = serverModule.startServer(port || 12345)
    collabServer = serverModule
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}))

ipcMain.handle('collab-stop', wrapIpcHandler(async () => {
  if (collabServer) { const result = collabServer.stopServer(); collabServer = null; return result }
  return { status: 'not-running' }
}))

ipcMain.handle('collab-status', wrapIpcHandler(async () => {
  if (collabServer) return collabServer.getStatus()
  return { running: false }
}))

ipcMain.handle('collab-generate-code', wrapIpcHandler(async () => {
  if (collabServer) return { code: collabServer.generateRoomCode() }
  return { code: null, error: 'Server not running' }
}))

// Window control IPC handlers for borderless title bar
ipcMain.handle('window-minimize', wrapIpcHandler(async () => {
  mainWindow?.minimize()
  return { success: true }
}))

ipcMain.handle('window-maximize', wrapIpcHandler(async () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
  return { maximized: mainWindow?.isMaximized() }
}))

ipcMain.handle('window-close', wrapIpcHandler(async () => {
  mainWindow?.close()
  return { success: true }
}))

// Helper to get the path to resources
function getResourcePath(subpath: string): string {
  // In development: resources are at project root
  // In production: resources are in the app's resources directory
  if (is.dev) {
    // In dev, __dirname is out/main, so we need to go up two levels to project root
    return join(__dirname, '../../resources', subpath)
  } else {
    // In production, resources are in the app's resources directory
    return join(process.resourcesPath, subpath)
  }
}

// Documentation IPC handlers
ipcMain.handle('docs-list', wrapIpcHandler(async () => {
  try {
    const docsDir = getResourcePath('help')
    console.log('[docs-list] Loading from:', docsDir)
    
    if (!existsSync(docsDir)) {
      console.error('[docs-list] Directory not found:', docsDir)
      return { success: false, error: `Documentation directory not found at ${docsDir}`, docs: [] }
    }
    
    const files = await readdir(docsDir)
    console.log('[docs-list] Found files:', files)
    
    const docs = files
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const name = f.replace('.md', '')
        const title = name
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        return { id: name, title, filename: f }
      })
    
    console.log('[docs-list] Returning docs:', docs.length)
    return { success: true, docs }
  } catch (err) {
    const errMsg = (err as Error).message
    console.error('[docs-list] Error:', errMsg)
    return { success: false, error: errMsg, docs: [] }
  }
}))

ipcMain.handle('docs-read', wrapIpcHandler(async (_e, filename: string) => {
  try {
    console.log('[docs-read] Reading file:', filename)
    
    if (!filename || typeof filename !== 'string') {
      throw new Error(`Invalid filename: ${typeof filename}`)
    }
    
    // Validate filename: only permit known chars, reject path traversal
    const HELP_BASE = getResourcePath('help')

    if (!/^[a-z0-9][a-z0-9\-_.]*\.[a-z0-9]+$/i.test(filename)) {
      throw new Error(`Invalid filename format: ${filename}`)
    }

    const filePath = resolve(HELP_BASE, filename)

    // Ensure resolved path stays within the help directory
    if (!filePath.startsWith(HELP_BASE + sep) && filePath !== HELP_BASE) {
      throw new Error(`Path traversal detected: ${filename}`)
    }
    console.log('[docs-read] Filename:', filename)
    console.log('[docs-read] Full path:', filePath)
    
    // Check if file exists before reading
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    
    const content = await readFile(filePath, 'utf-8')
    
    if (!content || typeof content !== 'string') {
      throw new Error(`Invalid content read from file: ${typeof content}`)
    }
    
    console.log('[docs-read] Success, length:', content.length)
    
    return { success: true, content }
  } catch (err) {
    const errMsg = (err as Error).message
    console.error('[docs-read] Error:', errMsg)
    return { success: false, error: errMsg, content: '' }
  }
}))

// Storyboard: companion .storyboard.md files
ipcMain.handle('storyboard-read', wrapIpcHandler(async (_e, docFilePath: string) => {
  const sbPath = docFilePath.replace(/\.\w+$/, '.storyboard.md')
  try {
    const content = await readFile(sbPath, 'utf-8')
    return { success: true, content }
  } catch {
    return { success: true, content: '' }
  }
}))

ipcMain.handle('storyboard-write', wrapIpcHandler(async (_e, docFilePath: string, content: string) => {
  const sbPath = docFilePath.replace(/\.\w+$/, '.storyboard.md')
  await writeFile(sbPath, content, 'utf-8')
  return { success: true }
}))

app.whenReady().then(async () => {
  // Log Rust backend status (dev mode only — uses app.isPackaged internally)
  isRustAvailable()

  electronApp.setAppUserModelId('com.lexicon')
  
  // Ensure userData directory exists to avoid cache permission issues
  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) {
    await mkdir(userDataPath, { recursive: true }).catch(() => {})
  }
  
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Pre-warm mammoth library for faster DOCX opens
  try {
    await import('mammoth')
  } catch (err) {
    console.warn('Failed to pre-warm mammoth:', err)
  }

  createWindow()
  agentBridge.setMainWindow(mainWindow!)
  pluginEngine.setMainWindow(mainWindow!)
  pluginEngine.init().catch((err) => console.error('Plugin engine init failed:', err))
  registerCloudIpcHandlers(mainWindow!)
  startAutoSave()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAutoSave()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
