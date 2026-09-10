/**
 * Deletion coordinator (updates-2.md §D).
 *
 * Owns the durable lifecycle of a deletion operation so completion is decided
 * by a persisted job state — not by a resolved Promise or a single boolean.
 * Jobs live in the ledger's `deletion_jobs` table and survive restart; a job
 * left `pending` (for example, the sidecar was unavailable) is resumed on the
 * next startup before its sources are treated as readable.
 */

import { randomUUID } from 'node:crypto'
import type {
  ArtifactCounts,
  DeletionJobStatus,
  DeletionKind,
  DeletionResult
} from '../../shared/types'
import { emptyArtifactCounts, type AgentLedger } from './ledger'
import { ControlStore } from './control-store'

export { emptyArtifactCounts }

export class DeletionCoordinator {
  private readonly control: ControlStore
  constructor(control: ControlStore | AgentLedger) {
    this.control = control instanceof ControlStore ? control : ControlStore.fromLedger(control)
  }

  /** Record a new deletion job and return its operation id. */
  begin(kind: DeletionKind, documentId: string | null): string {
    const operationId = `del_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
    this.control.createDeletionJob(operationId, kind, documentId)
    return operationId
  }

  complete(operationId: string, removed: ArtifactCounts): DeletionResult {
    this.control.updateDeletionJob(operationId, 'complete', removed, [], null)
    return { state: 'complete', operationId, removed }
  }

  pending(
    operationId: string,
    remaining: string[],
    removed: ArtifactCounts = emptyArtifactCounts()
  ): DeletionResult {
    this.control.updateDeletionJob(operationId, 'pending', removed, remaining, null)
    return { state: 'pending', operationId, remaining }
  }

  failed(operationId: string, code: string, remaining: string[] = []): DeletionResult {
    this.control.updateDeletionJob(operationId, 'failed', emptyArtifactCounts(), remaining, code)
    return { state: 'failed', operationId, code }
  }

  status(operationId: string): DeletionJobStatus | null {
    return this.control.getDeletionJob(operationId)
  }

  pendingJobs(): DeletionJobStatus[] {
    return this.control.listDeletionJobs('pending')
  }

  allJobs(): DeletionJobStatus[] {
    return this.control.listDeletionJobs()
  }
}
