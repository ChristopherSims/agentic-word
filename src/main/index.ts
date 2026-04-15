import { app, shell, BrowserWindow, ipcMain, dialog, Menu, session, webContents } from 'electron'
import { join, dirname, basename } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DocumentStore } from './document-store'
import { VcsEngine } from './vcs-engine'
import { AgentBridge } from './agent-bridge'
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'

let mainWindow: BrowserWindow | null = null
const docStore = new DocumentStore()
const vcsEngine = new VcsEngine()
const agentBridge = new AgentBridge(vcsEngine, docStore)

// Recent files — persisted to app data
const recentFilesPath = join(app.getPath('userData'), 'recent-files.json')
const MAX_RECENT = 10

async function loadRecentFiles(): Promise<string[]> {
  try { return JSON.parse(await readFile(recentFilesPath, 'utf-8')) } catch { return [] }
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
    title: 'Agentic Word',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Drag-and-drop file open
  mainWindow.webContents.on('file-drop', async (_event, files) => {
    if (files.length > 0) {
      const filePath = files[0]
      const ext = filePath.split('.').pop()?.toLowerCase()
      if (['docx', 'html', 'txt', 'md'].includes(ext || '')) {
        const content = await docStore.openFile(filePath)
        mainWindow?.webContents.send('file-opened', { filePath, content })
        await addRecentFile(filePath)
      }
    }
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
  const recentFiles = [] as string[] // Will be populated on rebuild

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('file-new') },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('tab-new') },
        { label: 'New from Template...', click: () => mainWindow?.webContents.send('file-new-template') },
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
        { label: 'Export PDF...', accelerator: 'CmdOrCtrl+Shift+E', click: () => handleExportPdf() },
        { label: 'Export Markdown...', click: () => handleExportMarkdown() },
        { label: 'Export EPUB...', click: () => handleExportEpub() },
        { type: 'separator' },
        { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => handlePrint() },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
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
    ]
  })
  if (!result.canceled && result.filePath) {
    mainWindow?.webContents.send('file-save-as', { filePath: result.filePath })
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
  mainWindow?.webContents.print()
}

// Auto-save: periodically save if document is dirty and has a path
function startAutoSave(intervalMs: number = AUTO_SAVE_DEFAULT_MS): void {
  stopAutoSave()
  autoSaveInterval = setInterval(() => {
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
ipcMain.handle('vcs-commit', async (_e, message: string, content: string) => {
  return vcsEngine.commit(message, content)
})

ipcMain.handle('vcs-log', async () => {
  return vcsEngine.log()
})

ipcMain.handle('vcs-all-commits', async () => {
  return vcsEngine.allCommits()
})

ipcMain.handle('vcs-diff', async (_e, fromId?: string, toId?: string) => {
  return vcsEngine.diff(fromId, toId)
})

ipcMain.handle('vcs-branch-create', async (_e, name: string) => {
  return vcsEngine.createBranch(name)
})

ipcMain.handle('vcs-branch-switch', async (_e, name: string) => {
  return vcsEngine.switchBranch(name)
})

ipcMain.handle('vcs-branch-list', async () => {
  return vcsEngine.listBranches()
})

ipcMain.handle('vcs-branch-delete', async (_e, name: string) => {
  return vcsEngine.deleteBranch(name)
})

ipcMain.handle('vcs-revert', async (_e, commitId: string) => {
  return vcsEngine.revert(commitId)
})

ipcMain.handle('vcs-current-branch', async () => {
  return vcsEngine.currentBranch()
})

ipcMain.handle('vcs-merge', async (_e, sourceBranch: string, content: string, message?: string) => {
  return vcsEngine.merge(sourceBranch, content, message)
})

ipcMain.handle('vcs-cherry-pick', async (_e, commitId: string) => {
  return vcsEngine.cherryPick(commitId)
})

ipcMain.handle('vcs-tag-create', async (_e, name: string, commitId?: string) => {
  return vcsEngine.createTag(name, commitId)
})

ipcMain.handle('vcs-tag-delete', async (_e, name: string) => {
  return vcsEngine.deleteTag(name)
})

ipcMain.handle('vcs-tag-list', async () => {
  return vcsEngine.listTags()
})

ipcMain.handle('vcs-graph', async () => {
  return vcsEngine.graph()
})

ipcMain.handle('agent-chat', async (_e, messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string }) => {
  return agentBridge.handleChat(messages)
})

ipcMain.handle('agent-chat-stream', async (_e, messages: Array<{ role: string; content: string }>, context?: { documentContent?: string; currentBranch?: string; selection?: string }) => {
  // Fire-and-forget: results come back via IPC events
  agentBridge.handleChatStream(messages, context)
  return { started: true }
})

ipcMain.handle('agent-abort', async () => {
  agentBridge.abortStream()
  return { aborted: true }
})

ipcMain.handle('agent-execute-tool', async (_e, toolName: string, args: Record<string, unknown>) => {
  return agentBridge.executeTool(toolName, args)
})

ipcMain.handle('agent-list-tools', async () => {
  return agentBridge.listTools()
})

ipcMain.handle('agent-configure', async (_e, config: { endpoint?: string; apiKey?: string; model?: string }) => {
  return agentBridge.configure(config)
})

ipcMain.handle('agent-presets', async () => {
  return agentBridge.getPresets()
})

ipcMain.handle('agent-preset-add', async (_e, preset: { name: string; endpoint: string; apiKey: string; model: string }) => {
  return agentBridge.addPreset(preset)
})

ipcMain.handle('agent-preset-delete', async (_e, id: string) => {
  return agentBridge.deletePreset(id)
})

ipcMain.handle('agent-preset-apply', async (_e, id: string) => {
  return agentBridge.applyPreset(id)
})

ipcMain.handle('agent-scratchpad-get', async () => {
  return agentBridge.getScratchpad()
})

ipcMain.handle('agent-scratchpad-set', async (_e, content: string) => {
  agentBridge.setScratchpad(content)
  return { success: true }
})

// Export operations
ipcMain.handle('export-pdf', async (_e, filePath: string) => {
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
})

ipcMain.handle('export-markdown', async (_e, filePath: string, htmlContent: string) => {
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
})

// Templates
ipcMain.handle('template-list', async () => {
  return docStore.listTemplates()
})

ipcMain.handle('template-get', async (_e, name: string) => {
  return docStore.getTemplate(name)
})

// Save-as with format selection (extended)
ipcMain.handle('dialog-save-as', async (_e, formats?: Array<{ name: string; extensions: string[] }>) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: formats || [
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'PDF', extensions: ['pdf'] }
    ]
  })
  if (result.canceled) return null
  return result.filePath || null
})

ipcMain.handle('docx-import', async (_e, filePath: string) => {
  return docStore.openFile(filePath)
})

ipcMain.handle('docx-save', async (_e, filePath: string, content: string) => {
  await docStore.saveFile(filePath, content)
  return { success: true }
})

ipcMain.handle('dialog-open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Documents', extensions: ['docx', 'html', 'txt', 'md'] }]
  })
  if (result.canceled) return null
  return result.filePaths[0] || null
})

ipcMain.handle('dialog-save', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'HTML', extensions: ['html'] }
    ]
  })
  if (result.canceled) return null
  return result.filePath || null
})

// ─── Recent files ───
ipcMain.handle('recent-files', async () => {
  return loadRecentFiles()
})

ipcMain.handle('recent-files-clear', async () => {
  await saveRecentFiles([])
  rebuildMenu()
  return true
})

// ─── Custom templates ───
ipcMain.handle('custom-template-save', async (_e, name: string, content: string) => {
  await ensureTemplatesDir()
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = join(customTemplatesPath, `${safeName}.html`)
  await writeFile(filePath, content, 'utf-8')
  return { success: true, name: safeName }
})

ipcMain.handle('custom-template-list', async () => {
  await ensureTemplatesDir()
  try {
    const files = await readdir(customTemplatesPath)
    return files.filter((f) => f.endsWith('.html')).map((f) => ({
      name: f.replace('.html', ''),
      description: 'Custom template'
    }))
  } catch { return [] }
})

ipcMain.handle('custom-template-get', async (_e, name: string) => {
  await ensureTemplatesDir()
  const filePath = join(customTemplatesPath, `${name}.html`)
  try { return await readFile(filePath, 'utf-8') } catch { return null }
})

ipcMain.handle('custom-template-delete', async (_e, name: string) => {
  const filePath = join(customTemplatesPath, `${name}.html`)
  try { await unlink(filePath); return true } catch { return false }
})

// ─── EPUB export ───
ipcMain.handle('export-epub', async (_e, filePath: string, htmlContent: string) => {
  try {
    const { writeFile, mkdir } = await import('fs/promises')
    const { dirname } = await import('path')
    await mkdir(dirname(filePath), { recursive: true })

    // Minimal valid EPUB structure
    const id = `wordapp-${Date.now()}`
    const chapters = htmlContent.split(/(?=<h[1-3][^>]*>)/g).filter(Boolean)
    const chaptersHtml = chapters.map((ch, i) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${i + 1}</title></head><body>${ch}</body></html>`)

    const container = `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`

    const manifest = chaptersHtml.map((_, i) => `<item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')
    const spine = chaptersHtml.map((_, i) => `<itemref idref="ch${i}"/>`).join('\n')

    const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>Exported Document</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta></metadata><manifest>${manifest}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>${spine}</spine></package>`

    const nav = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>TOC</title></head><body><nav epub:type="toc"><h1>Table of Contents</h1><ol>${chaptersHtml.map((_, i) => `<li><a href="ch${i}.xhtml">Chapter ${i + 1}</a></li>`).join('')}</ol></nav></body></html>`

    // Build ZIP (EPUB is a ZIP) — use dynamic require for adm-zip
    let AdmZip: any = null
    try {
      AdmZip = require('adm-zip')
    } catch { /* adm-zip not installed */ }

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
})

// ─── Auto-update check ───
ipcMain.handle('check-for-updates', async () => {
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
})

// ─── Markdown preview (rendered HTML) ───
ipcMain.handle('markdown-to-html', async (_e, mdContent: string) => {
  const store = new DocumentStore()
  return store.markdownToHtml(mdContent)
})

// ─── Settings wiring to backend ───
ipcMain.handle('agent-configure-advanced', async (_e, opts: { maxToolTurns?: number; temperature?: number }) => {
  agentBridge.configureAdvanced(opts)
  return { success: true }
})

ipcMain.handle('agent-get-advanced', async () => {
  return { maxToolTurns: agentBridge.getMaxToolTurns(), temperature: agentBridge.getTemperature() }
})

ipcMain.handle('set-spellcheck-lang', async (_e, lang: string) => {
  if (mainWindow) {
    mainWindow.webContents.session.setSpellCheckerLanguages(lang ? [lang] : [])
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('open-image-dialog', async () => {
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
})

ipcMain.handle('vcs-auto-commit', async (_e, message: string, content: string) => {
  return vcsEngine.commit(message, content)
})

ipcMain.handle('vcs-prune-commits', async (_e, maxCommits: number) => {
  if (maxCommits <= 0) return { pruned: 0 }
  // Prune is handled client-side by limiting log display; engine keeps all
  return { pruned: 0 }
})

// ─── Smart Suggestions ───
ipcMain.handle('agent-suggest', async (_e, documentContent: string) => {
  return agentBridge.suggestImprovements(documentContent)
})

// ─── Doc Stats ───
ipcMain.handle('doc-stats', async (_e, htmlContent: string) => {
  const text = htmlContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').filter((w: string) => w.length > 0) : []
  const wordCount = words.length

  // Sentence count (rough: split on .!?)
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
})

// ─── Collab Server ───
let collabServer: any = null

ipcMain.handle('collab-start', async (_e, port: number) => {
  try {
    const serverModule = require('./collab-server')
    const result = serverModule.startServer(port || 12345)
    collabServer = serverModule
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('collab-stop', async () => {
  if (collabServer) { const result = collabServer.stopServer(); collabServer = null; return result }
  return { status: 'not-running' }
})

ipcMain.handle('collab-status', async () => {
  if (collabServer) return collabServer.getStatus()
  return { running: false }
})

ipcMain.handle('collab-generate-code', async () => {
  if (collabServer) return { code: collabServer.generateRoomCode() }
  return { code: null, error: 'Server not running' }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wordapp')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  agentBridge.setMainWindow(mainWindow!)
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
