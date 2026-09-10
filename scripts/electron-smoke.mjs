/**
 * Packaged Electron smoke test (updates-2.md §G).
 *
 * Launches the built/packaged app with an isolated user-data directory and
 * drives the real renderer `window.wordapp` API over actual IPC — boot, preload
 * bridge, memory save/get/forget, consent get/set and memory status.
 *
 * Usage:
 *   node scripts/electron-smoke.mjs [--package <win-unpacked dir>] [--timeout <ms>]
 *
 * With no packaged build present it launches the dev build via the Electron
 * binary and out/main/index.js. Fails (exit 1) on any assertion failure;
 * use `--soft` to report and exit 0 when a display/launch is unavailable.
 */

import { _electron as electron } from 'playwright-core'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function argValue(name) {
  const idx = process.argv.indexOf(name)
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null
}
const SOFT = process.argv.includes('--soft')
const TIMEOUT = Number(argValue('--timeout') ?? 120_000)

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}
function ok(msg) {
  console.log(`✓ ${msg}`)
}

function findPackagedExecutable(explicit) {
  const roots = explicit ? [resolve(explicit)] : ['dist/win-unpacked', 'dist/mac', 'dist/linux-unpacked']
  const names = ['Lexicon.exe', 'Lexicon.app/Contents/MacOS/Lexicon', 'lexicon']
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const name of names) {
      const candidate = join(root, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function findElectronBinary() {
  const base = join('node_modules', 'electron', 'dist')
  const candidates = process.platform === 'win32'
    ? [join(base, 'electron.exe')]
    : process.platform === 'darwin'
      ? [join(base, 'Electron.app', 'Contents', 'MacOS', 'Electron')]
      : [join(base, 'electron')]
  return candidates.find((c) => existsSync(c)) ?? null
}

async function main() {
  const packaged = findPackagedExecutable(argValue('--package'))
  const electronBinary = findElectronBinary()
  let executablePath
  let args
  if (packaged) {
    executablePath = resolve(packaged)
    args = []
    console.log(`Packaged app: ${executablePath}`)
  } else if (electronBinary && existsSync('out/main/index.js')) {
    executablePath = resolve(electronBinary)
    args = [resolve('out/main/index.js')]
    console.log(`Dev build via Electron: ${executablePath} out/main/index.js`)
  } else {
    fail('No packaged build (dist/*-unpacked) and no dev Electron build (out/main/index.js) found.')
    return
  }

  const userData = mkdtempSync(join(tmpdir(), 'lexicon-electron-smoke-'))
  const env = {
    ...process.env,
    // Electron derives app.getPath('userData') from %APPDATA% on Windows (and
    // HOME/XDG elsewhere) — isolate it so the smoke never touches real data.
    ...(process.platform === 'win32'
      ? { APPDATA: userData, LOCALAPPDATA: userData }
      : { HOME: userData, XDG_CONFIG_HOME: userData }),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
  }

  let app
  try {
    app = await electron.launch({ executablePath, args, env, timeout: TIMEOUT })
    const page = await app.firstWindow({ timeout: TIMEOUT })
    await page.waitForFunction(() => Boolean(window.wordapp?.agent), null, { timeout: TIMEOUT })
    ok('app booted; preload bridge (window.wordapp.agent) is available')

    const status = await page.evaluate(() => window.wordapp.agent.memoryStatus())
    if (!status || typeof status.state !== 'string') throw new Error(`unexpected memory status: ${JSON.stringify(status)}`)
    ok(`memory status: ${status.state}`)

    const saved = await page.evaluate(() => window.wordapp.agent.memorySave('packaged-smoke-doc', 'fact', 'PACKAGED_SMOKE_FACT', 'document'))
    if (!saved?.id) throw new Error('memorySave did not return an entry id')
    const listed = await page.evaluate(() => window.wordapp.agent.memoryGet('packaged-smoke-doc'))
    if (!listed.some((e) => e.content === 'PACKAGED_SMOKE_FACT')) throw new Error('saved memory was not retrievable')
    ok('memory save → get round-trip')

    const forgot = await page.evaluate((id) => window.wordapp.agent.memoryForget(id), saved.id)
    if (forgot?.state === 'failed') throw new Error(`forget failed: ${JSON.stringify(forgot)}`)
    const afterForget = await page.evaluate(() => window.wordapp.agent.memoryGet('packaged-smoke-doc'))
    if (afterForget.some((e) => e.content === 'PACKAGED_SMOKE_FACT')) throw new Error('forgotten memory is still retrievable')
    ok(`memory forget → gone round-trip (state ${forgot?.state})`)

    const before = await page.evaluate(() => window.wordapp.agent.consentGet())
    await page.evaluate(() => window.wordapp.agent.consentSet({ crossDocumentPreferences: false }))
    const changed = await page.evaluate(() => window.wordapp.agent.consentGet())
    if (changed.crossDocumentPreferences !== false) throw new Error('consent change did not take effect')
    await page.evaluate((restore) => window.wordapp.agent.consentSet(restore), before)
    ok('consent get → set round-trip (restored)')
  } catch (err) {
    if (SOFT) {
      console.log(`… packaged Electron smoke skipped: ${err.message}`)
      process.exitCode = 0
      return
    }
    fail(`packaged Electron smoke failed: ${err.message}`)
  } finally {
    try { await app?.close() } catch { /* already gone */ }
    try { rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch { /* held briefly */ }
  }

  console.log(process.exitCode ? 'ELECTRON SMOKE FAILED' : 'ELECTRON SMOKE PASSED')
}

// Hard cap so a wedged app can never hang CI forever.
const bail = setTimeout(() => {
  fail(`packaged Electron smoke exceeded ${TIMEOUT}ms`)
  process.exit(1)
}, TIMEOUT + 30_000)
bail.unref?.()

main().catch((err) => {
  fail(`packaged Electron smoke crashed: ${err.message}`)
  console.log('ELECTRON SMOKE FAILED')
})
