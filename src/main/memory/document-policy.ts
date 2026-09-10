/**
 * Main-owned document policy (updates-2.md §B).
 *
 * Protection and revocation are stored by stable document ID in the ledger,
 * never derived from whichever tab is active. Renderer flags may tighten
 * restrictions (mark a run protected) but may not downgrade authoritative
 * protection: a protected run neither reads nor writes retained document
 * memory, and revocation is durable until an explicit, scoped grant.
 */

import { AgentLedger, type DocumentPolicy as DocumentPolicyRecord } from './ledger'
import { ControlStore } from './control-store'

export class DocumentPolicy {
  private readonly control: ControlStore
  constructor(control: ControlStore | AgentLedger) {
    this.control = control instanceof ControlStore ? control : ControlStore.fromLedger(control)
  }

  private record(documentId: string): DocumentPolicyRecord | null {
    return this.control.getDocumentPolicy(documentId)
  }

  isProtected(documentId: string): boolean {
    return this.record(documentId)?.protected ?? false
  }

  isRevoked(documentId: string): boolean {
    return this.record(documentId)?.revoked ?? false
  }

  policyEpoch(documentId: string): number {
    return this.record(documentId)?.policyEpoch ?? 0
  }

  /** Mark a document protected (idempotent; never downgrades a revocation). */
  protect(documentId: string, branchId?: string | null): void {
    this.control.upsertDocumentPolicy(documentId, {
      protected: true,
      ...(branchId !== undefined ? { branchId } : {})
    })
  }

  /** Explicit user action may release protection (unless revoked). */
  setProtected(documentId: string, protectedNow: boolean): void {
    this.control.upsertDocumentPolicy(documentId, { protected: protectedNow })
  }

  /**
   * Durable deny rule: revoked documents can never be recalled or rebuilt.
   * Bumps the policy epoch so in-flight jobs for the old epoch are invalid.
   */
  revoke(documentId: string): number {
    const epoch = this.policyEpoch(documentId) + 1
    this.control.upsertDocumentPolicy(documentId, { revoked: true, protected: true, policyEpoch: epoch })
    return epoch
  }

  /**
   * A fresh, explicit access grant clears the deny rule. It does NOT restore
   * deleted rows or replay previously revoked data (§B/§D), and it bumps the
   * epoch so stale work cannot commit against the old policy.
   */
  grant(documentId: string): number {
    const epoch = this.policyEpoch(documentId) + 1
    this.control.upsertDocumentPolicy(documentId, { revoked: false, policyEpoch: epoch })
    return epoch
  }

  /**
   * Advance the policy epoch without changing protection/revocation (§F):
   * a deletion or other scope change invalidates in-flight jobs that captured
   * an earlier epoch. Returns the new epoch.
   */
  bumpEpoch(documentId: string): number {
    const epoch = this.policyEpoch(documentId) + 1
    this.control.upsertDocumentPolicy(documentId, { policyEpoch: epoch })
    return epoch
  }
}
