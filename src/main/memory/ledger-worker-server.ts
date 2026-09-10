/**
 * Worker-side ledger server (updates-2.md §A). Executes driver requests
 * against a single `AgentLedger` and replies. Pure w.r.t. transport so it can
 * be exercised over any MessagePort-shaped channel.
 */

import { AgentLedger, type ControlSnapshot, type MemoryLedgerState, type MemoryMigrationManifest } from './ledger'
import type { WorkerChannel } from './ledger-driver'

interface Request { id?: number; op?: string; params?: Record<string, unknown> }

export class LedgerWorkerServer {
  constructor(
    private readonly ledger: AgentLedger,
    private readonly channel: WorkerChannel
  ) {
    this.channel.on('message', (message) => { void this.handle(message) })
  }

  private async handle(raw: unknown): Promise<void> {
    const request = raw as Request
    if (typeof request?.id !== 'number') return
    try {
      const result = await this.execute(request.op ?? '', request.params ?? {})
      this.channel.postMessage({ id: request.id, ok: true, result })
    } catch (err) {
      this.channel.postMessage({ id: request.id, ok: false, error: (err as Error).message })
    }
  }

  private async execute(op: string, params: Record<string, unknown>): Promise<unknown> {
    switch (op) {
      case 'schemaVersion': return this.ledger.schemaVersion()
      case 'isInitialized': return this.ledger.isInitialized(params.metaKey as string | undefined)
      case 'loadMemoryState': return this.ledger.loadMemoryState()
      case 'writeMemoryState':
        return this.ledger.writeMemoryState(
          params.state as MemoryLedgerState,
          params.manifest as MemoryMigrationManifest | undefined
        )
      case 'loadSessions': return this.ledger.loadSessions()
      case 'writeSessions': return this.ledger.writeSessions(params.sessions as never[])
      case 'listOutbox': return this.ledger.listOutbox((params.state as 'pending' | 'done') ?? 'pending')
      case 'markOutboxDone': return this.ledger.markOutboxDone(params.ids as number[])
      case 'listMigrationManifests': return this.ledger.listMigrationManifests()
      case 'loadControl': return {
        jobs: this.ledger.listDeletionJobs(),
        policies: this.ledger.listDocumentPolicies(),
        generations: this.ledger.listProjectionGenerations()
      }
      case 'writeControl': {
        const patch = params.patch as Partial<ControlSnapshot>
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
        return null
      }
      case 'compact': return this.ledger.compact()
      default: throw new Error(`unknown ledger op "${op}"`)
    }
  }
}
