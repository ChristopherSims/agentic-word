/**
 * Per-run registry (updates-2.md §B): overlapping runs keep independent
 * cancellation and tool approvals.
 */

import { describe, expect, it } from 'vitest'
import { RunRegistry } from '../../src/main/memory/run-registry'

describe('run registry (§B)', () => {
  it('gives each run an independent abort signal', () => {
    const registry = new RunRegistry()
    const a = registry.begin({ documentId: 'doc-a', sessionId: 'doc-a:Writer' })
    const b = registry.begin({ documentId: 'doc-b', sessionId: 'doc-b:Reviewer' })
    expect(registry.size()).toBe(2)
    expect(a.signal.aborted).toBe(false)
    expect(b.signal.aborted).toBe(false)

    registry.abort(a.runId)
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(false) // unrelated run unaffected

    registry.end(a.runId)
    expect(registry.size()).toBe(1)
    expect(registry.activeRunId()).toBe(b.runId)
  })

  it('captures immutable scope and resolves approvals without cross-talk', () => {
    const registry = new RunRegistry()
    const a = registry.begin({ documentId: 'doc-a', branchId: 'main', policyEpoch: 3 })
    const b = registry.begin({ documentId: 'doc-b' })
    expect(a.scope).toMatchObject({ documentId: 'doc-a', branchId: 'main', policyEpoch: 3, runId: a.runId })

    const resolved: string[] = []
    registry.setPendingApproval(a.runId, { resolve: (ok) => resolved.push(`a:${ok}`), toolName: 'document_write', args: {} })
    registry.setPendingApproval(b.runId, { resolve: (ok) => resolved.push(`b:${ok}`), toolName: 'memory_clear', args: {} })

    // Most recently registered resolves first, then the earlier one.
    expect(registry.resolveApproval(true)).toBe(true)
    expect(registry.resolveApproval(false)).toBe(true)
    expect(resolved).toEqual(['b:true', 'a:false'])
    expect(registry.resolveApproval(true)).toBe(false) // nothing pending
  })

  it('binds runs to the initiating renderer for approvals and aborts', () => {
    const registry = new RunRegistry()
    const a = registry.begin({ documentId: 'doc-a', rendererId: 1 })
    const b = registry.begin({ documentId: 'doc-b', rendererId: 2 })
    expect(a.scope.rendererId).toBe(1)

    const resolved: string[] = []
    registry.setPendingApproval(a.runId, { resolve: (ok) => resolved.push(`a:${ok}`), toolName: 'document_write', args: {} })
    registry.setPendingApproval(b.runId, { resolve: (ok) => resolved.push(`b:${ok}`), toolName: 'memory_clear', args: {} })

    // Renderer 1 cannot resolve renderer 2's (most recent) approval.
    expect(registry.resolveApprovalFor(1, true)).toBe(true)
    expect(resolved).toEqual(['a:true'])
    expect(registry.resolveApprovalFor(1, true)).toBe(false)

    // Renderer 2 still owns its pending approval.
    expect(registry.resolveApprovalFor(2, false)).toBe(true)
    expect(resolved).toEqual(['a:true', 'b:false'])

    // Aborting for renderer 2 does not cancel renderer 1's run.
    registry.abortFor(2)
    expect(a.signal.aborted).toBe(false)
    expect(b.signal.aborted).toBe(true)
  })

  it('keeps main-owned (unbound) runs resolvable and abortable', () => {
    const registry = new RunRegistry()
    const internal = registry.begin({ documentId: 'internal' })
    const owned = registry.begin({ documentId: 'doc', rendererId: 7 })

    const resolved: string[] = []
    registry.setPendingApproval(internal.runId, { resolve: (ok) => resolved.push(`internal:${ok}`), toolName: 't', args: {} })
    expect(registry.resolveApprovalFor(7, true)).toBe(true)
    expect(resolved).toEqual(['internal:true'])

    registry.abortFor(7)
    expect(internal.signal.aborted).toBe(true)
    expect(owned.signal.aborted).toBe(true)
  })
})
