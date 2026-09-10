/**
 * §B/R5: per-run async context — overlapping runs never observe each other's
 * document/protection scope.
 */

import { describe, expect, it } from 'vitest'
import { runWithScope, currentRunScope } from '../../src/main/memory/run-context'
import type { RunScope } from '../../src/main/memory/run-registry'

const scope = (documentId: string, protectedRun = false): RunScope => ({
  runId: documentId,
  documentId,
  documentPath: '',
  branchId: '',
  revisionId: null,
  snapshotHash: '',
  sessionId: '',
  profileId: '',
  policyEpoch: 0,
  rendererId: null,
  protected: protectedRun
})

describe('per-run async context (§B/R5)', () => {
  it('exposes the scope to awaited continuations and clears afterwards', async () => {
    await runWithScope(scope('doc-a'), async () => {
      await Promise.resolve()
      expect(currentRunScope()?.documentId).toBe('doc-a')
    })
    expect(currentRunScope()).toBeUndefined()
  })

  it('keeps overlapping runs isolated', async () => {
    const seen: string[] = []
    const work = (id: string, delay: number, protectedRun = false) =>
      runWithScope(scope(id, protectedRun), async () => {
        await new Promise((r) => setTimeout(r, delay))
        seen.push(currentRunScope()!.documentId)
        await new Promise((r) => setTimeout(r, 5))
        seen.push(currentRunScope()!.documentId)
      })

    await Promise.all([work('doc-a', 10), work('doc-b', 0, true)])
    expect(seen.filter((d) => d === 'doc-a')).toHaveLength(2)
    expect(seen.filter((d) => d === 'doc-b')).toHaveLength(2)
  })

  it('restores the outer scope after a nested run', async () => {
    await runWithScope(scope('outer'), async () => {
      await runWithScope(scope('inner'), async () => {
        expect(currentRunScope()?.documentId).toBe('inner')
      })
      expect(currentRunScope()?.documentId).toBe('outer')
    })
  })
})
