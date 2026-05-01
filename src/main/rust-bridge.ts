/**
 * Rust Core native addon bridge.
 * Imports the napi-rs compiled .node addon and exposes a typed API
 * for the Electron main process to use.
 */
import { join } from 'path'
import { app } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rustCore = require(join(__dirname, '../../native/rust-core.node'))

// Exported ping for testing
export function ping(): string {
  return rustCore.ping() as string
}

export function initializeRustCore(): void {
  const userDataPath = app.getPath('userData')
  const result = rustCore.ping() as string
  console.log('[RustCore] initialized —', result)
}
