/**
 * §14 performance targets, measured against synthetic fixtures:
 * - Local warm retrieval: p95 ≤ 150 ms on a 100,000-word fixture.
 * - Non-LLM context assembly: p95 ≤ 250 ms (excludes background
 *   summarization).
 *
 * Latencies are machine-dependent; results must be published with the
 * machine description (the test prints them). If a target fails, the plan
 * says investigate and report — never silently lower the gate.
 */

import { performance } from 'perf_hooks'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DocumentIndex, chunkBlocks, extractBlocks, formatRetrieval, rankChunks } from '../doc-index'
import { planContext, resolveContextProfile } from '../context-planner'
import { AgentMemoryStore } from '../../agent-memory'
import { ProjectionCoordinator } from '../projection-coordinator'
import { ControlStore } from '../control-store'
import { InProcessLedgerDriver } from '../ledger-driver'

/** Percentile of a sorted sample (p in 0..1). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export interface LatencyStats {
  p50: number
  p95: number
  max: number
  samples: number
}

const stats = (ms: number[]): LatencyStats => {
  const sorted = [...ms].sort((a, b) => a - b)
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
    samples: sorted.length
  }
}

// ─── 100,000-word fixture ───

const SECTION_TEMPLATE = `
<h2>Chapter {n}: The {place} Ledger</h2>
<p>The keeper of the {place} station wrote the tide ledger in iron-gall ink,
one line per dawn, for forty-one winters. The ledger's last page lists a
cargo manifest for the brigantine Pale Meg: eleven crates of fenland glass,
four barrels of linseed, and one unmarked strongbox he was told never to
open. The harbor register at {place} records the cargo marker {marker} for
this manifest, and the salvage court at Drymouth claimed the hull within
the month of the wreck on the Meridian shoals.</p>
<p>Mrs. Quayle, the chandler, kept two ledgers: the honest one for the
inspectors and the true one wrapped in oilcloth under the floorboard by the
stove. The true ledger recorded lantern oil sold to a ship that had,
according to the harbor register, never docked at {place} at all. The
phantom ship carried the anchor-fluke seal of a customs man named Aldous
Renn, whose green wax letters grew shakier as the years advanced, until the
ninth letter was stamped rather than signed, as though the signer could no
longer write.</p>
<p>Elena Marsh stepped off the mail packet with a borrowed carpetbag and a
letter of introduction she had written herself. The harbormaster stamped it
without reading, as she had wagered he would. She took the room above the
chandlery and paid three weeks in advance with a Portuguese gold coin, a
moidore, that she palmed from the landlady's own change bowl. By the end of
the week she had copied a page of the true ledger and begun to trace the
green-sealed letters through the customs house at Drymouth.</p>
<p>The glass spheres salvaged from the wreck were auctioned in lots. Held
against the lighthouse lamp, each sphere showed a different meridian line,
as though the glassmaker had signed the longitude into the melt. The
auction roll survived the salvage court's fire because the clerk, a
methodical man named Pell, kept a duplicate in his mother's house across
the lane, and his margin note beside the seventh lot read "purchaser: one
name only."</p>`

const PLACES = ['Vesper', 'Drymouth', 'Meridian', 'Lantern', 'Saltcliff', 'Glasshouse', 'Quayside', 'Fenland']

/**
 * Deterministic ~100k-word document: repeated structural sections, each
 * with a unique cargo marker planted mid-document (so every query's answer
 * lives beyond any fixed prefix and forces real ranking work).
 */
export function generateLargeFixture(targetWords = 100_000): { html: string; queries: Array<{ query: string; marker: string }> } {
  const wordsPerSection = 260 // measured from the template above
  const sectionCount = Math.ceil(targetWords / wordsPerSection)
  const parts: string[] = ['<h1>The Glass Meridian — Long Fixture</h1>']
  const queries: Array<{ query: string; marker: string }> = []
  for (let i = 1; i <= sectionCount; i++) {
    const place = PLACES[i % PLACES.length]
    const marker = String(10_000 + i * 7)
    parts.push(
      SECTION_TEMPLATE.replace(/\{n\}/g, String(i))
        .replace(/\{place\}/g, place)
        .replace(/\{marker\}/g, marker)
    )
    // Sample ~30 queries spread across the document.
    if (i % Math.max(1, Math.floor(sectionCount / 30)) === 0) {
      queries.push({ query: `What cargo marker does the ${place} harbor register record for the manifest?`, marker })
    }
  }
  return { html: parts.join('\n'), queries }
}

export interface PerfReport {
  fixture: { words: number; chunks: number }
  /** one-time cold index cost (not gated — disclosed) */
  coldIndexMs: number
  warmRetrieval: LatencyStats
  contextAssembly: LatencyStats
}

export interface StoragePerfReport {
  /** per-turn ledger+mirror commit latency */
  ledgerWrite: LatencyStats
  /** projection generation create→activate→dispose cycle latency */
  generationMaintenance: LatencyStats
  /** retained growth after a long synthetic session */
  sessionGrowth: { turns: number; events: number; ledgerBytes: number; jsonBytes: number }
}

/**
 * Measure the storage path (§G): committing retained turns through the
 * Lexicon ledger (event + outbox in one transaction) and maintaining
 * projection generations. Machine-dependent — reported, with a loose sanity
 * bound only.
 */
export function measureStoragePerf(turns = 100): StoragePerfReport {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-perf-storage-'))
  const jsonPath = path.join(dir, 'memory.json')
  const ledgerPath = path.join(dir, 'memory.sqlite')
  const store = new AgentMemoryStore(jsonPath)
  const writeMs: number[] = []
  try {
    for (let i = 0; i < turns; i++) {
      const t0 = performance.now()
      store.commitRetainedTurn('perf-doc', 'perf-doc:Writer', `turn ${i}`, `answer ${i}`)
      writeMs.push(performance.now() - t0)
    }

    const coord = new ProjectionCoordinator(new ControlStore(new InProcessLedgerDriver(store.getLedger())), path.join(dir, 'generations'))
    const genMs: number[] = []
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      const gen = coord.beginGeneration({ documentId: 'perf-doc', sessionId: 'perf-doc:Writer' })
      coord.activate(gen.generationId)
      coord.dispose(gen.generationId)
      genMs.push(performance.now() - t0)
    }

    const fileSize = (p: string): number => (fs.existsSync(p) ? fs.statSync(p).size : 0)
    return {
      ledgerWrite: stats(writeMs),
      generationMaintenance: stats(genMs),
      sessionGrowth: {
        turns,
        events: store.historicalEventsFor('perf-doc').length,
        ledgerBytes: fileSize(ledgerPath),
        jsonBytes: fileSize(jsonPath)
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Run the §14 performance benchmark: index once (cold, disclosed), then
 * measure warm retrieval (rankChunks top-5 hit) and full non-LLM context
 * assembly (retrieval + planContext + formatRetrieval) per query.
 */
export function runPerfBenchmark(targetWords = 100_000): PerfReport {
  const { html, queries } = generateLargeFixture(targetWords)

  const t0 = performance.now()
  const chunks = chunkBlocks(extractBlocks(html))
  const index = new DocumentIndex()
  index.update('perf-doc', html)
  const coldIndexMs = performance.now() - t0

  // Warm-up (JIT + caches) — then measured samples.
  rankChunks(queries[0].query, chunks, { k: 5 })

  const retrievalMs: number[] = []
  const assemblyMs: number[] = []
  const profile = resolveContextProfile('gpt-4o')
  for (const { query } of queries) {
    const r0 = performance.now()
    const scored = rankChunks(query, chunks, { k: 5 })
    const r1 = performance.now()
    retrievalMs.push(r1 - r0)

    const a1 = performance.now()
    const docContext = formatRetrieval(scored, chunks.length)
    planContext(
      {
        documentContent: docContext,
        selection: 'Selected text for the perf fixture. '.repeat(20),
        memoryContext: 'approved constraint: cite the harbor register markers',
        scratchpad: 'notes for the perf fixture run'
      },
      profile.totalBudget,
      '\n... [truncated]',
      profile.weights
    )
    const a2 = performance.now()
    assemblyMs.push(a2 - a1)
  }

  const words = html.split(/\s+/).length
  return {
    fixture: { words, chunks: chunks.length },
    coldIndexMs,
    warmRetrieval: stats(retrievalMs),
    contextAssembly: stats(assemblyMs)
  }
}
