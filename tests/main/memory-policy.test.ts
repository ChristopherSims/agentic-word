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
  defaultApprovalState,
  persistentMemoryAllowed
} from '../../src/main/memory/policy'
import { planContext, contextReportFromPlanned, resolveContextProfile, condenseConversation, clampProfileToModel, MULTI_AGENT_PROFILE, ORCHESTRATOR_PROFILE, DEFAULT_CONTEXT_CHAR_BUDGET } from '../../src/main/memory/context-planner'
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

  it('§11: persistence is allowed unless the document is protected', () => {
    expect(persistentMemoryAllowed(undefined)).toBe(true)
    expect(persistentMemoryAllowed(false)).toBe(true)
    expect(persistentMemoryAllowed(true)).toBe(false)
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

describe('resolveContextProfile + planContext weights (§8.4 small/local models)', () => {
  it('classifies small/local model names into the reduced profile', () => {
    for (const model of ['llama3.1:8b', 'phi-3-mini', 'gemma2:9b', 'mistral-7b', 'qwen2.5:3b']) {
      const p = resolveContextProfile(model)
      expect(p.label).toBe('small-local')
      expect(p.totalBudget).toBeLessThan(DEFAULT_CONTEXT_CHAR_BUDGET)
    }
  })

  it('large/unknown models keep the default profile', () => {
    expect(resolveContextProfile('gpt-4o').label).toBe('default')
    expect(resolveContextProfile(undefined).label).toBe('default')
    expect(resolveContextProfile('gpt-4o').totalBudget).toBe(DEFAULT_CONTEXT_CHAR_BUDGET)
  })

  it('§12 audit: purpose profiles have coherent weights and budgets', () => {
    for (const p of [MULTI_AGENT_PROFILE, ORCHESTRATOR_PROFILE]) {
      const sum = Object.values(p.weights).reduce((a, b) => a + (b ?? 0), 0)
      expect(sum).toBeCloseTo(1, 1)
      expect(p.totalBudget).toBeGreaterThan(0)
      expect(p.totalBudget).toBeLessThan(DEFAULT_CONTEXT_CHAR_BUDGET)
    }
    // The orchestrator is the leanest: decomposition needs the least context.
    expect(ORCHESTRATOR_PROFILE.totalBudget).toBeLessThan(MULTI_AGENT_PROFILE.totalBudget)
  })

  it('§12 audit: purpose profiles clamp to the model context window', () => {
    // 16k multi-agent budget on a 12k small model clamps down.
    expect(clampProfileToModel(MULTI_AGENT_PROFILE, 'llama3.1:8b').totalBudget).toBe(12_000)
    // On a large model the purpose budget is kept (it is already smaller).
    expect(clampProfileToModel(MULTI_AGENT_PROFILE, 'gpt-4o').totalBudget).toBe(MULTI_AGENT_PROFILE.totalBudget)
    // Weights survive clamping.
    expect(clampProfileToModel(MULTI_AGENT_PROFILE, 'llama3.1:8b').weights).toEqual(MULTI_AGENT_PROFILE.weights)
  })

  it('weight overrides change allowances under pressure', () => {
    const small = resolveContextProfile('llama3.1:8b')
    // Same oversized inputs: selection gets more room under the small profile
    // than under default weights, document content less.
    const inputs = {
      documentContent: 'd'.repeat(20000),
      selection: 's'.repeat(20000),
      cursorContext: '',
      storyboardContent: '',
      scratchpad: '',
      memoryContext: ''
    }
    const planned = planContext(inputs, small.totalBudget, '...[cut]', small.weights)
    expect(planned.selection.content.length).toBeGreaterThan(planned.documentContent.content.length)
    expect(planned.totalChars).toBeLessThanOrEqual(small.totalBudget)
  })
})

describe('condenseConversation (§7.2 item 6 — session recap + recent episodes)', () => {
  function longTranscript(n: number) {
    return Array.from({ length: n }, (_, i) =>
      i % 2 === 0
        ? { role: 'user', content: `Question number ${i} about topic ${i % 5}: ${'detail '.repeat(20)}` }
        : { role: 'assistant', content: `Answer ${i}: ${'response '.repeat(20)}` }
    )
  }

  it('leaves short conversations untouched', () => {
    const msgs = longTranscript(10)
    const r = condenseConversation(msgs)
    expect(r.condensed).toBe(false)
    expect(r.messages).toBe(msgs)
  })

  it('condenses long transcripts into a labeled recap plus verbatim recent turns', () => {
    const msgs = longTranscript(40)
    const r = condenseConversation(msgs, { keepRecent: 8, minMessages: 20 })
    expect(r.condensed).toBe(true)
    expect(r.messages[0].role).toBe('system')
    expect(r.messages[0].content).toContain('not verbatim history')
    // Recent episodes are the original message objects, verbatim.
    expect(r.messages.slice(-8)).toEqual(msgs.slice(-8))
    // The recap covers the older turns only.
    expect(r.messages.length).toBe(9)
    // The recap is capped (default 1500 chars ≈ 9 lines), covers only the
    // older turns, and every line carries a role label.
    const recapLines = r.messages[0].content.split('\n').filter((l) => l.startsWith('- '))
    expect(recapLines.length).toBeGreaterThanOrEqual(5)
    expect(recapLines.length).toBeLessThanOrEqual(32)
    expect(recapLines[0]).toMatch(/^- (user|assistant): /)
  })

  it('caps the recap and drops the oldest lines first', () => {
    const msgs = longTranscript(60)
    const tight = condenseConversation(msgs, { keepRecent: 6, minMessages: 20, maxRecapChars: 300 })
    const recapLines = tight.messages[0].content.split('\n').filter((l) => l.startsWith('- '))
    const recapBody = recapLines.join('\n')
    expect(recapBody.length).toBeLessThanOrEqual(420) // cap + per-line slack
    // The most recent older turns are kept (message 53 is the last older one);
    // the oldest turns (Question 0) are the ones dropped.
    expect(recapBody).toContain('Answer 53')
    expect(recapBody).not.toContain('Question number 0')
  })

  it('never condenses below keepRecent+2 even with a low minMessages', () => {
    const r = condenseConversation(longTranscript(9), { keepRecent: 8, minMessages: 5 })
    expect(r.condensed).toBe(false)
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
