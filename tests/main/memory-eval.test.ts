/**
 * §14 evaluation suite (memory.md "Validation and evaluation").
 *
 * Runs the synthetic-fixture dataset and asserts the proposed release
 * targets that are measurable offline:
 * - recall@5 ≥ 0.90 on exact (curated/source-linked) retrieval questions,
 *   reported separately from paraphrase questions (not gated — reported),
 * - zero cross-document / cross-branch leakage (the scope tasks),
 * - zero budget overflows, current-revision correctness, disclosure and
 *   persistence-gate tasks all passing.
 *
 * Remote-provider evaluation stays opt-in and out of this file (§14).
 */

import { describe, expect, it } from 'vitest'
import { describeFailures, QUESTIONS, scoreRetrieval } from '../../src/main/memory/eval/questions'
import { runTasks, TASKS, verifyFixtureSet } from '../../src/main/memory/eval/tasks'

describe('§14 evaluation dataset', () => {
  it('has the full question set: 50 questions, split exact/paraphrase', () => {
    expect(QUESTIONS).toHaveLength(50)
    const exact = QUESTIONS.filter((q) => q.kind === 'exact').length
    const paraphrase = QUESTIONS.filter((q) => q.kind === 'paraphrase').length
    expect(exact).toBeGreaterThanOrEqual(35)
    expect(paraphrase).toBeGreaterThanOrEqual(10)
    // Question ids are unique; every question targets a known document.
    const ids = new Set(QUESTIONS.map((q) => q.id))
    expect(ids.size).toBe(QUESTIONS.length)
  })

  it('has 23 end-to-end pipeline tasks and a coherent fixture set', () => {
    expect(TASKS).toHaveLength(23)
    expect(new Set(TASKS.map((t) => t.id)).size).toBe(TASKS.length)
    expect(verifyFixtureSet()).toEqual([])
  })

  it('meets the ≥0.90 recall@5 gate on exact retrieval questions', () => {
    const metrics = scoreRetrieval(QUESTIONS)
    const exactFailures = describeFailures(metrics.exactResults)
    if (metrics.exactRecallAt5 < 0.9) {
      // Surface every miss so failures are diagnosable, not just a ratio.
      console.error('exact-question misses:\n' + exactFailures.join('\n'))
    }
    expect(metrics.exactResults.length).toBeGreaterThanOrEqual(35)
    expect(metrics.exactRecallAt5).toBeGreaterThanOrEqual(0.9)
  })

  it('reports paraphrase recall separately (not gated per §14)', () => {
    const metrics = scoreRetrieval(QUESTIONS)
    expect(metrics.paraphraseResults.length).toBeGreaterThanOrEqual(10)
    // Sanity floor only: paraphrase retrieval must be meaningfully better
    // than chance, but the §14 gate applies to exact questions alone.
    expect(metrics.paraphraseRecallAt5).toBeGreaterThan(0)
    const misses = describeFailures(metrics.paraphraseResults)
    if (misses.length > 0) console.log(`paraphrase recall@5: ${metrics.paraphraseRecallAt5.toFixed(2)} (misses: ${misses.length})`)
  })

  it('passes all 23 end-to-end pipeline tasks (scope isolation, budgets, revisions, gates, deletion)', () => {
    const results = runTasks()
    const failed = results.filter((r) => r.failures.length > 0)
    if (failed.length > 0) {
      const report = failed
        .map((r) => `${r.task.id} (${r.task.title}):\n  - ${r.failures.join('\n  - ')}`)
        .join('\n')
      console.error('task failures:\n' + report)
    }
    expect(failed).toEqual([])
  })
})
