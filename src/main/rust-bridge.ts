/**
 * Rust Core native addon bridge.
 * Lazy-loads the napi-rs compiled .node addon. Falls back to stub if
 * the native addon is not built or is incompatible with the current platform.
 * The app functions normally without the Rust backend.
 */
import { join } from 'path'
import { app } from 'electron'

type RustCoreAddon = {
  ping(): string
  RustCore: new (userDataPath: string) => {
    status(): string
    openDocument(filePath: string): any
    saveDocument(filePath: string, pmJson: string): void
    htmlToPm(html: string): string
    pmToHtml(pmJson: string): string
    mdToPm(md: string): string
    pmToMd(pmJson: string): string
    exportPdf(pmJson: string, outputPath: string, title?: string): void
    encryptText(plaintext: string, password: string): string
    decryptText(ciphertext: string, nonce: string, salt: string, password: string): string
    analyzeDocument(pmJson: string): any
    vcsCommit(docId: string, message: string, pmJson: string, branch: string, author?: string): any
    vcsLog(docId: string, limit?: number): any[]
    vcsDiff(fromId: string, toId: string): any[]
    vcsGraph(docId: string): any[]
    vcsListBranches(docId: string, current: string): any[]
    vcsCreateBranch(docId: string, name: string, fromCommit?: string): void
    vcsMerge(docId: string, source: string, target: string, author?: string): string
    agentGetPresets(): any[]
    agentGetTools(): string
    searchDocuments(query: string, limit: number): any[]
  }
}

let _rustCore: RustCoreAddon | null = null

function loadAddon(): RustCoreAddon | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const addon = require(join(__dirname, '../../native/rust-core.node')) as RustCoreAddon
    if (!app.isPackaged) {
      console.log('[RustCore] Native Rust backend loaded (dev mode)')
    }
    return addon
  } catch (e) {
    if (!app.isPackaged) {
      console.log('[RustCore] Native Rust backend NOT available (dev mode) — using TS fallback')
      console.log('[RustCore] Build native: napi build --release --js index.js --dts index.d.ts (in native/ dir)')
    } else {
      console.warn('[RustCore] Native addon not available — using TypeScript fallback:', (e as Error).message)
    }
    return null
  }
}

function getAddon(): RustCoreAddon | null {
  if (_rustCore === null) {
    _rustCore = loadAddon()
  }
  return _rustCore
}

export function isRustAvailable(): boolean {
  return getAddon() !== null
}

export function ping(): string {
  const addon = getAddon()
  if (addon) return addon.ping()
  return 'pong from TypeScript (Rust addon not loaded)'
}

export function initializeRustCore(): { core: any } | null {
  const addon = getAddon()
  if (!addon) return null

  try {
    const userDataPath = app.getPath('userData')
    const core = new addon.RustCore(userDataPath)
    console.log('[RustCore] initialized —', core.status())
    return { core }
  } catch (e) {
    console.error('[RustCore] Failed to initialize:', (e as Error).message)
    return null
  }
}
