/**
 * Unit tests for the memory policy and context planner (memory.md §6.3, §8, §10.1).
 * These modules are pure (no Electron imports) so they are tested directly.
 */

import { describe, it, expect } from 'vitest'
import {
  isEligibleForPrompt,
  filterEligible,
  findCorrectionClusters,
  buildClusterSuggestion,
  defaultApprovalState
} from '../../src/main/memory/policy'
import { planContext, contextReportFromPlanned, DEFAULT_CONTEXT_CHAR_BUDGET } from '../../src/main/memory/context-planner'
import type { AgentMemoryEntry } from '../../src/shared/types'

function makeEntry(overrides: Partial<AgentMemoryEntry> = {}): AgentMemoryEntry {
  return {
    id: overrides.id ?? 'mem_1',
    documentId: 'doc-1',
    agentName: 'assistant',
    type: 'correction',
    content: 'User rejected insertion: overly formal corporate jargon',
    createdAt: 1000,
    scope: 'document',
    ...overrides
  }
}

describe('memory policy', () => {
  it('treats legacy entries (no approvalState) as eligible for prompts', () => {
    expect(isEligibleForPrompt(makeEntry({ approvalState: undefined }))).toBe(true)
  })

  it('only approves approved entries; candidate/rejected/superseded are excluded', () => {
    expect(isEligibleForPrompt(makeEntry({ approvalState: 'approved' }))).toBe(true)
    expect(isEligibleForPrompt(makeEntry({ approvalState: 'candidate' }))).toBe(false)
    expect(isEligibleForPrompt(makeEntry({ approvalState: 'rejected' }))).toBe(false)
    expect(isEligibleForPrompt(makeEntry({ approvalState: 'superseded' }))).toBe(false)
  })

  it('filterEligible keeps legacy and approved, drops the rest', () => {
    const entries = [
      makeEntry({ id: 'a' }),
      makeEntry({ id: 'b', approvalState: 'approved' }),
      makeEntry({ id: 'c', approvalState: 'candidate' }),
      makeEntry({ id: 'd', approvalState: 'rejected' })
    ]
    expect(filterEligible(entries).map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('defaults: explicit/user/template are approved; inferred entries are candidates', () => {
    expect(defaultApprovalState('explicit', 'user')).toBe('approved')
    expect(defaultApprovalState('inferred', 'user')).toBe('approved')
    expect(defaultApprovalState('inferred', 'template')).toBe('approved')
    expect(defaultApprovalState('inferred', 'agent')).toBe('candidate')
    expect(defaultApprovalState('inferred', 'system')).toBe('candidate')
  })

  it('clusters 3+ corrections that share keywords, keeps originals untouched', () => {
    const corrections = [
      makeEntry({ id: 'c1', content: 'User rejected insertion: corporate jargon in the intro' }),
      makeEntry({ id: 'c2', content: 'User rejected insertion: corporate jargon in the conclusion' }),
      makeEntry({ id: 'c3', content: 'User rejected replacement: corporate jargon disclaimer text' }),
      makeEntry({ id: 'c4', content: 'Unrelated: user wants serif fonts instead' })
    ]
    const before = JSON.stringify(corrections)
    const clusters = findCorrectionClusters(corrections)
    expect(clusters.length).toBe(1)
    expect(clusters[0].length).toBe(3)
    expect(clusters[0].map((e) => e.id)).toEqual(['c1', 'c2', 'c3'])
    // Pure function — inputs are never mutated
    expect(JSON.stringify(corrections)).toBe(before)
  })

  it('builds document-scoped candidate suggestions with evidence ids', () => {
    const cluster = [
      makeEntry({ id: 'c1' }),
      makeEntry({ id: 'c2' }),
      makeEntry({ id: 'c3' })
    ]
    const suggestion = buildClusterSuggestion(cluster)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.approvalState).toBe('candidate')
    expect(suggestion!.scope).toBe('document')
    expect(suggestion!.evidenceIds).toEqual(['c1', 'c2', 'c3'])
    expect(suggestion!.content).toContain('review and approve')
  })
})

describe('context planner', () => {
  it('keeps everything whole when the total fits the budget', () => {
    const planned = planContext(
      { documentContent: 'a'.repeat(100), selection: 'b'.repeat(50), memoryContext: 'c'.repeat(20) },
      1000
    )
    expect(planned.documentContent.content).toHaveLength(100)
    expect(planned.anyTruncated).toBe(false)
    expect(planned.totalChars).toBe(170)
  })

  it('truncates against a shared budget when inputs exceed it', () => {
    const budget = 1000
    const planned = planContext(
      {
        documentContent: 'x'.repeat(5000),
        storyboardContent: 'y'.repeat(3000),
        selection: 'z'.repeat(200),
        memoryContext: 'm'.repeat(100)
      },
      budget
    )
    expect(planned.anyTruncated).toBe(true)
    expect(planned.totalChars).toBeLessThanOrEqual(budget)
    expect(planned.documentContent.truncated).toBe(true)
    // Document gets the largest share of the budget
    expect(planned.documentContent.content.length).toBeGreaterThan(
      planned.selection.content.length
    )
    // Parts that fit their weighted allowance survive whole
    expect(planned.memoryContext.content).toBe('m'.repeat(100))
    // Parts over their allowance are truncated but keep at least the allowance
    expect(planned.selection.content.length).toBeGreaterThanOrEqual(
      Math.floor(budget * 0.12)
    )
  })

  it('appends a truncation marker to truncated parts', () => {
    const planned = planContext({ documentContent: 'x'.repeat(5000) }, 100, '...[cut]')
    expect(planned.documentContent.truncated).toBe(true)
    expect(planned.documentContent.content.endsWith('...[cut]')).toBe(true)
    expect(planned.documentContent.content.length).toBeLessThanOrEqual(100)
  })

  it('drops the truncation marker when redistribution restores a part fully', () => {
    // Only the document is oversized: with a big budget its allowance covers
    // the small selection entirely, so the selection is kept whole.
    const planned = planContext(
      { documentContent: 'x'.repeat(5000), selection: 'z'.repeat(200) },
      2000
    )
    expect(planned.selection.truncated).toBe(false)
    expect(planned.selection.content).toBe('z'.repeat(200))
  })

  it('never exceeds the total budget even when the budget is smaller than the truncation marker', () => {
    // Budget 50 → document allowance is floor(50*0.38)=19, shorter than the
    // default marker. The marker must be shortened, not push the total over.
    const planned = planContext({ documentContent: 'x'.repeat(5000) }, 50)
    expect(planned.totalChars).toBeLessThanOrEqual(50)
    expect(planned.documentContent.truncated).toBe(true)
  })

  it('handles empty inputs', () => {
    const planned = planContext({}, DEFAULT_CONTEXT_CHAR_BUDGET)
    expect(planned.totalChars).toBe(0)
    expect(planned.anyTruncated).toBe(false)
  })
})

describe('contextReportFromPlanned (§10.3 inspector)', () => {
  const baseOpts = {
    documentId: 'doc-1',
    model: 'llama3',
    providerId: 'ollama',
    local: true,
    history: { source: 'raw' as const, turns: 4 },
    fallbacks: [undefined, 'mnesis-request-failed']
  }

  it('accounts for every part with included/truncation flags and char counts', () => {
    const planned = planContext(
      { documentContent: 'x'.repeat(5000), selection: 'chosen text' },
      100
    )
    const report = contextReportFromPlanned(planned, baseOpts)
    const byKey = Object.fromEntries(report.parts.map((p) => [p.key, p]))
    expect(byKey.documentContent.included).toBe(true)
    expect(byKey.documentContent.truncated).toBe(true)
    expect(byKey.documentContent.originalChars).toBe(5000)
    expect(byKey.documentContent.chars).toBeLessThan(5000)
    expect(byKey.selection.included).toBe(true)
    expect(byKey.storyboardContent.included).toBe(false)
    expect(report.totalChars).toBe(planned.totalChars)
    expect(report.estimatedInputTokens).toBe(Math.ceil(planned.totalChars / 4))
  })

  it('drops undefined fallbacks and keeps disclosures in order', () => {
    const planned = planContext({}, DEFAULT_CONTEXT_CHAR_BUDGET)
    const report = contextReportFromPlanned(planned, baseOpts)
    expect(report.fallbacks).toEqual(['mnesis-request-failed'])
  })

  it('carries history source, identity, and local/remote classification', () => {
    const planned = planContext({ memoryContext: 'prefers short sentences' }, DEFAULT_CONTEXT_CHAR_BUDGET)
    const report = contextReportFromPlanned(planned, {
      ...baseOpts,
      documentId: null,
      local: false,
      providerId: 'openai',
      history: { source: 'curated', turns: 12 }
    })
    expect(report.documentId).toBeNull()
    expect(report.local).toBe(false)
    expect(report.providerId).toBe('openai')
    expect(report.history).toEqual({ source: 'curated', turns: 12 })
    expect(report.parts.find((p) => p.key === 'memoryContext')?.included).toBe(true)
  })
})
