/**
 * Per-run registry (updates-2.md §B).
 *
 * Replaces the shared single abort controller and single pending approval as
 * run-routing authorities. Each run carries an immutable scope captured at
 * invocation, its own AbortController, and its own pending tool approval, so
 * overlapping runs cannot cancel, approve, or misroute each other.
 *
 * Full renderer binding: runs capture the initiating webContents id and
 * approval/abort resolution refuses runs bound to a different renderer, so one
 * window cannot confirm or cancel another window's run.
 */

export interface RunScope {
  runId: string
  documentId: string
  /** Legacy file path for disk-backed tools (storyboard, export). */
  documentPath: string
  branchId: string
  revisionId: string | null
  snapshotHash: string
  sessionId: string
  profileId: string
  policyEpoch: number
  /** webContents id of the renderer that initiated the run, when bound. */
  rendererId: number | null
  /** true when the run is in ephemeral/protected mode (no persistence). */
  protected: boolean
}

export interface PendingApproval {
  resolve: (approved: boolean) => void
  toolName: string
  args: Record<string, unknown>
}

export interface BeginRunInput {
  runId?: string
  documentId: string
  documentPath?: string
  branchId?: string
  revisionId?: string | null
  snapshotHash?: string
  sessionId?: string
  profileId?: string
  policyEpoch?: number
  rendererId?: number | null
  protected?: boolean
}

export interface RunHandle {
  runId: string
  scope: RunScope
  signal: AbortSignal
}

interface RunState {
  scope: RunScope
  controller: AbortController
  pendingApproval: PendingApproval | null
}

export class RunRegistry {
  private runs = new Map<string, RunState>()
  private order: string[] = []

  begin(input: BeginRunInput): RunHandle {
    const runId = input.runId ?? `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const scope: RunScope = {
      runId,
      documentId: input.documentId,
      documentPath: input.documentPath ?? '',
      branchId: input.branchId ?? '',
      revisionId: input.revisionId ?? null,
      snapshotHash: input.snapshotHash ?? '',
      sessionId: input.sessionId ?? '',
      profileId: input.profileId ?? '',
      policyEpoch: input.policyEpoch ?? 0,
      rendererId: input.rendererId ?? null,
      protected: input.protected ?? false
    }
    const controller = new AbortController()
    this.runs.set(runId, { scope, controller, pendingApproval: null })
    this.order.push(runId)
    return { runId, scope, signal: controller.signal }
  }

  end(runId: string): void {
    this.runs.delete(runId)
    this.order = this.order.filter((id) => id !== runId)
  }

  get(runId: string): RunState | undefined {
    return this.runs.get(runId)
  }

  size(): number {
    return this.order.length
  }

  /** Most recently begun still-open run. */
  activeRunId(): string | null {
    return this.order.length > 0 ? this.order[this.order.length - 1] : null
  }

  /** Immutable scope of the most recently begun still-open run. */
  activeScope(): RunScope | undefined {
    const id = this.activeRunId()
    return id ? this.runs.get(id)?.scope : undefined
  }

  /** Immutable scope of one run by id. */
  scopeOf(runId: string): RunScope | undefined {
    return this.runs.get(runId)?.scope
  }

  activeSignal(): AbortSignal | undefined {
    const id = this.activeRunId()
    return id ? this.runs.get(id)?.controller.signal : undefined
  }

  isAborted(): boolean {
    return this.order.some((id) => this.runs.get(id)?.controller.signal.aborted)
  }

  abort(runId: string): void {
    this.runs.get(runId)?.controller.abort()
  }

  abortAll(): number {
    let count = 0
    for (const id of [...this.order]) {
      const run = this.runs.get(id)
      if (run && !run.controller.signal.aborted) { run.controller.abort(); count++ }
    }
    return count
  }

  setPendingApproval(runId: string, approval: PendingApproval): void {
    const run = this.runs.get(runId)
    if (run) run.pendingApproval = approval
  }

  /** Resolve the most recently registered pending approval, if any. */
  resolveApproval(approved: boolean): boolean {
    return this.resolveApprovalFor(undefined, approved)
  }

  /**
   * Resolve the most recent pending approval for a renderer. A run explicitly
   * bound to another renderer is never resolved; main-owned runs (no renderer)
   * remain resolvable by everyone so internal flows keep working.
   */
  resolveApprovalFor(rendererId: number | undefined, approved: boolean): boolean {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const run = this.runs.get(this.order[i])
      if (!run?.pendingApproval) continue
      if (run.scope.rendererId !== null && run.scope.rendererId !== rendererId) continue
      run.pendingApproval.resolve(approved)
      run.pendingApproval = null
      return true
    }
    return false
  }

  /** Abort runs belonging to a renderer (plus any main-owned runs). Returns the number newly cancelled. */
  abortFor(rendererId: number): number {
    let count = 0
    for (const id of [...this.order]) {
      const run = this.runs.get(id)
      if (run && !run.controller.signal.aborted && (run.scope.rendererId === null || run.scope.rendererId === rendererId)) {
        run.controller.abort()
        count++
      }
    }
    return count
  }
}
