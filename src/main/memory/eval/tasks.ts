/**
 * Deterministic end-to-end pipeline tasks (memory.md §14: "20 end-to-end
 * writing/review tasks"). These exercise the full deterministic pipeline —
 * structural indexing, retrieval, budgeting, condensation, section
 * expansion, revision handling, and persistence gates — over the synthetic
 * fixtures. Anything requiring a live provider is deliberately excluded
 * (§14 "keep remote-provider evaluation opt-in and budgeted"); the tasks
 * below therefore verify the machinery a writing/review task depends on,
 * with a fake provider assumed downstream.
 *
 * Pure — unit-testable in Node vitest.
 */

import {
  DocumentIndex,
  RETRIEVAL_DISCLOSURE,
  buildOutline,
  chunkBlocks,
  extractBlocks,
  extractSection,
  formatRetrieval,
  planBatches,
  rankChunks,
  renderBatch
} from '../doc-index'
import {
  DEFAULT_CONTEXT_CHAR_BUDGET,
  MULTI_AGENT_PROFILE,
  ORCHESTRATOR_PROFILE,
  clampProfileToModel,
  condenseConversation,
  planContext,
  resolveContextProfile
} from '../context-planner'
import { persistentMemoryAllowed } from '../policy'
import { filterTranscriptForRebuild, planForgetCascade, shingleHashes, type SuppressionRecord } from '../deletion'
import { BRANCHED, BRANCHED_A, BRANCHED_B, CASUAL_BLOG, EVAL_DOCUMENTS, FORMAL_REPORT, NOVEL, PAPER, PAPER_REVISED, POLICY } from './fixtures'

export interface EvalTask {
  id: string
  /** §14 functional-fixture row or release target this task covers */
  covers: string
  title: string
  /** returns failure descriptions; empty = pass */
  run: () => string[]
}

const plainText = (html: string): string =>
  extractBlocks(html)
    .map((b) => b.text)
    .join('\n')

const topTexts = (docId: string, index: DocumentIndex, query: string, k = 5): string[] =>
  index.search(docId, query, { k }).map((s) => s.chunk.text)

const has = (texts: string[], marker: string): boolean =>
  texts.some((t) => t.toLowerCase().includes(marker.toLowerCase()))

export const TASKS: EvalTask[] = [
  {
    id: 't1',
    covers: 'Long report with answer near the end',
    title: 'Retrieval finds the answer beyond the old 4,000-character prefix',
    run: () => {
      const text = plainText(NOVEL.html)
      const marker = 'one sphere'
      const markerAt = text.toLowerCase().indexOf(marker)
      const failures: string[] = []
      if (text.length <= 4_000) failures.push(`fixture too short (${text.length} chars) — answer is inside the old prefix window`)
      if (markerAt < 4_000) failures.push('marker unexpectedly inside the first 4000 chars')
      const index = new DocumentIndex()
      index.update(NOVEL.id, NOVEL.html)
      if (!has(topTexts(NOVEL.id, index, 'What did Vey sail east with at the end of the story?'), marker)) {
        failures.push('top-5 retrieval did not include the epilogue marker beyond the prefix')
      }
      return failures
    }
  },
  {
    id: 't2',
    covers: 'Whole-document summary coverage',
    title: 'Batch plan covers every eligible section',
    run: () => {
      const blocks = extractBlocks(NOVEL.html)
      const chunks = chunkBlocks(blocks)
      const { batches, skipped } = planBatches(chunks, 6_000)
      const rendered = batches.map(renderBatch).join('\n')
      const failures: string[] = []
      if (skipped !== 0) failures.push(`${skipped} chunks skipped as oversized — coverage is partial`)
      // Every section heading in the outline must appear in the batch render.
      for (const line of buildOutline(blocks).split('\n')) {
        const heading = line.trim()
        if (heading && !rendered.includes(heading)) failures.push(`section not covered by batches: ${heading}`)
      }
      if (batches.length === 0) failures.push('no batches produced')
      return failures
    }
  },
  {
    id: 't3',
    covers: 'Whole-document summary partial disclosure',
    title: 'Batch accounting is complete (covered + skipped = total)',
    run: () => {
      const chunks = chunkBlocks(extractBlocks(PAPER.html))
      const { batches, skipped } = planBatches(chunks, 6_000)
      const covered = batches.reduce((n, b) => n + b.length, 0)
      const failures: string[] = []
      if (covered + skipped !== chunks.length) {
        failures.push(`accounting mismatch: covered ${covered} + skipped ${skipped} != ${chunks.length}`)
      }
      return failures
    }
  },
  {
    id: 't4',
    covers: 'Changed date/number',
    title: 'Retrieval reflects the current revision, never the old values',
    run: () => {
      const index = new DocumentIndex()
      index.update('rev-doc', PAPER.html)
      const before = topTexts('rev-doc', index, 'How many participants were enrolled in the study?')
      const failures: string[] = []
      if (!has(before, '412 participants')) failures.push('baseline revision did not retrieve the original figure')
      index.update('rev-doc', PAPER_REVISED.html)
      const after = topTexts('rev-doc', index, 'How many participants were enrolled in the study?')
      if (!has(after, '517 participants')) failures.push('revised figure not retrieved after re-index')
      if (has(after, '412 participants')) failures.push('stale pre-revision figure still retrieved after re-index')
      return failures
    }
  },
  {
    id: 't5',
    covers: 'Changed date/number (no stale override)',
    title: 'A second changed number does not resurface its old value',
    run: () => {
      const index = new DocumentIndex()
      index.update('rev-doc2', PAPER.html)
      index.update('rev-doc2', PAPER_REVISED.html)
      const after = topTexts('rev-doc2', index, 'By how much did cost per query fall against the embedding baseline?')
      const failures: string[] = []
      if (!has(after, '44.7 percent')) failures.push('revised cost figure not retrieved')
      if (has(after, '38.2 percent')) failures.push('old cost figure still retrieved after revision')
      return failures
    }
  },
  {
    id: 't6',
    covers: 'Two unrelated documents — scope isolation',
    title: 'Formal-report queries never surface blog content',
    run: () => {
      const index = new DocumentIndex()
      index.update(FORMAL_REPORT.id, FORMAL_REPORT.html)
      index.update(CASUAL_BLOG.id, CASUAL_BLOG.html)
      const texts = topTexts(FORMAL_REPORT.id, index, 'quarterly report on-time delivery rate and targets', 5)
      const failures: string[] = []
      for (const leak of ['spilled milk', 'raisins', 'yogurt pellets', '340 grams', 'headlamps']) {
        if (has(texts, leak)) failures.push(`cross-document leak into formal report results: ${leak}`)
      }
      return failures
    }
  },
  {
    id: 't7',
    covers: 'Two unrelated documents — scope isolation',
    title: 'Blog queries never surface formal-report content',
    run: () => {
      const index = new DocumentIndex()
      index.update(FORMAL_REPORT.id, FORMAL_REPORT.html)
      index.update(CASUAL_BLOG.id, CASUAL_BLOG.html)
      const texts = topTexts(CASUAL_BLOG.id, index, 'the ridge trail at dawn with headlamps and fog', 5)
      const failures: string[] = []
      for (const leak of ['96.4', 'dwell time', 'cost-per-mile', 'on-time delivery', 'formal register']) {
        if (has(texts, leak)) failures.push(`cross-document leak into blog results: ${leak}`)
      }
      return failures
    }
  },
  {
    id: 't8',
    covers: 'Branch with conflicting facts',
    title: 'Each branch revision is indexed alone — no cross-ending bleed',
    run: () => {
      // §14: "Only facts valid for the selected branch/revision are used."
      // Isolation comes from indexing the selected revision (trunk + one
      // ending), never from hoping ranking over a combined document sorts
      // the endings apart.
      const index = new DocumentIndex()
      index.update(BRANCHED_A.id, BRANCHED_A.html)
      index.update(BRANCHED_B.id, BRANCHED_B.html)
      const failures: string[] = []
      const aTexts = topTexts(BRANCHED_A.id, index, 'What was posted on the shoals and what happened to the confession?', 5)
      if (!has(aTexts, 'shoal beacon')) failures.push('Ending A revision did not retrieve its own content')
      for (const bMarker of ['deckhand', 'another decade', 'burned the page']) {
        if (has(aTexts, bMarker)) failures.push(`Ending B leaked into the Ending A revision: ${bMarker}`)
      }
      const bTexts = topTexts(BRANCHED_B.id, index, 'What job did Ilves take after the evening gun decision?', 5)
      if (!has(bTexts, 'deckhand')) failures.push('Ending B revision did not retrieve its own content')
      for (const aMarker of ['shoal beacon', 'fifty years', 'absolved']) {
        if (has(bTexts, aMarker)) failures.push(`Ending A leaked into the Ending B revision: ${aMarker}`)
      }
      return failures
    }
  },
  {
    id: 't9',
    covers: 'Two unrelated documents — opposing style constraints',
    title: 'Opposing style constraints are both retrievable, per document',
    run: () => {
      const index = new DocumentIndex()
      index.update(FORMAL_REPORT.id, FORMAL_REPORT.html)
      index.update(CASUAL_BLOG.id, CASUAL_BLOG.html)
      const failures: string[] = []
      const formal = topTexts(FORMAL_REPORT.id, index, 'what style must this report be written in', 3)
      if (!has(formal, '30 words')) failures.push('formal style constraint not retrievable in its own document')
      if (has(formal, '15 words')) failures.push("blog's opposing constraint leaked into the formal document")
      const casual = topTexts(CASUAL_BLOG.id, index, 'house rules for writing style on this blog', 3)
      if (!has(casual, '15 words')) failures.push('casual style constraint not retrievable in its own document')
      if (has(casual, '30 words')) failures.push("formal report's opposing constraint leaked into the blog")
      return failures
    }
  },
  {
    id: 't10',
    covers: 'Zero calls exceeding the final context budget',
    title: 'Assembled context never exceeds the default budget',
    run: () => {
      const docText = renderBatch(chunkBlocks(extractBlocks(NOVEL.html)))
      const planned = planContext(
        {
          documentContent: docText,
          selection: POLICY.html.slice(0, 3_000),
          scratchpad: 'notes '.repeat(1_500),
          storyboardContent: 'board '.repeat(1_500),
          memoryContext: 'approved constraint: raisins are mandatory '.repeat(50)
        },
        DEFAULT_CONTEXT_CHAR_BUDGET
      )
      const failures: string[] = []
      if (planned.totalChars > DEFAULT_CONTEXT_CHAR_BUDGET) {
        failures.push(`total ${planned.totalChars} exceeds budget ${DEFAULT_CONTEXT_CHAR_BUDGET}`)
      }
      for (const key of ['documentContent', 'selection', 'scratchpad', 'storyboardContent', 'memoryContext'] as const) {
        if (planned[key].content.length > DEFAULT_CONTEXT_CHAR_BUDGET) {
          failures.push(`part ${key} exceeds the whole budget`)
        }
      }
      return failures
    }
  },
  {
    id: 't11',
    covers: 'Zero calls exceeding the final context budget',
    title: 'Small/local model profile keeps the assembly inside 12k',
    run: () => {
      const profile = resolveContextProfile('llama3.1:8b')
      const docText = renderBatch(chunkBlocks(extractBlocks(PAPER.html))) + ' padding '.repeat(2_000)
      const planned = planContext(
        {
          documentContent: docText,
          selection: 'selected text '.repeat(800),
          memoryContext: 'approved constraint text '.repeat(400)
        },
        profile.totalBudget,
        '\n... [truncated]',
        profile.weights
      )
      const failures: string[] = []
      if (profile.label !== 'small-local') failures.push('expected the small-local profile for a llama model')
      if (planned.totalChars > profile.totalBudget) {
        failures.push(`total ${planned.totalChars} exceeds small-model budget ${profile.totalBudget}`)
      }
      return failures
    }
  },
  {
    id: 't12',
    covers: 'Entry-point audit — purpose profiles',
    title: 'Purpose profiles clamp to the model window on all entry points',
    run: () => {
      const failures: string[] = []
      const multi = clampProfileToModel(MULTI_AGENT_PROFILE, 'phi3:4b')
      const orch = clampProfileToModel(ORCHESTRATOR_PROFILE, 'phi3:4b')
      if (multi.totalBudget > 12_000) failures.push(`multi-agent budget ${multi.totalBudget} exceeds the small-model window`)
      if (orch.totalBudget > 12_000) failures.push(`orchestrator budget ${orch.totalBudget} exceeds the small-model window`)
      const big = clampProfileToModel(MULTI_AGENT_PROFILE, 'gpt-4o')
      if (big.totalBudget !== MULTI_AGENT_PROFILE.totalBudget) {
        failures.push('clamping wrongly reduced the budget on a large model')
      }
      return failures
    }
  },
  {
    id: 't13',
    covers: '100+ conversational turns — bounded context',
    title: 'A 120-turn conversation condenses to a bounded message list',
    run: () => {
      const messages = Array.from({ length: 120 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `turn ${i}: ${'filler '.repeat(30)}`
      }))
      const last = messages[messages.length - 1]
      const { messages: condensed, condensed: didCondense } = condenseConversation(messages)
      const total = condensed.reduce((n, m) => n + m.content.length, 0)
      const failures: string[] = []
      if (!didCondense) failures.push('120-turn conversation was not condensed')
      if (condensed.length >= messages.length) failures.push(`condensed list not smaller: ${condensed.length}`)
      if (total > 20_000) failures.push(`condensed conversation still too large (${total} chars)`)
      if (!condensed.some((m) => m.content.includes(last.content.slice(0, 20)))) {
        failures.push('most recent turn not kept verbatim after condensation')
      }
      if (!condensed[0].content.includes('Session recap')) failures.push('recap preamble missing')
      return failures
    }
  },
  {
    id: 't14',
    covers: '100+ turns — approved constraint retention',
    title: 'Approved constraints survive budget pressure in the final assembly',
    run: () => {
      const constraint = 'APPROVED CONSTRAINT: every manifest must cite directive R-77 within 30 calendar days.'
      const docText = renderBatch(chunkBlocks(extractBlocks(POLICY.html))) + ' padding '.repeat(3_000)
      const planned = planContext(
        { documentContent: docText, memoryContext: constraint, selection: 'selected '.repeat(600) },
        8_000 // deliberately tight — less than the sum of inputs
      )
      const failures: string[] = []
      const assembly = [
        planned.documentContent,
        planned.selection,
        planned.cursorContext,
        planned.storyboardContent,
        planned.scratchpad,
        planned.memoryContext
      ]
        .map((p) => p.content)
        .join('\n')
      if (!assembly.includes('R-77 within 30 calendar days')) {
        failures.push('approved constraint truncated away under budget pressure')
      }
      if (planned.totalChars > 8_000) failures.push(`assembly exceeded the tight budget: ${planned.totalChars}`)
      return failures
    }
  },
  {
    id: 't15',
    covers: 'Protected document — ephemeral mode',
    title: 'Protected documents refuse persistent memory',
    run: () => {
      const failures: string[] = []
      if (persistentMemoryAllowed(true)) failures.push('policy allowed persistence on a protected document')
      if (!persistentMemoryAllowed(false)) failures.push('policy disallowed persistence on a normal document')
      if (!persistentMemoryAllowed(undefined)) failures.push('policy disallowed persistence by default')
      return failures
    }
  },
  {
    id: 't16',
    covers: 'Protected document — no cached index',
    title: 'Ephemeral indexing leaves nothing behind after drop',
    run: () => {
      const index = new DocumentIndex()
      index.update(NOVEL.id, NOVEL.html) // transient: never registered persistent
      const before = topTexts(NOVEL.id, index, 'What did Vey sail east with at the end of the story?')
      if (!has(before, 'one sphere')) return ['transient index retrieval failed before drop — fixture broken']
      index.drop(NOVEL.id)
      const failures: string[] = []
      if (index.get(NOVEL.id) !== undefined) failures.push('dropped document still resolvable in the index')
      // A fresh transient index must reproduce the same retrieval (no stale
      // state dependency).
      const fresh = new DocumentIndex()
      fresh.update(NOVEL.id, NOVEL.html)
      if (!has(topTexts(NOVEL.id, fresh, 'What did Vey sail east with at the end of the story?'), 'one sphere')) {
        failures.push('fresh index failed to reproduce retrieval — state leaked between indexes')
      }
      return failures
    }
  },
  {
    id: 't17',
    covers: 'On-demand section expansion (§7.3)',
    title: 'extractSection returns exactly the requested ending',
    run: () => {
      const failures: string[] = []
      const a = extractSection(BRANCHED.html, 'Ending A')
      const b = extractSection(BRANCHED.html, 'Ending B')
      if (!a || !a.text.includes('shoal beacon')) failures.push('Ending A extraction missing its own content')
      if (a && a.text.includes('deckhand')) failures.push('Ending A extraction includes Ending B content')
      if (!b || !b.text.includes('deckhand')) failures.push('Ending B extraction missing its own content')
      if (b && b.text.includes('shoal beacon')) failures.push('Ending B extraction includes Ending A content')
      return failures
    }
  },
  {
    id: 't18',
    covers: 'Table/numbers are structurally indexed',
    title: 'Table rows keep cell structure and are retrievable',
    run: () => {
      const index = new DocumentIndex()
      index.update(PAPER.id, PAPER.html)
      const texts = topTexts(PAPER.id, index, 'latency table row for 50,000 word documents', 3)
      const failures: string[] = []
      if (!has(texts, '33 ms')) failures.push('table row value not retrieved')
      if (!texts.some((t) => t.includes('| 50,000 words |'))) failures.push('cell separators lost in table chunking')
      return failures
    }
  },
  {
    id: 't19',
    covers: 'Partial retrieval is disclosed (§7.3)',
    title: 'Retrieval formatting always labels the partial view',
    run: () => {
      const index = new DocumentIndex()
      const doc = index.update(PAPER.id, PAPER.html)
      const scored = rankChunks('What was the effect size against the prefix baseline?', doc.chunks, { k: 3 })
      const out = formatRetrieval(scored, doc.chunks.length)
      const failures: string[] = []
      if (!out.includes(RETRIEVAL_DISCLOSURE)) failures.push('partial-view disclosure missing')
      if (!out.includes('of') || !/\(\d+ of \d+ sections shown\)/.test(out)) {
        failures.push('section-count coverage line missing')
      }
      if (!out.includes('Section:')) failures.push('section locators missing in retrieval output')
      return failures
    }
  },
  {
    id: 't20',
    covers: 'Unknown local-model tokenizer (conservative estimate)',
    title: 'Unknown models fall back to the default budget, not a guess',
    run: () => {
      const failures: string[] = []
      const unknown = resolveContextProfile('totally-unknown-model-xyz')
      if (unknown.label !== 'default') failures.push(`unknown model got profile ${unknown.label}`)
      if (unknown.totalBudget !== DEFAULT_CONTEXT_CHAR_BUDGET) failures.push('unknown model budget drifted from default')
      // The assembly must still be bounded under the unknown-model budget.
      const planned = planContext(
        { documentContent: 'x'.repeat(50_000), selection: 'y'.repeat(10_000) },
        unknown.totalBudget
      )
      if (planned.totalChars > unknown.totalBudget) failures.push('overflow protection failed for unknown model')
      return failures
    }
  },
  {
    id: 't21',
    covers: 'Forget with compaction in flight',
    title: 'Forgotten content cannot reappear through summaries or replay',
    run: () => {
      // A compaction summary generated BEFORE the forget absorbed the
      // preference; the transcript also holds the original turn. The rebuild
      // filter must drop both — only unrelated turns survive.
      const forgotten = 'User prefers contractions and first person in all blog drafts'
      const suppression: SuppressionRecord = {
        entryId: 'mem_x',
        documentId: CASUAL_BLOG.id,
        scope: 'document',
        hashes: shingleHashes(forgotten),
        forgottenAt: Date.now()
      }
      const transcript = [
        { role: 'system', content: '[Compaction summary] Earlier the user said they prefer contractions and first person in all blog drafts. Also raisins are mandatory.' },
        { role: 'user', content: 'Please remember: I prefer contractions and first person in all blog drafts' },
        { role: 'assistant', content: 'Noted — contractions and first person from now on.' },
        { role: 'user', content: 'What did the ridge trail look like at dawn?' },
        { role: 'assistant', content: 'Fog sat in the valley like spilled milk; best call of the season.' }
      ]
      const { kept, dropped } = filterTranscriptForRebuild(transcript, [suppression])
      const failures: string[] = []
      if (dropped < 2) failures.push(`expected the absorbed summary and original turn to be dropped (dropped ${dropped})`)
      if (kept.some((t) => t.content.toLowerCase().includes('contractions and first person'))) {
        failures.push('forgotten preference still present in the rebuilt transcript')
      }
      if (!kept.some((t) => t.content.includes('spilled milk'))) {
        failures.push('unrelated turn was wrongly dropped from the rebuild')
      }
      return failures
    }
  },
  {
    id: 't22',
    covers: 'Collaboration access revoked',
    title: 'A revoked source yields no further recall and no re-learning',
    run: () => {
      // Revocation = ledger forgotten (suppressions recorded), structural
      // index dropped, projection disposed. Verified here over the pure
      // layers: nothing is retrievable afterwards and re-derivation is
      // blocked.
      const index = new DocumentIndex()
      index.update(FORMAL_REPORT.id, FORMAL_REPORT.html)
      const before = topTexts(FORMAL_REPORT.id, index, 'What was the on-time delivery rate for the quarter?', 3)
      const failures: string[] = []
      if (!has(before, '96.4')) failures.push('fixture broken — nothing retrievable before revocation')
      // The forget itself: suppressions from every entry of the document.
      const suppressions: SuppressionRecord[] = [
        'Vanguard Logistics achieved on-time delivery of 96.4 percent across the quarter',
        'The board confirms the Q4 on-time target of 97.5 percent'
      ].map((content, i) => ({
        entryId: `mem_revoked_${i}`,
        documentId: FORMAL_REPORT.id,
        scope: 'document' as const,
        hashes: shingleHashes(content),
        forgottenAt: Date.now()
      }))
      index.drop(FORMAL_REPORT.id) // revoked source: no further recall
      if (index.search(FORMAL_REPORT.id, 'on-time delivery rate', { k: 5 }).length > 0) {
        failures.push('revoked document still retrievable from the index')
      }
      // Re-learning gate: automatic extraction re-derives the fact by
      // quoting the document wording (near-verbatim) — suppressed by the
      // hash matcher. Paraphrases are the honest limit of hash-only
      // suppression and are not claimed.
      const rederived = 'Summary drafts should cite: Vanguard Logistics achieved on-time delivery of 96.4 percent across the quarter'
      if (filterTranscriptForRebuild([{ role: 'user', content: rederived }], suppressions).dropped !== 1) {
        failures.push('re-derivation of revoked content was not suppressed')
      }
      // Unrelated content is unaffected by the revocation.
      const unrelated = filterTranscriptForRebuild(
        [{ role: 'user', content: 'What time did we hit the ridge trail?' }],
        suppressions
      )
      if (unrelated.dropped !== 0) failures.push('revocation suppressions over-matched unrelated content')
      return failures
    }
  },
  {
    id: 't23',
    covers: 'Forget cascades to derived memories',
    title: 'Forgetting a source removes the summary that absorbed it',
    run: () => {
      const entries = [
        { id: 'e1' },
        { id: 'e2' },
        { id: 's1', derivedFrom: ['e1', 'e2'] },
        { id: 's2', derivedFrom: ['s1'] },
        { id: 'other', derivedFrom: ['e9'] }
      ]
      const cascade = planForgetCascade('e1', entries)
      const failures: string[] = []
      if (!cascade) return ['cascade returned null for an existing entry']
      if (!cascade.derivedIds.includes('s1')) failures.push('direct summary not cascaded')
      if (!cascade.derivedIds.includes('s2')) failures.push('transitive summary not cascaded')
      if (cascade.derivedIds.includes('other')) failures.push('unrelated derivation wrongly cascaded')
      if (cascade.derivedIds.includes('e2')) failures.push('sibling source wrongly cascaded (only derivations fall)')
      return failures
    }
  }
]

export interface TaskResult {
  task: EvalTask
  failures: string[]
}

export function runTasks(): TaskResult[] {
  return TASKS.map((task) => {
    let failures: string[]
    try {
      failures = task.run()
    } catch (err) {
      failures = [`task threw: ${err instanceof Error ? err.message : String(err)}`]
    }
    return { task, failures }
  })
}

/** Sanity: the fixture set must contain every document questions refer to. */
export function verifyFixtureSet(): string[] {
  const ids = new Set(EVAL_DOCUMENTS.map((d) => d.id))
  const failures: string[] = []
  for (const doc of [NOVEL, PAPER, POLICY, FORMAL_REPORT, CASUAL_BLOG, BRANCHED, BRANCHED_A, BRANCHED_B]) {
    if (!ids.has(doc.id) && doc !== BRANCHED_A && doc !== BRANCHED_B) {
      failures.push(`fixture missing from EVAL_DOCUMENTS: ${doc.id}`)
    }
    if (plainText(doc.html).length < 500) failures.push(`fixture suspiciously short: ${doc.id}`)
  }
  // The novel must place its final-section answer beyond the old 4,000-char
  // prefix window (t1's precondition).
  if (plainText(NOVEL.html).length <= 4_500) failures.push('novel fixture too short for the beyond-prefix task')
  return failures
}
