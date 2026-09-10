/**
 * Ledger driver abstraction (updates-2.md §A).
 *
 * The ledger's durability contract is exposed as an async `LedgerDriver`:
 * - `InProcessLedgerDriver` wraps `AgentLedger` and resolves immediately
 *   (tests/dev, and the synchronous read paths).
 * - `WorkerLedgerDriver` talks to a single writer running in a worker thread
 *   / Electron utility process, so SQLite work leaves the main thread while
 *   reads continue to be served from the in-memory snapshot.
 *
 * Mutating operations are async here; the store keeps synchronous reads over
 * its in-memory Maps.
 */

import { Worker, MessageChannel } from 'node:worker_threads'
import * as path from 'path'
import type { AgentSession } from '../../shared/types'
import {
  AgentLedger,
  type ControlSnapshot,
  type MemoryLedgerState,
  type MemoryMigrationManifest,
  type ProjectionGenerationState
} from './ledger'

export type OutboxItem = { id: number; documentId: string; eventId: string; sequence: number }

export interface LedgerDriver {
  readonly kind: 'in-process' | 'worker'
  schemaVersion(): Promise<number>
  isInitialized(metaKey?: string): Promise<boolean>
  loadMemoryState(): Promise<MemoryLedgerState>
  writeMemoryState(state: MemoryLedgerState, manifest?: MemoryMigrationManifest): Promise<void>
  loadSessions(): Promise<AgentSession[]>
  writeSessions(sessions: AgentSession[]): Promise<void>
  listOutbox(state?: 'pending' | 'done'): Promise<OutboxItem[]>
  markOutboxDone(ids: number[]): Promise<number>
  listMigrationManifests(): Promise<MemoryMigrationManifest[]>
  loadControl(): Promise<ControlSnapshot>
  writeControl(patch: Partial<ControlSnapshot>): Promise<void>
  compact(): Promise<void>
  close(): Promise<void>
}

/** In-process driver — delegates to an AgentLedger synchronously. */
export class InProcessLedgerDriver implements LedgerDriver {
  readonly kind = 'in-process' as const
  constructor(private readonly ledger: AgentLedger) {}

  async schemaVersion(): Promise<number> { return this.ledger.schemaVersion() }
  async isInitialized(metaKey?: string): Promise<boolean> { return this.ledger.isInitialized(metaKey) }
  async loadMemoryState(): Promise<MemoryLedgerState> { return this.ledger.loadMemoryState() }
  async writeMemoryState(state: MemoryLedgerState, manifest?: MemoryMigrationManifest): Promise<void> {
    this.ledger.writeMemoryState(state, manifest)
  }
  async loadSessions(): Promise<AgentSession[]> { return this.ledger.loadSessions() }
  async writeSessions(sessions: AgentSession[]): Promise<void> { this.ledger.writeSessions(sessions) }
  async listOutbox(state: 'pending' | 'done' = 'pending'): Promise<OutboxItem[]> { return this.ledger.listOutbox(state) }
  async markOutboxDone(ids: number[]): Promise<number> { return this.ledger.markOutboxDone(ids) }
  async listMigrationManifests(): Promise<MemoryMigrationManifest[]> { return this.ledger.listMigrationManifests() }
  async loadControl(): Promise<ControlSnapshot> {
    return {
      jobs: this.ledger.listDeletionJobs(),
      policies: this.ledger.listDocumentPolicies(),
      generations: this.ledger.listProjectionGenerations()
    }
  }
  async writeControl(patch: Partial<ControlSnapshot>): Promise<void> {
    for (const job of patch.jobs ?? []) this.ledger.putDeletionJob(job)
    for (const policy of patch.policies ?? []) {
      this.ledger.upsertDocumentPolicy(policy.documentId, {
        branchId: policy.branchId,
        protected: policy.protected,
        revoked: policy.revoked,
        policyEpoch: policy.policyEpoch
      }, policy.updatedAt)
    }
    for (const generation of patch.generations ?? []) this.ledger.upsertProjectionGeneration(generation)
  }
  async compact(): Promise<void> { this.ledger.compact() }
  async close(): Promise<void> { /* no persistent connection */ }

  /** The underlying synchronous ledger (used by the store's read paths). */
  get syncLedger(): AgentLedger { return this.ledger }
}

/** Minimal channel the worker driver needs (MessagePort-compatible). */
export interface WorkerChannel {
  postMessage(message: unknown): void
  on(event: 'message', listener: (message: unknown) => void): void
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** Async driver over a worker-thread / utility-process transport. */
export class WorkerLedgerDriver implements LedgerDriver {
  readonly kind = 'worker' as const
  private nextId = 1
  private readonly pending = new Map<number, PendingCall>()
  private closed = false

  constructor(
    private readonly channel: WorkerChannel,
    private readonly opts: { timeoutMs?: number; terminate?: () => void } = {}
  ) {
    this.channel.on('message', (message) => this.handle(message))
  }

  private handle(raw: unknown): void {
    const message = raw as { id?: number; ok?: boolean; result?: unknown; error?: string }
    if (typeof message?.id !== 'number') return
    const call = this.pending.get(message.id)
    if (!call) return
    this.pending.delete(message.id)
    clearTimeout(call.timer)
    if (message.ok) call.resolve(message.result)
    else call.reject(new Error(message.error || 'ledger worker error'))
  }

  private call(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('ledger driver is closed'))
    const timeoutMs = this.opts.timeoutMs ?? 20_000
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`ledger op "${op}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.channel.postMessage({ id, op, params })
    })
  }

  async schemaVersion(): Promise<number> { return (await this.call('schemaVersion')) as number }
  async isInitialized(metaKey?: string): Promise<boolean> { return (await this.call('isInitialized', { metaKey })) as boolean }
  async loadMemoryState(): Promise<MemoryLedgerState> { return (await this.call('loadMemoryState')) as MemoryLedgerState }
  async writeMemoryState(state: MemoryLedgerState, manifest?: MemoryMigrationManifest): Promise<void> {
    await this.call('writeMemoryState', { state, manifest })
  }
  async loadSessions(): Promise<AgentSession[]> { return (await this.call('loadSessions')) as AgentSession[] }
  async writeSessions(sessions: AgentSession[]): Promise<void> { await this.call('writeSessions', { sessions }) }
  async listOutbox(state: 'pending' | 'done' = 'pending'): Promise<OutboxItem[]> {
    return (await this.call('listOutbox', { state })) as OutboxItem[]
  }
  async markOutboxDone(ids: number[]): Promise<number> { return (await this.call('markOutboxDone', { ids })) as number }
  async listMigrationManifests(): Promise<MemoryMigrationManifest[]> {
    return (await this.call('listMigrationManifests')) as MemoryMigrationManifest[]
  }
  async loadControl(): Promise<ControlSnapshot> {
    return (await this.call('loadControl')) as ControlSnapshot
  }
  async writeControl(patch: Partial<ControlSnapshot>): Promise<void> {
    await this.call('writeControl', { patch })
  }
  async compact(): Promise<void> { await this.call('compact') }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const [, call] of Array.from(this.pending)) {
      clearTimeout(call.timer)
      call.reject(new Error('ledger driver closed'))
    }
    this.pending.clear()
    this.opts.terminate?.()
  }
}

export interface CreateLedgerDriverOptions {
  useWorker?: boolean
  workerPath?: string
  timeoutMs?: number
}

/**
 * Create a driver. Defaults to in-process (tests/dev, synchronous reads); pass
 * `useWorker` with a built worker entrypoint to move SQLite off the main thread.
 */
export function createLedgerDriver(dbPath: string, opts: CreateLedgerDriverOptions = {}): LedgerDriver {
  if (!opts.useWorker) {
    return new InProcessLedgerDriver(new AgentLedger(dbPath))
  }
  if (!opts.workerPath) {
    throw new Error('createLedgerDriver: workerPath is required when useWorker is true')
  }
  const { port1, port2 } = new MessageChannel()
  const worker = new Worker(opts.workerPath, {
    workerData: { dbPath, port: port2 },
    transferList: [port2]
  })
  return new WorkerLedgerDriver(port1, {
    timeoutMs: opts.timeoutMs,
    terminate: () => { void worker.terminate() }
  })
}

export type { ProjectionGenerationState }

/**
 * Resolve the built ledger-worker entrypoint. Packaged builds run the worker
 * from the ASAR-unpacked copy (worker threads cannot load from inside asar);
 * dev runs it from the built `out/main` beside the main bundle.
 */
export function resolveLedgerWorkerPath(input: {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
  exists: (p: string) => boolean
}): string {
  if (input.isPackaged) {
    const unpacked = path.join(input.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'ledger-worker.js')
    if (input.exists(unpacked)) return unpacked
  }
  return path.join(input.appPath, 'out', 'main', 'ledger-worker.js')
}
