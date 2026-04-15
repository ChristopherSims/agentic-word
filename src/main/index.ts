import { app, shell, BrowserWindow, ipcMain, dialog, Menu, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DocumentStore } from './document-store'
import { VcsEngine } from './vcs-engine'
import { AgentBridge } from './agent-bridge'

let mainWindow: BrowserWindow | null = null
const docStore = new DocumentStore()
const vcsEngine = new VcsEngine()
const agentBridge = new AgentBridge(vcsEngine, docStore)

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
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('file-new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => handleOpen() },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('file-save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => handleSaveAs() },
        { type: 'separator' },
        { label: 'Export PDF...', click: () => handleExportPdf() },
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
        { label: 'Find...', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('find-open') },
        { label: 'Find and Replace...', accelerator: 'CmdOrCtrl+H', click: () => mainWindow?.webContents.send('find-replace-open') }
      ]
    },
    {
      label: 'View',
      submenu: [
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
    filters: [{ name: 'Documents', extensions: ['docx', 'html', 'txt', 'md'] }]
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const content = await docStore.openFile(filePath)
    mainWindow?.webContents.send('file-opened', { filePath, content })
  }
}

async function handleSaveAs(): Promise<void> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'Text', extensions: ['txt'] }
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

// IPC handlers
ipcMain.handle('vcs-commit', async (_e, message: string, content: string) => {
  return vcsEngine.commit(message, content)
})

ipcMain.handle('vcs-log', async () => {
  return vcsEngine.log()
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

ipcMain.handle('vcs-revert', async (_e, commitId: string) => {
  return vcsEngine.revert(commitId)
})

ipcMain.handle('vcs-current-branch', async () => {
  return vcsEngine.currentBranch()
})

ipcMain.handle('agent-chat', async (_e, messages: Array<{ role: string; content: string }>) => {
  return agentBridge.handleChat(messages)
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wordapp')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
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
