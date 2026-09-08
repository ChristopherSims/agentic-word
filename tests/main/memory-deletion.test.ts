/**
 * §11 deletion-flow completeness tests: lineage cascade, shingle-hash
 * anti-re-learning suppressions, filtered projection rebuild, and the
 * store-level forget/revoke persistence.
 */

import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  FORGET_LIMITS_NOTICE,
  PROJECTION_DISPOSAL_NOTE,
  filterTranscriptForRebuild,
  isSuppressedContent,
  normalizeForMatch,
  planForgetCascade,
  shingleHashes
} from '../../src/main/memory/deletion'
import { AgentMemoryStore } from '../../src/main/agent-memory'

describe('deletion primitives (pure)', () => {
  it('normalizes content for fingerprinting', () => {
    expect(normalizeForMatch('Hello, World! — HELLO   world')).toBe('hello world hello world')
  })

  it('shingle hashes never retain plaintext and match re-derivations', () => {
    const original = 'The user prefers British spelling: colour, flavour, and organise in all drafts'
    const hashes = shingleHashes(original)
    expect(hashes.length).toBeGreaterThan(0)
    // The hashes are opaque — none contains the content.
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]+$/)
    // A near-verbatim re-derivation matches…
    const rederived = 'Remember: the user prefers British spelling colour flavour and organise in all drafts'
    expect(isSuppressedContent(rederived, [{ entryId: 'x', documentId: 'd', scope: 'document', hashes, forgottenAt: 0 }])).toBe(true)
    // …unrelated content does not.
    expect(isSuppressedContent('The ridge trail was foggy at dawn', [{ entryId: 'x', documentId: 'd', scope: 'document', hashes, forgottenAt: 0 }])).toBe(false)
  })

  it('short contents produce a single whole-content shingle', () => {
    expect(shingleHashes('colour only')).toHaveLength(1)
    expect(shingleHashes('')).toHaveLength(0)
  })

  it('cascades derived entries transitively but not siblings', () => {
    const entries = [
      { id: 'a' },
      { id: 'b' },
      { id: 'sum1', derivedFrom: ['a', 'b'] },
      { id: 'sum2', derivedFrom: ['sum1'] },
      { id: 'unrelated', derivedFrom: ['zzz'] }
    ]
    const cascade = planForgetCascade('a', entries)
    expect(cascade).not.toBeNull()
    expect(cascade!.derivedIds).toEqual(['sum1', 'sum2'])
    expect(planForgetCascade('missing', entries)).toBeNull()
  })

  it('filters a transcript for rebuild — compaction summaries included', () => {
    const forgotten = 'User wants em dashes banned from all headings'
    const suppressions = [{ entryId: 'x', documentId: 'd', scope: 'document' as const, hashes: shingleHashes(forgotten), forgottenAt: 0 }]
    const transcript = [
      { role: 'system', content: '[Summary] The user wants em dashes banned from all headings; also likes short paragraphs.' },
      { role: 'user', content: 'Please remember: the user wants em dashes banned from all headings' },
      { role: 'user', content: 'no more em dashes in headings, please' },
      { role: 'assistant', content: 'unrelated answer about fog' }
    ]
    const { kept, dropped } = filterTranscriptForRebuild(transcript, suppressions)
    // The absorbed summary and the near-verbatim turn fall; hash-only
    // matching is deliberately near-verbatim, so a loose paraphrase
    // ("no more em dashes in headings") is NOT caught — the honest limit of
    // suppression without semantic matching.
    expect(dropped).toBe(2)
    expect(kept).toHaveLength(2)
    expect(kept.some((t) => t.content.includes('banned from all headings'))).toBe(false)
    expect(kept.some((t) => t.content.includes('no more em dashes'))).toBe(true)
    // No suppressions = identity.
    expect(filterTranscriptForRebuild(transcript, []).kept).toHaveLength(4)
  })

  it('carries the honest-limits and disposal notices', () => {
    expect(FORGET_LIMITS_NOTICE).toContain('does NOT')
    expect(FORGET_LIMITS_NOTICE).toContain('opt-back-in')
    expect(PROJECTION_DISPOSAL_NOTE).toContain('all-or-nothing')
  })
})

describe('store forget flow (§11)', () => {
  const tmpStore = (): { store: AgentMemoryStore; file: string } => {
    const file = path.join(os.tmpdir(), `agent-memory-forget-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    return { store: new AgentMemoryStore(file), file }
  }

  it('forget removes the entry, records suppressions, and persists them', () => {
    const { store, file } = tmpStore()
    try {
      store.add('doc1', 'assistant', 'preference', 'User prefers contractions and first person in blog drafts', 'inferred', 'document', { approvalState: 'candidate' })
      const id = store.getForDocument('doc1')[0].id
      const result = store.forget(id)
      expect(result?.removedIds).toEqual([id])
      expect(store.getForDocument('doc1')).toHaveLength(0)
      // Suppression is active…
      expect(store.isSuppressed('Remember: user prefers contractions and first person in blog drafts', 'doc1')).toBe(true)
      // …and survives a reload from disk (hashes only, no plaintext).
      const reloaded = new AgentMemoryStore(file)
      expect(reloaded.isSuppressed('user prefers contractions and first person in blog drafts', 'doc1')).toBe(true)
      const raw = fs.readFileSync(file, 'utf-8')
      expect(raw).not.toContain('contractions and first person')
      expect(raw).toContain('suppressions')
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  it('forget cascades to the consolidation summary that absorbed the source', () => {
    const { store, file } = tmpStore()
    try {
      // 11 active entries → consolidation of the oldest.
      for (let i = 0; i < 12; i++) {
        store.add('doc2', 'assistant', 'preference', `style note number ${i} for the novel fixture`, 'inferred', 'document', { approvalState: 'approved' })
      }
      const consolidatedIds = store.consolidate('doc2', 'Summary of style notes 2-11 for the novel')
      expect(consolidatedIds).not.toBeNull()
      // Forgetting one superseded source cascades to the summary.
      const target = consolidatedIds![0]
      const result = store.forget(target)
      expect(result!.removedIds).toContain(target)
      const summaryGone = store.getForDocument('doc2').every((e) => e.type !== 'summary' || !(e.derivedFrom ?? []).includes(target))
      expect(summaryGone).toBe(true)
      expect(result!.removedIds!.length).toBeGreaterThan(1)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  it('clearSuppressions is the opt-back-in', () => {
    const { store, file } = tmpStore()
    try {
      store.add('doc3', 'assistant', 'preference', 'User prefers formal register with no contractions anywhere', 'inferred', 'document')
      const id = store.getForDocument('doc3')[0].id
      store.forget(id)
      expect(store.isSuppressed('formal register with no contractions anywhere', 'doc3')).toBe(true)
      const cleared = store.clearSuppressions('doc3')
      expect(cleared).toBe(1)
      expect(store.isSuppressed('formal register with no contractions anywhere', 'doc3')).toBe(false)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  it('revokeDocumentAccess forgets the whole document and blocks re-learning', () => {
    const { store, file } = tmpStore()
    try {
      store.add('doc4', 'assistant', 'preference', 'Cite the on-time delivery figure of 96.4 percent in every summary', 'inferred', 'document')
      store.add('doc4', 'assistant', 'decision', 'Keep the cost-per-mile ceiling at 1.84 for Q4', 'inferred', 'document')
      store.add('doc5', 'assistant', 'preference', 'Unrelated preference for another document', 'inferred', 'document')
      const result = store.revokeDocumentAccess('doc4')
      expect(result.removedIds).toHaveLength(2)
      expect(store.getForDocument('doc4')).toHaveLength(0)
      expect(store.getForDocument('doc5')).toHaveLength(1) // untouched
      expect(store.isSuppressed('cite the on-time delivery figure of 96.4 percent', 'doc4')).toBe(true)
      // Document-scoped suppressions do not leak into other documents.
      expect(store.isSuppressed('cite the on-time delivery figure of 96.4 percent', 'doc5')).toBe(false)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  it('forget returns null for a missing entry', () => {
    const { store, file } = tmpStore()
    try {
      expect(store.forget('nope')).toBeNull()
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
})
