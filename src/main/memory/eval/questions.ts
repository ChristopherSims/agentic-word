/**
 * Labeled retrieval questions for the §14 evaluation dataset (50 total,
 * split exact vs paraphrase and reported separately per the release targets).
 *
 * A question is answered by retrieval alone: rank the document's chunks with
 * the query and look for the target marker in the top-k chunk texts. Markers
 * are unique to the intended section, so a hit means the right section was
 * retrieved — not just any section that mentions the topic.
 */

import { chunkBlocks, extractBlocks, rankChunks } from '../doc-index'
import { EVAL_DOCUMENTS, type EvalDocument } from './fixtures'

export type QuestionKind = 'exact' | 'paraphrase'

export interface RetrievalQuestion {
  id: string
  documentId: string
  kind: QuestionKind
  query: string
  /** distinctive text present only in the target section */
  marker: string
  /** human-readable target-section label for failure reporting */
  section: string
}

const q = (
  id: string,
  documentId: string,
  kind: QuestionKind,
  query: string,
  marker: string,
  section: string
): RetrievalQuestion => ({ id, documentId, kind, query, marker, section })

export const QUESTIONS: RetrievalQuestion[] = [
  // Novel (14)
  q('n1', 'eval-novel', 'exact', 'What cargo did the Pale Meg carry according to the lighthouse ledger manifest?', 'fenland glass', 'Prologue'),
  q('n2', 'eval-novel', 'exact', 'What gold coin did Elena Marsh pay the landlady with at Vesper Quay?', 'moidore', 'Chapter 1'),
  q('n3', 'eval-novel', 'exact', 'Where did Mrs. Quayle keep the true chandlery ledger?', 'oilcloth', 'Chapter 2'),
  q('n4', 'eval-novel', 'exact', 'On what night of the week did the Pale Meg go aground on the Meridian shoals?', 'Tuesday night', 'Chapter 3'),
  q('n5', 'eval-novel', 'exact', 'What did the registrar charge when Elena Marsh took a new single name?', 'two shillings', 'Chapter 4'),
  q('n6', 'eval-novel', 'exact', 'Which auction lot did Vey buy the salvaged glass spheres in?', 'lot seven', 'Chapter 5'),
  q('n7', 'eval-novel', 'exact', 'Who was the shadow agent for the phantom ship that never docked?', 'customs man', 'Chapter 6'),
  q('n8', 'eval-novel', 'exact', 'What was inside the unmarked strongbox in the salvage strong-room?', 'lined with lead', 'Chapter 7'),
  q('n9', 'eval-novel', 'exact', 'For how long was the lighthouse lamp deliberately darkened during the wreck?', 'darkened for six minutes', 'Chapter 8'),
  q('n10', 'eval-novel', 'exact', 'Which weekday does the Drymouth salvage register record for the wreck of the Pale Meg?', 'Wednesday', 'Chapter 9'),
  q('n11', 'eval-novel', 'exact', 'What did Vey sail east with at the end of the story?', 'one sphere', 'Epilogue'),
  q('n12', 'eval-novel', 'paraphrase', 'How did the keeper record the tides each morning for all those winters?', 'iron-gall ink', 'Prologue'),
  q('n13', 'eval-novel', 'paraphrase', 'Who kept using the old family name after the registry renaming?', 'still used Marsh', 'Chapter 4'),
  q('n14', 'eval-novel', 'paraphrase', 'What was clutched in the hands of the sailor who did not survive?', 'glass sphere the size of a fist', 'Chapter 3'),

  // Research paper (12)
  q('p1', 'eval-paper', 'exact', 'How many participants were enrolled in the study?', '412 participants', 'Methods'),
  q('p2', 'eval-paper', 'paraphrase', 'What kind of computer did the experiments run on?', '8-core 3.6 GHz', 'Methods'),
  q('p3', 'eval-paper', 'exact', 'What was recall at rank five for paraphrase queries?', '0.81', 'Results'),
  q('p4', 'eval-paper', 'exact', 'What was the effect size against the prefix baseline?', 'Cohen', 'Results'),
  q('p5', 'eval-paper', 'exact', 'By how much did cost per query fall against the embedding baseline?', '38.2 percent', 'Results'),
  q('p6', 'eval-paper', 'exact', 'What was the mean retrieval latency across the corpus?', '41 milliseconds', 'Results'),
  q('p7', 'eval-paper', 'exact', 'In the latency table, what is the mean for 50,000 word documents?', '33 ms', 'Table 1'),
  q('p8', 'eval-paper', 'exact', 'Which cohort was excluded from the headline figures?', 'n = 61', 'Limitations'),
  q('p9', 'eval-paper', 'exact', 'Who authored the Probabilistic Relevance Framework citation?', 'Probabilistic Relevance Framework', 'References'),
  q('p10', 'eval-paper', 'exact', 'What does the discussion propose instead of embeddings for the paraphrase gap?', 'terminology normalization', 'Discussion'),
  q('p11', 'eval-paper', 'paraphrase', 'How well did the top five results capture relevant items for verbatim queries?', '0.94', 'Results'),
  q('p12', 'eval-paper', 'paraphrase', 'How did the fixed prefix baseline perform on finding relevant material?', '12% recall', 'Abstract'),

  // Policy report (10)
  q('c1', 'eval-policy', 'exact', 'Within how many days must a salvage manifest be submitted to the registry?', '30 calendar days', 'Mandatory Requirements'),
  q('c2', 'eval-policy', 'exact', 'What ink must tide ledgers be written in?', 'iron-gall', 'Mandatory Requirements'),
  q('c3', 'eval-policy', 'exact', 'Where must records under an official seal be stored?', 'strong-room', 'Mandatory Requirements'),
  q('c4', 'eval-policy', 'exact', 'How close to a hostile shore extends the submission window to sixty days?', '10 nautical miles', 'Exceptions'),
  q('c5', 'eval-policy', 'exact', 'Which requirement are contractor letters exempt from?', 'countersignature', 'Exceptions'),
  q('c6', 'eval-policy', 'exact', 'What infraction category is failing to submit a manifest on time?', 'Category II', 'Enforcement'),
  q('c7', 'eval-policy', 'exact', 'What does a second failure within a rolling 24-month period escalate to?', 'Category III', 'Enforcement'),
  q('c8', 'eval-policy', 'exact', 'Which repealed window from R-76 must procedures stop referencing?', '14-day', 'Revision History'),
  q('c9', 'eval-policy', 'paraphrase', 'Are a keeper’s personal notebooks covered by this directive?', 'personal diaries', 'Scope'),
  q('c10', 'eval-policy', 'paraphrase', 'Who must authorize taking a copy of sealed records off the station?', "Superintendent's", 'Mandatory Requirements'),

  // Formal report (4)
  q('f1', 'eval-formal', 'paraphrase', 'How much did punctual delivery improve over the previous quarter?', '2.1 percentage points', 'Executive Summary'),
  q('f2', 'eval-formal', 'exact', 'What cost-per-mile ceiling did the board confirm for Q4?', '1.84', 'Quarterly Targets'),
  q('f3', 'eval-formal', 'exact', 'What register must the quarterly report be written in?', 'formal register', 'Style Requirements'),
  q('f4', 'eval-formal', 'exact', 'What dwell time did the northern depot achieve?', '7.3 hours', 'Operations Review'),

  // Casual blog (4)
  q('b1', 'eval-blog', 'exact', 'What time did we start up the ridge trail?', '5:40', 'The Ridge Trail at Dawn'),
  q('b2', 'eval-blog', 'exact', 'How much does the solo-pole shelter weigh?', '340 grams', 'Gear Confessions'),
  q('b3', 'eval-blog', 'exact', 'Which snack ingredient is banned?', 'yogurt pellets', 'Trail Snack Doctrine'),
  q('b4', 'eval-blog', 'exact', 'How long can sentences be under the blog house rules?', '15 words', 'House Rules'),

  // Branched document (6)
  q('br1', 'eval-branched', 'exact', 'What wax seal was on the message in the bottle?', 'anchor fluke', 'Trunk: The Message'),
  q('br2', 'eval-branched', 'exact', 'In Ending A, what did the registry do with the confession?', 'sealed for fifty years', 'Ending A'),
  q('br3', 'eval-branched', 'exact', 'In Ending A, what was posted on the shoals?', 'shoal beacon', 'Ending A'),
  q('br4', 'eval-branched', 'exact', 'What job did Ilves take after burning the page in Ending B?', 'deckhand', 'Ending B'),
  q('br5', 'eval-branched', 'exact', 'In Ending B, how long did the shoals remain unmarked?', 'another decade', 'Ending B'),
  q('br6', 'eval-branched', 'paraphrase', 'Who had to make the choice before the evening gun sounded?', 'Harbormaster Ilves', 'Trunk: The Decision')
]

// ─── Scoring (§14: score source selection and answer support separately) ───

export interface QuestionResult {
  question: RetrievalQuestion
  hit: boolean
  rank: number | null
}

export interface RetrievalMetrics {
  /** top-5 hit rate on exact (curated/source-linked) questions — gated ≥0.90 */
  exactRecallAt5: number
  /** top-5 hit rate on paraphrase questions — reported, not gated */
  paraphraseRecallAt5: number
  exactResults: QuestionResult[]
  paraphraseResults: QuestionResult[]
}

export function scoreRetrieval(
  questions: RetrievalQuestion[],
  documents: EvalDocument[] = EVAL_DOCUMENTS,
  k = 5
): RetrievalMetrics {
  const byId = new Map(documents.map((d) => [d.id, chunkBlocks(extractBlocks(d.html))]))
  const evaluate = (kind: QuestionKind): QuestionResult[] =>
    questions
      .filter((question) => question.kind === kind)
      .map((question) => {
        const chunks = byId.get(question.documentId) ?? []
        const ranked = rankChunks(question.query, chunks, { k })
        const marker = question.marker.toLowerCase()
        let rank: number | null = null
        ranked.forEach((s, i) => {
          // Markers are verified unique to one source region (see
          // verifyQuestionSet), so a marker hit proves the right source was
          // retrieved — not just any section that mentions the topic.
          if (rank === null && s.chunk.text.toLowerCase().includes(marker)) rank = i + 1
        })
        return { question, hit: rank !== null, rank }
      })

  const exactResults = evaluate('exact')
  const paraphraseResults = evaluate('paraphrase')
  const rate = (rs: QuestionResult[]) => (rs.length === 0 ? 1 : rs.filter((r) => r.hit).length / rs.length)
  return {
    exactRecallAt5: rate(exactResults),
    paraphraseRecallAt5: rate(paraphraseResults),
    exactResults,
    paraphraseResults
  }
}

/**
 * True when the matching chunks occupy a contiguous run of the chunk list.
 * Adjacent chunks share overlapping tail text, so a marker in the overlap
 * appears in consecutive chunks — that is one source region, not ambiguity.
 */
function isContiguousRun(indices: number[]): boolean {
  if (indices.length <= 1) return true
  const sorted = [...indices].sort((a, b) => a - b)
  return sorted[sorted.length - 1] - sorted[0] + 1 === sorted.length
}

/**
 * Mechanical integrity check for the labeled set (updates-2.md §G):
 * - every marker must actually occur (`missing`), and
 * - it must occur in exactly one source region (`ambiguous`) — overlapping
 *   chunks that repeat the same marker belong to one region and are not
 *   ambiguous.
 *
 * `section` is display metadata: the fixtures use document-level headings, so
 * section labels are reported (`sectionMismatches`) but not gated here.
 */
export interface QuestionSetIssues {
  missing: string[]
  ambiguous: string[]
  sectionMismatches: string[]
}

export function verifyQuestionSet(
  questions: RetrievalQuestion[] = QUESTIONS,
  documents: EvalDocument[] = EVAL_DOCUMENTS
): QuestionSetIssues {
  const byId = new Map(documents.map((d) => [d.id, chunkBlocks(extractBlocks(d.html))]))
  const issues: QuestionSetIssues = { missing: [], ambiguous: [], sectionMismatches: [] }
  for (const question of questions) {
    const chunks = byId.get(question.documentId)
    if (!chunks) {
      issues.missing.push(`${question.id}: unknown document ${question.documentId}`)
      continue
    }
    const marker = question.marker.toLowerCase()
    const matchIndices: number[] = []
    chunks.forEach((c, i) => {
      if (c.text.toLowerCase().includes(marker)) matchIndices.push(i)
    })
    if (matchIndices.length === 0) {
      issues.missing.push(question.id)
      continue
    }
    if (!isContiguousRun(matchIndices)) {
      issues.ambiguous.push(`${question.id} (${matchIndices.length} chunks)`)
    }
    const target = question.section.toLowerCase()
    if (!chunks[matchIndices[0]].headingPath.some((h) => h.toLowerCase().includes(target))) {
      issues.sectionMismatches.push(
        `${question.id}: expected "${question.section}" but chunk is under [${chunks[matchIndices[0]].headingPath.join(' › ')}]`
      )
    }
  }
  return issues
}

/** Human-readable per-question failure list for diagnosis. */
export function describeFailures(results: QuestionResult[]): string[] {
  return results
    .filter((r) => !r.hit)
    .map((r) => `${r.question.id} [${r.question.kind}] ${r.question.section}: "${r.question.query}" (marker: ${r.question.marker})`)
}
