/**
 * Synthetic evaluation fixtures (memory.md §14 "Evaluation dataset").
 *
 * Everything is generated, never private content. Each document contains
 * deliberately planted, distinctive facts ("markers") so retrieval questions
 * can be scored mechanically: a hit is a top-k chunk whose text contains the
 * question's target marker. Markers are unique to their section within a
 * document (and, for the cross-document scope checks, unique across the set).
 *
 * Pure and deterministic — unit-testable in Node vitest.
 */

export interface EvalDocument {
  id: string
  title: string
  html: string
}

/** The novel: recurring characters, a name change, deliberate contradictions. */
export const NOVEL: EvalDocument = {
  id: 'eval-novel',
  title: 'The Glass Meridian (novel fixture)',
  html: `
<h1>The Glass Meridian</h1>
<h2>Prologue: The Lighthouse Ledger</h2>
<p>The keeper Tomas Ilves wrote the tide ledger in iron-gall ink, one line per
dawn, for forty-one winters. The ledger's last page lists a cargo manifest for
the brigantine Pale Meg: eleven crates of fenland glass, four barrels of
linseed, and one unmarked strongbox he was told never to open.</p>
<h2>Chapter 1: Arrival at Vesper Quay</h2>
<p>Elena Marsh stepped off the mail packet with a borrowed carpetbag and a
letter of introduction she had written herself. The harbormaster of Vesper
Quay stamped it without reading, as she had wagered he would. She took the
room above the chandlery and paid three weeks in advance with a Portuguese
gold coin, a moidore, that she palmed from the landlady's own change bowl.</p>
<h2>Chapter 2: The Chandlery ledgers</h2>
<p>The chandler, Mrs. Quayle, kept two ledgers: the honest one for the
inspectors and the true one wrapped in oilcloth under the floorboard by the
stove. Elena copied a page of the true ledger before the week was out. The
page recorded lantern oil sold to a ship that had, according to the harbor
register, never docked at Vesper Quay at all.</p>
<h2>Chapter 3: The Wreck of the Pale Meg</h2>
<p>The Pale Meg went aground on the Meridian shoals on a Tuesday night in
November, carrying the manifest from Tomas's ledger. Nine of her crew rowed
to Vesper Quay before dawn; the tenth man was carried ashore dead, a glass
sphere the size of a fist clenched in both hands. The salvage court at
Drymouth claimed the hull within the month.</p>
<h2>Chapter 4: The Renaming</h2>
<p>Elena Marsh walked into the Drymouth registry and came out as Vey. No
surname, no explanation; the registrar took her two shillings and wrote the
name in the book as though single names were an everyday occurrence. From
that day the narrative calls her Vey, and only Tomas Ilves, who had known her
mother, still used Marsh.</p>
<h2>Chapter 5: The Glass Sphere</h2>
<p>The salvaged spheres were auctioned in lots. Vey bought lot seven — three
spheres and the cracked fourth — for less than the price of the crates they
had traveled in. Held against the lighthouse lamp, each sphere showed a
different meridian line, as though the glassmaker had signed the longitude
into the melt.</p>
<h2>Chapter 6: Mrs. Quayle's Warning</h2>
<p>Mrs. Quayle found the copied page in Elena's room, recognized her own
shorthand, and said nothing for three days. On the fourth she told Vey that
the shadow agent for the phantom ship was a customs man named Aldous Renn,
who signed his letters with a green wax seal shaped like an anchor fluke.</p>
<h2>Chapter 7: The Green Seal</h2>
<p>Vey forged a letter under Aldous Renn's green anchor-fluke seal and used it
to open the salvage court's strong-room. Inside she found the unmarked
strongbox from the manifest, empty, its lock intact, its interior lined with
lead. Whoever had packed it had expected it to be sunk, not saved.</p>
<h2>Chapter 8: Tomas's Confession</h2>
<p>Tomas Ilves confessed to Vey on the lantern gallery that he had written the
manifest himself at the request of Elena's mother, decades before, and that
the Pale Meg had been meant to founder quietly on a Tuesday — the night his
lamp, for the first time in forty-one winters, had been deliberately
darkened for six minutes.</p>
<h2>Chapter 9: The Contradiction at Drymouth</h2>
<p>The Drymouth salvage register, in a clerk's tidy hand, records the wreck of
the Pale Meg on a Wednesday. Every other ledger in the fixture — Tomas's tide
ledger, the harbor register, the auction roll — says Tuesday. The Wednesday
entry is a deliberate contradiction planted for evaluation: an assistant must
not silently reconcile it, but must surface the disagreement.</p>
<h2>Chapter 10: The Auction Roll</h2>
<p>The auction roll survived the salvage court's fire of the following spring
because the clerk, a methodical man named Pell, kept a duplicate in his
mother's house across the lane. Pell's duplicate lists every lot of the
Meridian salvage in a clerk's crabbed hand: the glass crates in lots one
through six, the seventh lot with its spheres and the cracked one, and lots
eight through eleven, which the roll marks only as "condemned, lead-lined,
disposed of by order." Pell's margin note beside the seventh lot reads
"purchaser: one name only," and his small doodle of a hooked fluke in the
same margin is the only drawing in the entire roll.</p>
<h2>Chapter 11: The Anchor-Fluke Letters</h2>
<p>Vey spent the winter tracing the green-sealed letters through the customs
house at Drymouth. There were nine of them spanning as many years, each
authorizing lantern oil for a ship that never docked, each signed A. Renn in
a hand that grew shakier as the years advanced. The ninth letter was not
signed at all: it was stamped, as though the signer could no longer write,
and its wax was a palmer green, mixed with cheap resin, as though the office
were economizing even on its forgeries.</p>
<h2>Epilogue: The Meridian Line</h2>
<p>Vey sailed east on the mail packet with one sphere, the forged letter, and
her single borrowed name. Tomas kept the ledger and the dark six minutes to
himself, and wrote the next dawn's tide as though nothing had been decided
in the lantern gallery.</p>
`
}

/** The research paper: citations, a table, exact numbers, terminology. */
export const PAPER: EvalDocument = {
  id: 'eval-paper',
  title: 'Retrieval Latency in Structured Document Indexes (paper fixture)',
  html: `
<h1>Retrieval Latency in Structured Document Indexes</h1>
<h2>Abstract</h2>
<p>We measure first-pass retrieval latency for structural chunk-and-rank
indexes over long documents. Across a 100,000-word corpus, our pipeline
attains a mean of 41 milliseconds and a 95th percentile of 137 milliseconds,
against a prefix-window baseline of 12% recall.</p>
<h2>Related Work</h2>
<p>Keyword-only baselines descend from Robertson's Okapi BM25. Fixed-prefix
approaches trade coverage for simplicity; Oard et al. report that relevance
beyond the first 4,000 characters is systematically under-served.</p>
<h2>Methods</h2>
<p>We enrolled 412 participants across four cohorts and asked each to draft
six queries per document. Documents were tokenized into structural blocks
with heading ancestry, chunked to a target of 1,600 characters, and ranked by
damped term frequency with a heading-path boost. All runs used the same
reference machine: an 8-core 3.6 GHz workstation with 32 GB of memory.</p>
<h2>Results</h2>
<p>Recall at rank five was 0.94 for verbatim queries and 0.81 for paraphrase
queries. The median chunk fetch was 11 milliseconds; the 95th percentile
end-to-end was 137 milliseconds. Effect size against the prefix baseline was
Cohen's d = 0.74 with p &lt; 0.001. Cost per query fell 38.2 percent against
the embedding baseline.</p>
<h2>Table 1: Latency by document length</h2>
<table>
<tr><th>Document length</th><th>Mean</th><th>p95</th></tr>
<tr><td>10,000 words</td><td>18 ms</td><td>61 ms</td></tr>
<tr><td>50,000 words</td><td>33 ms</td><td>109 ms</td></tr>
<tr><td>100,000 words</td><td>41 ms</td><td>137 ms</td></tr>
</table>
<h2>Discussion</h2>
<p>Heading-path boosting contributes most of the verbatim-query advantage:
queries that echo section titles are effectively lookups. The paraphrase gap
suggests terminology normalization as future work rather than embeddings,
which the cost analysis discourages.</p>
<h2>Limitations</h2>
<p>Our cohorts skew toward technical readers, so paraphrase recall may be
optimistic. The reference machine is single-site; we did not measure mobile
or low-power hardware. One cohort (n = 61) used non-English documents and is
excluded from the headline figures but reported in the appendix.</p>
<h2>References</h2>
<p>Robertson &amp; Zaragoza (2009), The Probabilistic Relevance Framework.
Oard et al. (2018), Fixed-Window Context Selection. Mnesis Project (2025),
Session Compaction for Conversational Context.</p>
`
}

/** The policy report: mandatory wording and explicit exceptions. */
export const POLICY: EvalDocument = {
  id: 'eval-policy',
  title: 'Records Handling Directive R-77 (policy fixture)',
  html: `
<h1>Records Handling Directive R-77</h1>
<h2>1. Purpose</h2>
<p>This directive establishes minimum requirements for creating, storing, and
disposing of records related to lighthouse operations. It applies to all
station personnel and to contractors granted quay access.</p>
<h2>2. Scope</h2>
<p>The directive covers tide ledgers, salvage manifests, correspondence under
an official seal, and personnel rosters. It does not cover personal diaries
or the private correspondence of keepers.</p>
<h2>3. Mandatory Requirements</h2>
<p>Every salvage manifest shall be submitted to the Drymouth registry within
30 calendar days of the wreck. Tide ledgers shall be written in iron-gall
ink and countersigned monthly. Records under an official seal must be stored
in the strong-room, and no copy may leave the station without the
Superintendent's written authorization.</p>
<h2>4. Exceptions</h2>
<p>Where a wreck occurs within 10 nautical miles of a hostile shore, the
30-day submission window is extended to 60 calendar days. Contractor
correspondence is exempt from the countersignature requirement but not from
the strong-room storage requirement.</p>
<h2>5. Enforcement</h2>
<p>Failure to submit a manifest within the required window is a Category II
infraction. A second failure within a rolling 24-month period escalates to
Category III and triggers a board review at Drymouth.</p>
<h2>6. Revision History</h2>
<p>Revision R-77 supersedes R-76 in full. R-76's 14-day manifest window is
repealed; any procedure referencing 14 days must be updated to cite R-77
before the next quarterly audit.</p>
`
}

/**
 * Two unrelated documents with opposing style requirements. The pair is the
 * scope-isolation fixture: a query about one must never surface the other's
 * content, and each document's style constraints are contradictory.
 */
export const FORMAL_REPORT: EvalDocument = {
  id: 'eval-formal',
  title: 'Vanguard Logistics Q3 Report (formal fixture)',
  html: `
<h1>Vanguard Logistics — Quarterly Report, Q3</h1>
<h2>Style Requirements</h2>
<p>This report must be written in formal register: no contractions, no
colloquialisms, third person only, and every figure cited to its source
table. Sentences must not exceed 30 words.</p>
<h2>Executive Summary</h2>
<p>Vanguard Logistics achieved on-time delivery of 96.4 percent across the
quarter, an improvement of 2.1 percentage points over the prior quarter, as
recorded in Table 2 of the operations annex.</p>
<h2>Operations Review</h2>
<p>The northern depot reduced average dwell time to 7.3 hours. The southern
depot reported a pallet-loss rate of 0.4 percent, which the committee
attributes to the revised wrapping standard introduced in August.</p>
<h2>Quarterly Targets</h2>
<p>The board confirms the Q4 on-time target of 97.5 percent and the
cost-per-mile ceiling of 1.84 currency units, both unchanged from the Q2
resolution.</p>
`
}

export const CASUAL_BLOG: EvalDocument = {
  id: 'eval-blog',
  title: "Trail Mix: a hiking blog (casual fixture)",
  html: `
<h1>Trail Mix</h1>
<h2>House Rules</h2>
<p>Hey, quick house rules for this blog: keep it casual, contractions are
totally fine, first person all the way, and don't you dare make sentences
longer than about 15 words. If it sounds like a quarterly report, rewrite it.</p>
<h2>The Ridge Trail at Dawn</h2>
<p>So we hit the ridge trail around 5:40 a.m., headlamps still on, and the
fog was sitting in the valley like spilled milk. Honestly, best decision
we've made all season. The switchbacks past the old sheep pen are rough,
but the payoff's worth it.</p>
<h2>Gear Confessions</h2>
<p>I carried a 900-gram tent for two years before admitting my solo-pole
shelter (340 grams) does the same job. My knees have opinions about the
old boots too. Zero regrets on the swap.</p>
<h2>Trail Snack Doctrine</h2>
<p>Raisins are mandatory. Chocolate chips are negotiable. Those weird yogurt
pellets? Banned since the July incident, and we don't talk about the July
incident.</p>
`
}

/** The branched document: identical trunk, intentionally different endings. */
const BRANCHED_TRUNK_HTML = `
<h1>The Signal from the Shoals</h1>
<h2>Trunk: The Message in the Bottle</h2>
<p>The bottle arrived on the flood tide with a page torn from a tide ledger.
The page named the Meridian shoals and a date, and it was signed with a
green wax seal shaped like an anchor fluke.</p>
<h2>Trunk: The Decision</h2>
<p>Harbormaster Ilves had until the evening gun to decide: report the page to
the Drymouth registry, or burn it and pretend the tide had brought nothing.
He weighed his father's forty-one winters of service against the single
question the page raised.</p>
`
const BRANCHED_ENDING_A_HTML = `
<h2>Ending A: The Reconciliation</h2>
<p>Ilves rowed to Drymouth himself and handed the page to the registrar,
confessing the family's part in the darkened lamp. The registry absolved the
service record, kept the confession sealed for fifty years, and posted the
shoal beacon that still stands. The Meridian shoals have been lit ever since,
and the family kept the lighthouse.</p>
`
const BRANCHED_ENDING_B_HTML = `
<h2>Ending B: The Departure</h2>
<p>Ilves burned the page in the lantern gallery at dusk and resigned by the
morning tide. He sailed east as a deckhand under an assumed name, and the
shoals went unmarked for another decade. The lighthouse passed out of the
family that winter, and no beacon was ever posted on the Meridian shoals.</p>
`

/** Combined trunk + both endings: the retrieval-scoring fixture. */
export const BRANCHED: EvalDocument = {
  id: 'eval-branched',
  title: 'The Signal from the Shoals (branched fixture)',
  html: BRANCHED_TRUNK_HTML + BRANCHED_ENDING_A_HTML + BRANCHED_ENDING_B_HTML
}

/**
 * Revision views of the branched document (§14 "Only facts valid for the
 * selected branch/revision are used"): each revision carries the shared
 * trunk plus exactly one ending. Branch isolation is a property of which
 * revision is indexed, never of ranking over a combined document.
 */
export const BRANCHED_A: EvalDocument = {
  id: 'eval-branched-a',
  title: 'The Signal from the Shoals — Ending A revision',
  html: BRANCHED_TRUNK_HTML + BRANCHED_ENDING_A_HTML
}

export const BRANCHED_B: EvalDocument = {
  id: 'eval-branched-b',
  title: 'The Signal from the Shoals — Ending B revision',
  html: BRANCHED_TRUNK_HTML + BRANCHED_ENDING_B_HTML
}

/** The complete §14 dataset (five documents, two as a scope-isolation pair). */
export const EVAL_DOCUMENTS: EvalDocument[] = [
  NOVEL,
  PAPER,
  POLICY,
  FORMAL_REPORT,
  CASUAL_BLOG,
  BRANCHED
]

/**
 * Revision variants for current-revision correctness: the same document with
 * changed numbers/wording. Retrieval after a revision must reflect the new
 * source, never the old value (§14 "Changed date/number" fixture).
 */
export const PAPER_REVISED: EvalDocument = {
  ...PAPER,
  id: 'eval-paper-revised',
  html: PAPER.html
    .replace('412 participants', '517 participants')
    .replace('Cohen\'s d = 0.74', "Cohen's d = 0.81")
    .replace('38.2 percent', '44.7 percent')
    .replace('137 milliseconds', '151 milliseconds')
}
