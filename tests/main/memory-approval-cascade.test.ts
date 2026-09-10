/**
 * Approval cascade (updates-2.md §F): rejecting a source invalidates the
 * active summaries derived from it, transitively.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'

let dir: string
let store: AgentMemoryStore

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-approval-cascade-'))
  store = new AgentMemoryStore(join(dir, 'memory.json'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('approval cascade (§F)', () => {
  it('supersedes derived summaries when a source is rejected', () => {
    const source = store.add('doc-1', 'user', 'fact', 'Source fact', 'explicit', 'document')
    const summary = store.add('doc-1', 'system', 'summary', 'Summary of source fact', 'inferred', 'document', {
      approvalState: 'approved'
    })
    // Link lineage.
    const stored = store.getEntry(summary.id)!
    stored.derivedFrom = [source.id]
    store.setApproval(summary.id, 'approved')
    expect(store.formatForPrompt('doc-1')).toContain('Summary of source fact')

    store.setApproval(source.id, 'rejected')

    const reloaded = store.getEntry(summary.id)!
    expect(reloaded.approvalState).toBe('superseded')
    expect(store.formatForPrompt('doc-1')).not.toContain('Summary of source fact')
    // The rejected source is retained as evidence, not deleted.
    expect(store.getEntry(source.id)?.approvalState).toBe('rejected')
  })

  it('cascades transitively through nested summaries', () => {
    const a = store.add('doc-1', 'user', 'fact', 'Base fact', 'explicit', 'document')
    const b = store.add('doc-1', 'system', 'summary', 'Mid summary', 'inferred', 'document', { approvalState: 'approved' })
    const c = store.add('doc-1', 'system', 'summary', 'Top summary', 'inferred', 'document', { approvalState: 'approved' })
    store.getEntry(b.id)!.derivedFrom = [a.id]
    store.getEntry(c.id)!.derivedFrom = [b.id]

    store.setApproval(a.id, 'rejected')

    expect(store.getEntry(b.id)?.approvalState).toBe('superseded')
    expect(store.getEntry(c.id)?.approvalState).toBe('superseded')
  })
})
