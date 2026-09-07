/**
 * Unit tests for AgentMemoryStore approval lifecycle, rekey migration, and
 * candidate clustering (memory.md §6.1, §6.3, §10.1).
 * The store takes an injectable file path so it runs outside Electron.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import type { AgentMemoryEntry } from '../../src/shared/types'

let dir: string
let store: AgentMemoryStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-memory-test-'))
  store = new AgentMemoryStore(join(dir, 'memory.json'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('AgentMemoryStore approval lifecycle', () => {
  it('creates inferred entries as candidates and explicit entries as approved', () => {
    const inferred = store.add('doc-1', 'assistant', 'preference', 'Avoid jargon', 'inferred', 'document')
    const explicit = store.add('doc-1', 'user', 'preference', 'Use British spelling', 'explicit', 'document')
    expect(inferred.approvalState).toBe('candidate')
    expect(inferred.sourceType).toBe('agent')
    expect(explicit.approvalState).toBe('approved')
    expect(explicit.sourceType).toBe('user')
  })

  it('excludes candidates from prompt formatting until approved', () => {
    store.add('doc-1', 'assistant', 'preference', 'Prefer concise sentences', 'inferred', 'document')
    expect(store.formatForPrompt('doc-1')).toBe('')

    const entry = store.getForDocument('doc-1')[0]
    store.setApproval(entry.id, 'approved')
    const prompt = store.formatForPrompt('doc-1')
    expect(prompt).toContain('Prefer concise sentences')
  })

  it('rejecting and superseding both remove entries from prompts but keep them stored', () => {
    const a = store.add('doc-1', 'user', 'fact', 'Fact A', 'explicit', 'document')
    store.setApproval(a.id, 'rejected')
    const b = store.add('doc-1', 'user', 'fact', 'Fact B', 'explicit', 'document')
    store.setApproval(b.id, 'superseded')
    expect(store.formatForPrompt('doc-1')).toBe('')
    expect(store.getForDocument('doc-1').length).toBe(2)
  })

  it('lists candidates for review', () => {
    store.add('doc-1', 'assistant', 'preference', 'Candidate one', 'inferred', 'document')
    store.add('doc-1', 'assistant', 'preference', 'Candidate two', 'inferred', 'document')
    store.add('doc-2', 'assistant', 'preference', 'Other doc', 'inferred', 'document')
    expect(store.getCandidates('doc-1').length).toBe(2)
    expect(store.getCandidates('doc-2').length).toBe(1)
  })
})

describe('AgentMemoryStore key migration (rekey)', () => {
  it('moves legacy path-keyed entries to the stable documentId and records originKey', () => {
    const legacyPath = 'C:\\docs\\report.docx'
    store.add(legacyPath, 'user', 'fact', 'Legacy fact', 'explicit', 'document')
    const moved = store.rekey(legacyPath, 'doc-abc')
    expect(moved).toBe(1)
    const entries = store.getForDocument('doc-abc')
    expect(entries.length).toBe(1)
    expect(entries[0].originKey).toBe(legacyPath)
    expect(store.getForDocument(legacyPath).length).toBe(0)
  })

  it('is idempotent and never touches global entries', () => {
    store.add('old-key', 'user', 'fact', 'Doc fact', 'explicit', 'document')
    store.add('__global__', 'user', 'preference', 'Global pref', 'explicit', 'global')
    store.rekey('old-key', 'doc-abc')
    const moved = store.rekey('old-key', 'doc-abc')
    expect(moved).toBe(0)
    expect(store.getGlobal().length).toBe(1)
    expect(store.getGlobal()[0].documentId).toBe('__global__')
  })

  it('persists approval state and provenance to disk', () => {
    const entry = store.add('doc-1', 'assistant', 'preference', 'Something', 'inferred', 'document', {
      runId: 'run-42'
    })
    const raw = JSON.parse(readFileSync(join(dir, 'memory.json'), 'utf-8'))
    const persisted: AgentMemoryEntry = raw.entries.find((e: AgentMemoryEntry) => e.id === entry.id)
    expect(persisted.approvalState).toBe('candidate')
    expect(persisted.runId).toBe('run-42')
  })
})

describe('AgentMemoryStore retention (memory.md §11)', () => {
  it('deletes archived and stale candidates past their windows and reports counts', () => {
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    // Old archived entry (past window) and a fresh one (within)
    const oldRejected = store.add('doc-1', 'user', 'fact', 'Old rejected', 'explicit', 'document')
    store.setApproval(oldRejected.id, 'rejected')
    oldRejected.createdAt = now - 40 * DAY
    const freshRejected = store.add('doc-1', 'user', 'fact', 'Fresh rejected', 'explicit', 'document')
    store.setApproval(freshRejected.id, 'rejected')
    freshRejected.createdAt = now - DAY
    // Old stale candidate vs fresh candidate
    const staleCandidate = store.add('doc-1', 'assistant', 'preference', 'Stale suggestion', 'inferred', 'document')
    staleCandidate.createdAt = now - 40 * DAY
    store.add('doc-1', 'assistant', 'preference', 'Fresh suggestion', 'inferred', 'document')
    // Approved entries must never be touched by retention
    const approved = store.add('doc-1', 'user', 'fact', 'Approved old fact', 'explicit', 'document')
    store.setApproval(approved.id, 'approved')
    approved.createdAt = now - 400 * DAY

    const result = store.applyRetention(now, { rejectedDays: 30, candidateDays: 30 })
    expect(result).toEqual({ removedRejected: 1, removedCandidates: 1 })
    expect(store.getForDocument('doc-1').map((e) => e.content)).toEqual(
      expect.arrayContaining(['Fresh rejected', 'Fresh suggestion', 'Approved old fact'])
    )
    expect(store.getForDocument('doc-1').some((e) => e.content === 'Old rejected')).toBe(false)
    expect(store.getForDocument('doc-1').some((e) => e.content === 'Stale suggestion')).toBe(false)
  })

  it('keeps everything forever when windows are null (default policy)', () => {
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    const old = store.add('doc-1', 'user', 'fact', 'Ancient', 'explicit', 'document')
    store.setApproval(old.id, 'rejected')
    old.createdAt = now - 4000 * DAY
    const stale = store.add('doc-1', 'assistant', 'preference', 'Ancient suggestion', 'inferred', 'document')
    stale.createdAt = now - 4000 * DAY

    const result = store.applyRetention(now, { rejectedDays: null, candidateDays: null })
    expect(result).toEqual({ removedRejected: 0, removedCandidates: 0 })
    expect(store.getForDocument('doc-1')).toHaveLength(2)
  })

  it('persists retention deletions to disk', () => {
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    const old = store.add('doc-1', 'user', 'fact', 'Old', 'explicit', 'document')
    store.setApproval(old.id, 'rejected')
    old.createdAt = now - 60 * DAY
    store.applyRetention(now, { rejectedDays: 30, candidateDays: null })
    const raw = JSON.parse(readFileSync(join(dir, 'memory.json'), 'utf-8'))
    expect(raw.entries).toHaveLength(0)
  })
})

describe('AgentMemoryStore correction clustering (memory.md §10.1)', () => {
  it('suggests a document-scoped candidate without promoting or deleting originals', () => {
    for (let i = 0; i < 3; i++) {
      store.add('doc-1', 'assistant', 'correction', `User rejected insertion: corporate jargon phrase ${i}`, 'inferred', 'document')
    }
    const suggested = store.clusterCorrections('doc-1')
    expect(suggested).toBe(1)

    // Original corrections retained as evidence
    const corrections = store.getForDocument('doc-1').filter((e) => e.type === 'correction')
    expect(corrections.length).toBe(3)

    // Suggestion is a document-scoped candidate, not a global preference
    const suggestion = store.getForDocument('doc-1').find((e) => e.type === 'preference')
    expect(suggestion).toBeDefined()
    expect(suggestion!.scope).toBe('document')
    expect(suggestion!.approvalState).toBe('candidate')

    // Nothing entered global scope
    expect(store.getGlobal().length).toBe(0)

    // The suggestion is excluded from prompts until approved
    expect(store.formatForPrompt('doc-1')).toBe('')
  })

  it('does not create duplicate suggestions on repeated clustering', () => {
    for (let i = 0; i < 3; i++) {
      store.add('doc-1', 'assistant', 'correction', `User rejected insertion: corporate jargon phrase ${i}`, 'inferred', 'document')
    }
    expect(store.clusterCorrections('doc-1')).toBe(1)
    expect(store.clusterCorrections('doc-1')).toBe(0)
  })

  it('does not recreate a suggestion the user already approved', () => {
    for (let i = 0; i < 3; i++) {
      store.add('doc-1', 'assistant', 'correction', `User rejected insertion: corporate jargon phrase ${i}`, 'inferred', 'document')
    }
    store.clusterCorrections('doc-1')
    const suggestion = store.getForDocument('doc-1').find((e) => e.type === 'preference')!
    store.setApproval(suggestion.id, 'approved')
    // Three more identical corrections form a cluster again — but the
    // approved suggestion must block a duplicate candidate
    for (let i = 3; i < 6; i++) {
      store.add('doc-1', 'assistant', 'correction', `User rejected insertion: corporate jargon phrase ${i}`, 'inferred', 'document')
    }
    expect(store.clusterCorrections('doc-1')).toBe(0)
    expect(store.getForDocument('doc-1').filter((e) => e.type === 'preference').length).toBe(1)
  })
})

describe('AgentMemoryStore consolidation (memory.md §4)', () => {
  it('supersedes old entries instead of deleting them, and repeated consolidation converges', () => {
    for (let i = 0; i < 35; i++) {
      store.add('doc-1', 'user', 'fact', `Fact number ${i}`, 'explicit', 'document')
    }
    const firstPass = store.consolidate('doc-1', 'Summary of old facts', 10)
    expect(firstPass).not.toBeNull()
    expect(firstPass!.length).toBe(25)

    // All 25 originals retained as superseded evidence
    const all = store.getForDocument('doc-1')
    expect(all.filter((e) => e.approvalState === 'superseded').length).toBe(25)

    // The count gate ignores superseded entries: active = 10 kept + 1 summary
    expect(store.countForDocument('doc-1')).toBe(11)

    // Consolidating again does not re-process the superseded entries
    const secondPass = store.consolidate('doc-1', 'Another summary', 10)
    const summaries = all.filter((e) => e.type === 'summary')
    expect(summaries.length).toBe(1)
    // Second pass (if it fires at all) touches at most the one overflow entry
    expect(secondPass === null || secondPass.length <= 1).toBe(true)

    // Evidence retained on disk
    expect(existsSync(join(dir, 'memory.json'))).toBe(true)
  })
})
