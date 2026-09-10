/**
 * §14 performance targets against the synthetic 100,000-word fixture.
 * Warm retrieval p95 ≤ 150 ms; non-LLM context assembly p95 ≤ 250 ms.
 * Latencies are machine-dependent — the benchmark prints its actuals so
 * results can be published with the machine description (§14).
 */

import { describe, expect, it } from 'vitest'
import { generateLargeFixture, measureStoragePerf, percentile, runPerfBenchmark } from '../../src/main/memory/eval/perf'

describe('§14 performance benchmark', () => {
  it('generates a real 100,000-word fixture with answerable queries', () => {
    const { html, queries } = generateLargeFixture(100_000)
    const words = html.split(/\s+/).length
    expect(words).toBeGreaterThanOrEqual(100_000)
    expect(queries.length).toBeGreaterThanOrEqual(25)
    // Every query's marker exists in the document (answers are real).
    for (const { marker } of queries) {
      expect(html).toContain(marker)
    }
  })

  it('computes percentiles sanely', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10)
    expect(percentile([], 0.95)).toBe(0)
  })

  it('meets the p95 targets: retrieval ≤150ms, assembly ≤250ms', () => {
    const report = runPerfBenchmark(100_000)
    // Published with the run (§14: report actuals, machine-dependent).
    console.log(
      `[perf] fixture: ${report.fixture.words} words / ${report.fixture.chunks} chunks | ` +
        `cold index: ${report.coldIndexMs.toFixed(0)}ms | ` +
        `warm retrieval p50/p95/max: ${report.warmRetrieval.p50.toFixed(1)}/${report.warmRetrieval.p95.toFixed(1)}/${report.warmRetrieval.max.toFixed(1)}ms | ` +
        `assembly p50/p95/max: ${report.contextAssembly.p50.toFixed(1)}/${report.contextAssembly.p95.toFixed(1)}/${report.contextAssembly.max.toFixed(1)}ms`
    )
    expect(report.warmRetrieval.samples).toBeGreaterThanOrEqual(25)
    // If these fail, the plan requires investigating and reporting — not
    // lowering the gate. Machine: documented in the published results.
    expect(report.warmRetrieval.p95).toBeLessThanOrEqual(150)
    expect(report.contextAssembly.p95).toBeLessThanOrEqual(250)
  })

  it('measures the ledger writer and generation maintenance (reported, not gated)', () => {
    const storage = measureStoragePerf(100)
    console.log(
      `[perf] ledger write p50/p95/max: ${storage.ledgerWrite.p50.toFixed(2)}/${storage.ledgerWrite.p95.toFixed(2)}/${storage.ledgerWrite.max.toFixed(2)}ms | ` +
        `generation cycle p50/p95/max: ${storage.generationMaintenance.p50.toFixed(2)}/${storage.generationMaintenance.p95.toFixed(2)}/${storage.generationMaintenance.max.toFixed(2)}ms | ` +
        `long session: ${storage.sessionGrowth.turns} turns / ${storage.sessionGrowth.events} events / ` +
        `ledger ${storage.sessionGrowth.ledgerBytes}B / json ${storage.sessionGrowth.jsonBytes}B`
    )
    expect(storage.ledgerWrite.samples).toBe(100)
    expect(storage.generationMaintenance.samples).toBe(10)
    // Committing a turn writes both its user and assistant event.
    expect(storage.sessionGrowth.events).toBe(200)
    expect(storage.sessionGrowth.ledgerBytes).toBeGreaterThan(0)
    expect(storage.sessionGrowth.jsonBytes).toBeGreaterThan(0)
    // Loose sanity bounds only (see §G: separate controlled benchmarks from
    // shared-CI timing noise).
    expect(storage.ledgerWrite.p95).toBeLessThan(500)
    expect(storage.generationMaintenance.max).toBeLessThan(500)
  })
})
