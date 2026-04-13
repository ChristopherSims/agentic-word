import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DocumentStore } from './document-store'
import { VcsEngine } from './vcs-engine'
import { AgentBridge } from './agent-bridge'

let mainWindow: BrowserWindow | null = null
const docStore = new DocumentStore()
const vcsEngine = new VcsEngine()
const agentBridge = new AgentBridge(vcsEngine, docStore)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'WordApp',
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
        { label: 'Export PDF...', click: () => mainWindow?.webContents.send('file-export-pdf') },
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
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
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

ipcMain.handle('agent-chat', async (_e, messages: Array<{role: string; content: string}>) => {
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
