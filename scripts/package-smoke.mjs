/**
 * Package smoke checks (updates-2.md §H).
 *
 * Validates a packaged/unpacked build's layout and, against the bundled
 * Mnesis runtime, exercises the real worker protocol: version ping, create,
 * restart-resume, deletion and process cleanup.
 *
 * Usage:
 *   node scripts/package-smoke.mjs [--resources <unpacked resources dir>]
 *
 * With no argument it searches common electron-builder output directories.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PLATFORM_PY = process.platform === 'win32' ? 'python.exe' : 'bin/python3'

function argValue(name) {
  const idx = process.argv.indexOf(name)
  return idx !== -1 && process.argv[idx + 1] ? resolve(process.argv[idx + 1]) : null
}

function findResources() {
  const explicit = argValue('--resources')
  if (explicit) return explicit
  const candidates = []
  for (const base of ['dist', 'release', 'out']) {
    if (!existsSync(base)) continue
    for (const entry of statSafe(base)) {
      candidates.push(join(base, entry, 'resources'))
    }
    candidates.push(join(base, 'resources'))
  }
  return candidates.find((c) => existsSync(join(c, 'app.asar'))) ?? null
}

function statSafe(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

function ok(message) {
  console.log(`✓ ${message}`)
}

/** Minimal ndjson protocol client over a spawned worker process. */
function makeProtocol(proc) {
  let buffer = ''
  const pending = new Map()
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf-8')
    let idx
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      try {
        const frame = JSON.parse(line)
        const call = pending.get(frame.id)
        if (call) {
          pending.delete(frame.id)
          clearTimeout(call.timer)
          frame.ok ? call.resolve(frame.result) : call.reject(new Error(frame.error))
        }
      } catch { /* non-protocol output */ }
    }
  })
  let nextId = 1
  return (op, params = {}, timeoutMs = 20000) =>
    new Promise((resolvePromise, rejectPromise) => {
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        rejectPromise(new Error(`"${op}" timed out`))
      }, timeoutMs)
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer })
      proc.stdin.write(JSON.stringify({ id, op, params }) + '\n')
    })
}

function startWorker(python, workerPath, dbPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(python, [workerPath, '--db', dbPath, '--model', 'openai/gpt-4o'], {
      env: {
        SystemRoot: process.env.SystemRoot,
        PATH: process.env.PATH,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    proc.on('error', rejectPromise)
    const call = makeProtocol(proc)
    call('ping', {}, 15000).then((pong) => resolvePromise({ proc, call, pong }), rejectPromise)
  })
}

/**
 * Probe the packaged ledger runtime: `better-sqlite3` (native, ASAR-unpacked)
 * and the ledger worker, executed with the packaged Electron binary under
 * ELECTRON_RUN_AS_NODE so the native module loads against the Electron ABI.
 */
function probeLedgerRuntime(resources) {
  const unpacked = join(resources, 'app.asar.unpacked')
  const workerPath = join(unpacked, 'out', 'main', 'ledger-worker.js')
  const modulePath = join(unpacked, 'node_modules', 'better-sqlite3')
  const electronRoot = resolve(resources, '..')
  const electronExe = ['Lexicon.exe', 'lexicon', 'Lexicon'].map((n) => join(electronRoot, n)).find((p) => existsSync(p))

  if (!existsSync(workerPath)) { fail(`unpacked ledger worker missing: ${workerPath}`); return }
  ok('unpacked ledger worker present')
  if (!existsSync(modulePath)) { fail(`unpacked better-sqlite3 missing: ${modulePath}`); return }
  ok('unpacked better-sqlite3 present')
  if (!electronExe) { console.log('… packaged Electron binary not found — skipping native load probe'); return }

  const probe = `const { Worker, MessageChannel } = require('node:worker_threads')
const dbPath = process.argv[2], workerPath = process.argv[3], modulePath = process.argv[4]
try { require(modulePath) } catch (e) { console.error('BS3_LOAD_FAIL ' + e.message); process.exit(2) }
const { port1, port2 } = new MessageChannel()
const w = new Worker(workerPath, { workerData: { dbPath, port: port2 }, transferList: [port2] })
let id = 1
const call = (op, params) => new Promise((res, rej) => { const myid = id++; const t = setTimeout(() => rej(new Error('timeout')), 10000); const h = (m) => { if (m.id === myid) { port1.off('message', h); clearTimeout(t); m.ok ? res(m.result) : rej(new Error(m.error)) } }; port1.on('message', h); port1.postMessage({ id: myid, op, params }) })
;(async () => {
  await call('writeMemoryState', { state: { entries: [{ id: 'm1', documentId: 'd', agentName: 'u', type: 'fact', content: 'packaged', createdAt: 1, source: 'explicit', scope: 'document' }], suppressions: [], historicalEvents: [], quarantine: [] } })
  const s = await call('loadMemoryState')
  console.log('LEDGER_OK ' + s.entries.length + ' ' + s.entries[0].content)
  await w.terminate(); port1.close()
})().catch((e) => { console.error('LEDGER_FAIL ' + e.message); process.exit(3) })
`

  const dir = mkdtempSync(join(tmpdir(), 'lexicon-ledger-probe-'))
  const probePath = join(dir, 'probe.cjs')
  const dbPath = join(dir, 'probe.sqlite')
  writeFileSync(probePath, probe)
  const result = spawnSync(electronExe, [probePath, dbPath, workerPath, modulePath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf-8',
    timeout: 30000
  })
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status === 0 && out.includes('LEDGER_OK')) ok(`ledger native runtime probe: ${out.trim().split('\n').pop()}`)
  else fail(`ledger native runtime probe failed (status ${result.status}): ${out.trim()}`)
}


async function main() {
  const explicitWorker = argValue('--worker')
  const explicitPython = argValue('--python')
  const resources = explicitWorker && explicitPython ? null : findResources()

  if (!resources && !(explicitWorker && explicitPython)) {
    fail('No packaged resources dir found (pass --resources <dir>, or --worker/--python).')
    return
  }

  let workerPath
  let python
  if (resources) {
    console.log(`Packaged resources: ${resources}`)
    const asar = join(resources, 'app.asar')
    workerPath = join(resources, 'mnesis-worker', 'worker.py')
    python = join(resources, 'mnesis-runtime', PLATFORM_PY)

    if (existsSync(asar) && statSync(asar).size > 0) ok('app.asar present and non-empty')
    else fail('app.asar missing or empty')

    if (existsSync(workerPath)) ok('mnesis-worker/worker.py present')
    else fail('mnesis-worker/worker.py missing')
  } else {
    console.log(`Worker: ${explicitWorker}`)
    console.log(`Python: ${explicitPython}`)
    workerPath = explicitWorker
    python = explicitPython
  }

  if (!existsSync(workerPath)) {
    fail(`worker missing: ${workerPath}`)
    return
  }
  if (!existsSync(python)) {
    // The bundled Python runtime is optional (electron-builder ships the dir so
    // the app can fall back to system Python). Only enforce it when asked, or
    // when an explicit --python path was supplied.
    if (!resources || process.argv.includes('--require-runtime')) {
      fail(`bundled runtime missing: ${python}`)
      return
    }
    console.log(`… bundled Mnesis runtime not present at ${python} — skipping worker protocol smoke (pass --require-runtime to enforce)`)
    if (resources) probeLedgerRuntime(resources)
    console.log(process.exitCode ? 'PACKAGE SMOKE FAILED' : 'PACKAGE SMOKE PASSED')
    return
  }
  ok('bundled Mnesis runtime present')

  const dir = mkdtempSync(join(tmpdir(), 'lexicon-pkg-smoke-'))
  const db = join(dir, 'smoke.db')
  let worker
  try {
    // create + version ping
    worker = await startWorker(python, workerPath, db)
    const { pong, proc, call } = worker
    if (!pong?.mnesis) throw new Error('ping reports mnesis unavailable')
    if (!/^0\.3\./.test(String(pong.version))) throw new Error(`unexpected version ${pong.version}`)
    ok(`runtime ping: version ${pong.version}, protocol ${pong.protocol}`)

    const recorded = await call('record', { documentId: 'smoke-doc', userMessage: 'hello', assistantResponse: 'world' })
    if (!recorded?.sessionId) throw new Error('record did not return a session id')
    ok('create: recorded a turn')

    // Process cleanup: stop the worker and confirm it exits.
    const exited = new Promise((r) => proc.on('exit', () => r(true)))
    proc.kill()
    const didExit = await Promise.race([exited, new Promise((r) => setTimeout(() => r(false), 5000))])
    if (!didExit) fail('worker did not exit after kill')
    else ok('process cleanup: worker exited')

    // restart + resume (same db)
    worker = await startWorker(python, workerPath, db)
    const messages = await worker.call('messages', { documentId: 'smoke-doc' })
    if (messages.length !== 2) throw new Error(`expected 2 resumed messages, got ${messages.length}`)
    ok('restart: resumed prior history without a new session')

    const forgotten = await worker.call('forget', { documentId: 'smoke-doc' })
    if (forgotten.sessionsDeleted < 1) throw new Error('forget did not delete the session')
    const afterForget = await worker.call('messages', { documentId: 'smoke-doc' })
    if (afterForget.length !== 0) throw new Error('history still present after forget')
    ok('deletion: forget removed the session and history')

    const shutdownExit = new Promise((r) => worker.proc.on('exit', () => r(true)))
    await worker.call('shutdown', {})
    const shutdownOk = await Promise.race([shutdownExit, new Promise((r) => setTimeout(() => r(false), 5000))])
    if (!shutdownOk) fail('worker did not exit after shutdown')
    else ok('process cleanup: shutdown exit')
  } catch (err) {
    fail(`runtime smoke failed: ${err.message}`)
  } finally {
    try { worker?.proc.kill() } catch { /* already gone */ }
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch { /* held briefly */ }
  }

  if (resources) probeLedgerRuntime(resources)

  console.log(process.exitCode ? 'PACKAGE SMOKE FAILED' : 'PACKAGE SMOKE PASSED')
}

main()
