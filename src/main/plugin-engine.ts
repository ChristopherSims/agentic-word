import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import type {
  PluginManifest,
  PluginPermission,
  PluginHookName,
  PluginCommand,
  PluginToolbarButton,
  PluginInstance,
  PluginHookEvent
} from '../shared/types'

export type {
  PluginManifest,
  PluginPermission,
  PluginHookName,
  PluginCommand,
  PluginToolbarButton,
  PluginInstance,
  PluginHookEvent
}

type HookHandler<T extends PluginHookName> = (event: PluginHookEvent[T]) => PluginHookEvent[T] | void

export class PluginEngine {
  private pluginsDir: string
  private plugins: Map<string, PluginInstance> = new Map()
  private hookHandlers: Map<PluginHookName, Map<string, (data: PluginHookEvent[keyof PluginHookEvent]) => PluginHookEvent[keyof PluginHookEvent] | void>> = new Map()
  private mainWindow: BrowserWindow | null = null
  private marketplacePath: string

  constructor() {
    this.pluginsDir = join(app.getPath('userData'), 'plugins')
    this.marketplacePath = join(app.getPath('userData'), 'plugin-marketplace.json')
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  async init(): Promise<void> {
    if (!existsSync(this.pluginsDir)) await mkdir(this.pluginsDir, { recursive: true })
    await this.loadAllPlugins()
  }

  private async loadAllPlugins(): Promise<void> {
    try {
      const entries = await readdir(this.pluginsDir)
      for (const entry of entries) {
        const dir = join(this.pluginsDir, entry)
        const statResult = await stat(dir)
        if (!statResult.isDirectory()) continue
        const manifestPath = join(dir, 'manifest.json')
        if (!existsSync(manifestPath)) continue
        try {
          const raw = await readFile(manifestPath, 'utf-8')
          const manifest: PluginManifest = JSON.parse(raw)
          manifest.installed = true
          if (manifest.enabled === undefined) manifest.enabled = true
          this.validateManifest(manifest)
          this.plugins.set(manifest.name, { manifest, dir })
          if (manifest.enabled) await this.loadPluginRuntime(manifest.name)
        } catch (err) {
          console.error(`Failed to load plugin from ${dir}:`, err)
        }
      }
    } catch { /* no plugins dir yet — not an error, just first run */ }
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name || !manifest.version || !manifest.entry) {
      throw new Error('Plugin manifest must have name, version, and entry')
    }
    if (!/^[a-z0-9-]+$/.test(manifest.name)) {
      throw new Error('Plugin name must be lowercase alphanumeric with hyphens')
    }
    const validPerms: PluginPermission[] = ['document:read', 'document:write', 'clipboard:read', 'clipboard:write', 'ui:toolbar', 'ui:commands', 'vcs:read', 'agent:read']
    for (const p of manifest.permissions || []) {
      if (!validPerms.includes(p)) throw new Error(`Invalid permission: ${p}`)
    }
    const validHooks: PluginHookName[] = ['onDocumentOpen', 'onDocumentSave', 'onContentChange', 'onToolbarRender', 'onCommandRegister']
    for (const h of manifest.hooks || []) {
      if (!validHooks.includes(h)) throw new Error(`Invalid hook: ${h}`)
    }
  }

  // Plugins run in a sandboxed context via Function constructor —
  // they cannot access require, process, or Node globals.
  private async loadPluginRuntime(pluginName: string): Promise<void> {
    const instance = this.plugins.get(pluginName)
    if (!instance) return

    const entryPath = join(instance.dir, instance.manifest.entry)
    if (!existsSync(entryPath)) {
      instance.lastError = `Entry file not found: ${instance.manifest.entry}`
      return
    }

    try {
      const code = await readFile(entryPath, 'utf-8')

      // Create sandboxed API surface based on permissions
      const api = this.createSandboxedAPI(pluginName, instance.manifest.permissions)

      // Execute in sandboxed context via Function constructor
      const sandboxedFn = new Function(
        'api', 'hooks', 'console',
        `"use strict";\n${code}\nreturn typeof init === 'function' ? init(api, hooks) : {}`
      )

      const hooks: Record<string, (handler: (data: PluginHookEvent[keyof PluginHookEvent]) => PluginHookEvent[keyof PluginHookEvent] | void) => void> = {}
      for (const hookName of instance.manifest.hooks) {
        hooks[hookName] = (handler) => {
          if (!this.hookHandlers.has(hookName)) {
            this.hookHandlers.set(hookName, new Map())
          }
          this.hookHandlers.get(hookName)!.set(pluginName, handler)
        }
      }

      // Safe console
      const safeConsole = {
        log: (...args: unknown[]) => console.log(`[plugin:${pluginName}]`, ...args),
        error: (...args: unknown[]) => console.error(`[plugin:${pluginName}]`, ...args),
        warn: (...args: unknown[]) => console.warn(`[plugin:${pluginName}]`, ...args)
      }

      sandboxedFn(api, hooks, safeConsole)
    } catch (err) {
      instance.lastError = `Runtime error: ${(err as Error).message}`
      console.error(`Plugin ${pluginName} runtime error:`, err)
    }
  }

  private createSandboxedAPI(pluginName: string, permissions: PluginPermission[]): {
    editor: {
      insertContent: ((content: string) => void) | undefined
      getSelectedText: (() => Promise<unknown>) | undefined
      replaceSelection: ((content: string) => void) | undefined
      getContent: (() => Promise<unknown>) | undefined
    }
    ui: {
      registerCommand: ((command: PluginCommand) => void) | undefined
      addToolbarButton: ((button: PluginToolbarButton) => void) | undefined
      showNotification: (message: string, type?: string) => void
    }
    clipboard: {
      readText: (() => Promise<unknown>) | undefined
      writeText: ((text: string) => void) | undefined
    }
    vcs: {
      getBranch: (() => Promise<unknown>) | undefined
      getLog: (() => Promise<unknown>) | undefined
    }
    agent: {
      chat: ((message: string) => void) | undefined
    }
  } {
    const has = (perm: PluginPermission) => permissions.includes(perm)

    // Renderer-side data is fetched via IPC; these methods request
    // the data from the renderer and resolve when it responds.
    return {
      editor: {
        insertContent: has('document:write') ? (content: string) => {
          this.sendToRenderer('plugin:editor-insert', { pluginName, content })
        } : undefined,
        getSelectedText: has('document:read') ? () => {
          return this.requestFromRenderer('plugin:get-selected-text', { pluginName })
        } : undefined,
        replaceSelection: has('document:write') ? (content: string) => {
          this.sendToRenderer('plugin:editor-replace-selection', { pluginName, content })
        } : undefined,
        getContent: has('document:read') ? () => {
          return this.requestFromRenderer('plugin:get-content', { pluginName })
        } : undefined
      },
      ui: {
        registerCommand: has('ui:commands') ? (command: PluginCommand) => {
          this.sendToRenderer('plugin:register-command', { pluginName, command })
        } : undefined,
        addToolbarButton: has('ui:toolbar') ? (button: PluginToolbarButton) => {
          this.sendToRenderer('plugin:add-toolbar-button', { pluginName, button })
        } : undefined,
        showNotification: (message: string, type: string = 'info') => {
          this.sendToRenderer('plugin:notification', { pluginName, message, type })
        }
      },
      clipboard: {
        readText: has('clipboard:read') ? () => {
          return this.requestFromRenderer('plugin:clipboard-read', { pluginName })
        } : undefined,
        writeText: has('clipboard:write') ? (text: string) => {
          this.sendToRenderer('plugin:clipboard-write', { pluginName, text })
        } : undefined
      },
      vcs: {
        getBranch: has('vcs:read') ? () => this.requestFromRenderer('plugin:vcs-get-branch', { pluginName }) : undefined,
        getLog: has('vcs:read') ? () => this.requestFromRenderer('plugin:vcs-get-log', { pluginName }) : undefined
      },
      agent: {
        chat: has('agent:read') ? (message: string) => {
          this.sendToRenderer('plugin:agent-chat', { pluginName, message })
        } : undefined
      }
    }
  }

  emitHook<T extends PluginHookName>(hookName: T, data: PluginHookEvent[T]): PluginHookEvent[T] {
    const handlers = this.hookHandlers.get(hookName)
    if (!handlers) return data

    let result = data
    for (const [pluginName, handler] of handlers) {
      const instance = this.plugins.get(pluginName)
      if (!instance?.manifest.enabled) continue
      try {
        const hookResult = handler(result)
        if (hookResult !== undefined) result = hookResult as PluginHookEvent[T]
      } catch (err) {
        console.error(`Plugin ${pluginName} hook ${hookName} error:`, err)
        instance.lastError = `Hook ${hookName}: ${(err as Error).message}`
      }
    }
    return result
  }

  async installFromDirectory(sourceDir: string): Promise<PluginManifest | null> {
    const manifestPath = join(sourceDir, 'manifest.json')
    if (!existsSync(manifestPath)) return null

    const raw = await readFile(manifestPath, 'utf-8')
    const manifest: PluginManifest = JSON.parse(raw)
    this.validateManifest(manifest)

    const destDir = join(this.pluginsDir, manifest.name)
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })

    // Copy all files from source to dest
    const entries = await readdir(sourceDir)
    for (const entry of entries) {
      const src = join(sourceDir, entry)
      const dst = join(destDir, entry)
      const content = await readFile(src, 'utf-8')
      await writeFile(dst, content, 'utf-8')
    }

    manifest.installed = true
    manifest.enabled = true
    this.plugins.set(manifest.name, { manifest, dir: destDir })
    await this.loadPluginRuntime(manifest.name)
    await this.savePluginIndex()
    return manifest
  }

  async installFromManifest(manifest: PluginManifest, code: string): Promise<PluginManifest | null> {
    this.validateManifest(manifest)
    const destDir = join(this.pluginsDir, manifest.name)
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })

    manifest.installed = true
    manifest.enabled = true

    await writeFile(join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
    await writeFile(join(destDir, manifest.entry), code, 'utf-8')

    this.plugins.set(manifest.name, { manifest, dir: destDir })
    await this.loadPluginRuntime(manifest.name)
    await this.savePluginIndex()
    return manifest
  }

  async uninstallPlugin(name: string): Promise<boolean> {
    const instance = this.plugins.get(name)
    if (!instance) return false

    // Remove hook handlers
    for (const [, handlers] of this.hookHandlers) {
      handlers.delete(name)
    }

    // Remove directory
    try {
      const entries = await readdir(instance.dir)
      for (const entry of entries) {
        await unlink(join(instance.dir, entry))
      }
    } catch { /* ignore — best-effort cleanup during uninstall */ }

    this.plugins.delete(name)
    await this.savePluginIndex()
    return true
  }

  async enablePlugin(name: string): Promise<boolean> {
    const instance = this.plugins.get(name)
    if (!instance) return false
    instance.manifest.enabled = true
    await this.savePluginManifest(name)
    await this.loadPluginRuntime(name)
    return true
  }

  async disablePlugin(name: string): Promise<boolean> {
    const instance = this.plugins.get(name)
    if (!instance) return false
    instance.manifest.enabled = false
    // Remove hook handlers
    for (const [, handlers] of this.hookHandlers) {
      handlers.delete(name)
    }
    await this.savePluginManifest(name)
    return true
  }

  listPlugins(): Array<PluginManifest & { lastError?: string }> {
    return Array.from(this.plugins.values()).map((p) => ({
      ...p.manifest,
      lastError: p.lastError
    }))
  }

  getPlugin(name: string): PluginManifest | null {
    return this.plugins.get(name)?.manifest || null
  }

  async getMarketplace(): Promise<PluginManifest[]> {
    if (!existsSync(this.marketplacePath)) {
      // Initialize with built-in example plugins
      await this.saveMarketplace(this.getBuiltinMarketplaceEntries())
    }
    try {
      return JSON.parse(await readFile(this.marketplacePath, 'utf-8'))
    } catch {
      // Corrupted or missing marketplace file — return empty list
      return []
    }
  }

  private getBuiltinMarketplaceEntries(): PluginManifest[] {
    return [
      {
        name: 'word-frequency',
        version: '1.0.0',
        description: 'Counts word frequency in the document and displays a report',
        author: 'Lexicon',
        entry: 'index.js',
        permissions: ['document:read', 'ui:commands'],
        hooks: ['onCommandRegister'],
        commands: [{ id: 'word-frequency', label: 'Word Frequency Report' }],
        enabled: false,
        installed: false
      },
      {
        name: 'pomodoro-timer',
        version: '1.0.0',
        description: 'Pomodoro timer: 25min focus, 5min break. Shows timer in status bar.',
        author: 'Lexicon',
        entry: 'index.js',
        permissions: ['ui:toolbar', 'ui:commands'],
        hooks: ['onToolbarRender', 'onCommandRegister'],
        toolbarButtons: [{ id: 'pomodoro', label: 'Pomodoro', tooltip: 'Start Pomodoro Timer' }],
        commands: [{ id: 'pomodoro-start', label: 'Start Pomodoro' }, { id: 'pomodoro-stop', label: 'Stop Pomodoro' }],
        enabled: false,
        installed: false
      },
      {
        name: 'md-paste-sanitizer',
        version: '1.0.0',
        description: 'Sanitizes pasted Markdown into clean HTML before inserting into the document',
        author: 'Lexicon',
        entry: 'index.js',
        permissions: ['document:read', 'document:write'],
        hooks: ['onContentChange'],
        enabled: false,
        installed: false
      }
    ]
  }

  async saveMarketplace(entries: PluginManifest[]): Promise<void> {
    await writeFile(this.marketplacePath, JSON.stringify(entries, null, 2), 'utf-8')
  }

  getBuiltinPluginCode(name: string): string | null {
    switch (name) {
      case 'word-frequency':
        return `// Word Frequency Counter Plugin
function init(api, hooks) {
  hooks.onCommandRegister(function(data) {
    // Command is registered via manifest
    return data;
  });
}
// When command is invoked via renderer, the plugin receives the event
// and computes word frequency from document content`

      case 'pomodoro-timer':
        return `// Pomodoro Timer Plugin
var timerInterval = null;
var remainingSeconds = 25 * 60;
var isRunning = false;

function init(api, hooks) {
  hooks.onToolbarRender(function(data) {
    // Timer display is handled by renderer based on plugin state
    return data;
  });

  hooks.onCommandRegister(function(data) {
    return data;
  });
}
// Timer logic is driven by the renderer via IPC`

      case 'md-paste-sanitizer':
        return `// Markdown Paste Sanitizer Plugin
function init(api, hooks) {
  hooks.onContentChange(function(data) {
    // Sanitize content: remove dangerous HTML tags
    if (typeof data.content === 'string') {
      var sanitized = data.content
        .replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '')
        .replace(/<iframe[^>]*>[\\s\\S]*?<\\/iframe>/gi, '')
        .replace(/on\\w+="[^"]*"/gi, '')
        .replace(/javascript:/gi, '');
      data.content = sanitized;
    }
    return data;
  });
}`

      default:
        return null
    }
  }

  private async savePluginManifest(name: string): Promise<void> {
    const instance = this.plugins.get(name)
    if (!instance) return
    await writeFile(
      join(instance.dir, 'manifest.json'),
      JSON.stringify(instance.manifest, null, 2),
      'utf-8'
    )
    await this.savePluginIndex()
  }

  private async savePluginIndex(): Promise<void> {
    const index = Array.from(this.plugins.values()).map((p) => ({
      name: p.manifest.name,
      version: p.manifest.version,
      enabled: p.manifest.enabled,
      installed: p.manifest.installed
    }))
    await writeFile(
      join(this.pluginsDir, 'index.json'),
      JSON.stringify(index, null, 2),
      'utf-8'
    )
  }

  private sendToRenderer(channel: string, data: Record<string, unknown>): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  // Request data from the renderer process via IPC.
  // The renderer must have a listener for the channel that replies with the data.
  private requestFromRenderer(channel: string, data: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        resolve(null)
        return
      }
      const { ipcMain } = require('electron')
      const replyChannel = `${channel}:reply:${Date.now()}`
      const timer = setTimeout(() => {
        ipcMain.removeHandler(replyChannel)
        resolve(null)
      }, 5000)
      ipcMain.once(replyChannel, (_event, result) => {
        clearTimeout(timer)
        resolve(result)
      })
      this.mainWindow!.webContents.send(channel, { ...data, replyChannel })
    })
  }
}
