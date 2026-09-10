/**
 * Control-state store (updates-2.md §A/§B/§D/§E).
 *
 * Deletion jobs, document policy and projection generations share one cache so
 * the main thread never has to read SQLite synchronously. In-process it writes
 * through to the ledger; on the worker path it is write-behind, committed by
 * `flush()` through the single-writer driver.
 */

import type { ArtifactCounts, DeletionJobStatus, DeletionKind, DeletionState } from '../../shared/types'
import {
  emptyArtifactCounts,
  type ControlSnapshot,
  type DocumentPolicy,
  type ProjectionGeneration,
  type ProjectionGenerationState
} from './ledger'
import { InProcessLedgerDriver, type LedgerDriver } from './ledger-driver'
import { AgentLedger } from './ledger'

export class ControlStore {
  private readonly ledger: AgentLedger | null
  private readonly jobs = new Map<string, DeletionJobStatus>()
  private readonly policies = new Map<string, DocumentPolicy>()
  private readonly generations = new Map<string, ProjectionGeneration>()
  private readonly dirtyJobs = new Set<string>()
  private readonly dirtyPolicies = new Set<string>()
  private readonly dirtyGenerations = new Set<string>()
  private flushChain: Promise<void> = Promise.resolve()

  constructor(private readonly driver: LedgerDriver) {
    this.ledger = driver.kind === 'in-process' ? (driver as InProcessLedgerDriver).syncLedger : null
    if (this.ledger) this.loadFromLedger(this.ledger)
  }

  /** Wrap an in-process ledger (convenience for callers/tests). */
  static fromLedger(ledger: AgentLedger): ControlStore {
    return new ControlStore(new InProcessLedgerDriver(ledger))
  }

  get workerBacked(): boolean {
    return this.ledger === null
  }

  /** Worker path: load the authoritative control state before serving reads. */
  async init(): Promise<void> {
    if (!this.workerBacked) return
    this.applySnapshot(await this.driver.loadControl())
  }

  private loadFromLedger(ledger: AgentLedger): void {
    this.applySnapshot({
      jobs: ledger.listDeletionJobs(),
      policies: ledger.listDocumentPolicies(),
      generations: ledger.listProjectionGenerations()
    })
  }

  private applySnapshot(snapshot: ControlSnapshot): void {
    this.jobs.clear()
    this.policies.clear()
    this.generations.clear()
    for (const j of snapshot.jobs) this.jobs.set(j.operationId, j)
    for (const p of snapshot.policies) this.policies.set(p.documentId, p)
    for (const g of snapshot.generations) this.generations.set(g.generationId, g)
  }

  // ─── deletion jobs ───

  createDeletionJob(operationId: string, kind: DeletionKind, documentId: string | null, now: number = Date.now()): void {
    const job: DeletionJobStatus = {
      operationId, kind, documentId, state: 'pending',
      removed: emptyArtifactCounts(), remaining: [], code: null,
      requestedAt: now, updatedAt: now
    }
    this.jobs.set(operationId, job)
    if (this.ledger) this.ledger.createDeletionJob(operationId, kind, documentId, now)
    else this.dirtyJobs.add(operationId)
  }

  updateDeletionJob(
    operationId: string,
    state: DeletionState,
    removed: ArtifactCounts,
    remaining: string[],
    code: string | null,
    now: number = Date.now()
  ): void {
    const current = this.jobs.get(operationId)
    const job: DeletionJobStatus = {
      operationId,
      kind: current?.kind ?? 'clear-document',
      documentId: current?.documentId ?? null,
      state, removed, remaining, code,
      requestedAt: current?.requestedAt ?? now,
      updatedAt: now
    }
    this.jobs.set(operationId, job)
    if (this.ledger) this.ledger.updateDeletionJob(operationId, state, removed, remaining, code, now)
    else this.dirtyJobs.add(operationId)
  }

  getDeletionJob(operationId: string): DeletionJobStatus | null {
    return this.jobs.get(operationId) ?? null
  }

  listDeletionJobs(state?: DeletionState): DeletionJobStatus[] {
    const jobs = Array.from(this.jobs.values()).sort((a, b) => a.requestedAt - b.requestedAt)
    return state ? jobs.filter((j) => j.state === state) : jobs
  }

  // ─── document policy ───

  getDocumentPolicy(documentId: string): DocumentPolicy | null {
    return this.policies.get(documentId) ?? null
  }

  /** Known document ids from policy/projection state (for attribution checks). */
  documentIds(): string[] {
    const ids = new Set<string>(this.policies.keys())
    for (const generation of Array.from(this.generations.values())) ids.add(generation.documentId)
    return Array.from(ids)
  }

  upsertDocumentPolicy(
    documentId: string,
    updates: Partial<Pick<DocumentPolicy, 'branchId' | 'protected' | 'revoked' | 'policyEpoch'>>,
    now: number = Date.now()
  ): void {
    const current = this.policies.get(documentId) ?? null
    const next: DocumentPolicy = {
      documentId,
      branchId: updates.branchId !== undefined ? updates.branchId : (current?.branchId ?? null),
      // Renderer flags may tighten protection but never downgrade it (§B).
      protected: updates.protected === false && current?.revoked
        ? true
        : (updates.protected ?? current?.protected ?? false),
      revoked: updates.revoked ?? current?.revoked ?? false,
      policyEpoch: updates.policyEpoch ?? current?.policyEpoch ?? 0,
      updatedAt: now
    }
    this.policies.set(documentId, next)
    if (this.ledger) {
      this.ledger.upsertDocumentPolicy(documentId, updates, now)
    } else {
      this.dirtyPolicies.add(documentId)
    }
  }

  // ─── projection generations ───

  upsertProjectionGeneration(generation: ProjectionGeneration): void {
    this.generations.set(generation.generationId, generation)
    if (this.ledger) this.ledger.upsertProjectionGeneration(generation)
    else this.dirtyGenerations.add(generation.generationId)
  }

  getProjectionGeneration(generationId: string): ProjectionGeneration | null {
    return this.generations.get(generationId) ?? null
  }

  listProjectionGenerations(documentId?: string): ProjectionGeneration[] {
    const generations = Array.from(this.generations.values()).sort((a, b) => a.createdAt - b.createdAt)
    return documentId ? generations.filter((g) => g.documentId === documentId) : generations
  }

  setProjectionGenerationState(generationId: string, state: ProjectionGenerationState, now: number = Date.now()): void {
    const generation = this.generations.get(generationId)
    if (generation) this.generations.set(generationId, { ...generation, state })
    if (this.ledger) this.ledger.setProjectionGenerationState(generationId, state, now)
    else this.dirtyGenerations.add(generationId)
  }

  /**
   * Atomically activate one generation for a document, superseding all other
   * non-disposed generations (R11/§E) — reflected in the cache and persisted.
   */
  activateProjectionGeneration(generationId: string): void {
    const generation = this.generations.get(generationId)
    if (!generation) throw new Error(`Unknown projection generation: ${generationId}`)
    for (const other of Array.from(this.generations.values())) {
      if (other.documentId === generation.documentId && other.state === 'active' && other.generationId !== generationId) {
        this.generations.set(other.generationId, { ...other, state: 'superseded' })
        if (!this.ledger) this.dirtyGenerations.add(other.generationId)
      }
    }
    this.generations.set(generationId, { ...generation, state: 'active' })
    if (this.ledger) this.ledger.activateProjectionGeneration(generationId)
    else this.dirtyGenerations.add(generationId)
  }

  /** Worker path: commit any write-behind control changes. */
  async flush(): Promise<void> {
    if (!this.workerBacked) return
    const run = this.flushChain.then(() => this.flushOnce())
    this.flushChain = run.then(() => undefined, () => undefined)
    return await run
  }

  private async flushOnce(): Promise<void> {
    if (this.dirtyJobs.size === 0 && this.dirtyPolicies.size === 0 && this.dirtyGenerations.size === 0) return
    const patch: Partial<ControlSnapshot> = {}
    const jobIds = Array.from(this.dirtyJobs)
    const policyIds = Array.from(this.dirtyPolicies)
    const generationIds = Array.from(this.dirtyGenerations)
    if (jobIds.length) patch.jobs = jobIds.map((id) => this.jobs.get(id)!).filter(Boolean)
    if (policyIds.length) patch.policies = policyIds.map((id) => this.policies.get(id)!).filter(Boolean)
    if (generationIds.length) patch.generations = generationIds.map((id) => this.generations.get(id)!).filter(Boolean)
    try {
      await this.driver.writeControl(patch)
      for (const id of jobIds) this.dirtyJobs.delete(id)
      for (const id of policyIds) this.dirtyPolicies.delete(id)
      for (const id of generationIds) this.dirtyGenerations.delete(id)
    } catch (err) {
      throw err
    }
  }
}
