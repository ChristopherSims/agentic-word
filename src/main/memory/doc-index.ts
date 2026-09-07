/**
 * Document structure index and retrieval (memory.md §7, Phase 3)
 *
 * First release: structural chunking + FTS-style ranking — explicitly no
 * embeddings (§7.2). Everything in this module is pure and Electron-free so
 * it is unit-testable in Node vitest.
 *
 * The tokenizer below is structural, not a regex HTML stripper: it walks the
 * tag sequence, tracks heading ancestry, and preserves block boundaries and
 * locators so retrieved chunks can cite sections instead of "I remember"
 * (§7.3). It is tolerant of imperfect HTML — a stray `<` that isn't a tag is
 * treated as text.
 */

// ─── Block extraction (§7.1 steps 1–2, 4) ───

export type BlockKind = 'heading' | 'paragraph' | 'listItem' | 'tableRow' | 'quote'

export interface DocBlock {
  /** ordinal position in the document — a stable locator */
  index: number
  kind: BlockKind
  /** heading level 1–6 (headings only) */
  level?: number
  /** plain text content (entities decoded, inner tags removed) */
  text: string
  /** heading ancestry at this block, e.g. ['Chapter 1', 'Scene 2'] */
  headingPath: string[]
}

const BLOCK_TAGS: Record<string, BlockKind> = {
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  p: 'paragraph',
  li: 'listItem',
  tr: 'tableRow',
  blockquote: 'quote'
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  eacute: 'é', aacute: 'á', agrave: 'à', uuml: 'ü', ouml: 'ö', ccedil: 'ç'
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = parseInt(name.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (name.startsWith('#')) {
      const code = parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name] ?? whole
  })
}

/** Remove inner inline tags, keeping their text (e.g. <b>bold</b> → bold). */
function stripInlineTags(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

/** Tolerant structural tokenizer: blocks with heading ancestry preserved. */
export function extractBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = []
  // Heading ancestry stack: [level, text]. The active path is the ancestry.
  const headingStack: Array<{ level: number; text: string }> = []
  let open: { tag: string; parts: string[] } | null = null
  let i = 0

  const pushBlock = (kind: BlockKind, text: string, level?: number) => {
    const trimmed = text.replace(/\s+/g, ' ').trim()
    if (!trimmed) return
    blocks.push({
      index: blocks.length,
      kind,
      ...(level !== undefined ? { level } : {}),
      text: trimmed,
      headingPath: headingStack.map((h) => h.text)
    })
  }

  const flushOpen = () => {
    if (!open) return
    pushBlock(BLOCK_TAGS[open.tag] ?? 'paragraph', decodeEntities(stripInlineTags(open.parts.join(''))))
    open = null
  }

  // A closing tag that ends the open block (or its container). Inline close
  // tags like </b> or </span> inside a paragraph must NOT flush it.
  const closesOpen = (closeName: string): boolean => {
    if (!open) return false
    return closeName === open.tag ||
      (closeName === 'table' && open.tag === 'tr') ||
      ((closeName === 'ul' || closeName === 'ol' || closeName === 'blockquote') &&
        (open.tag === 'li' || open.tag === 'p' || open.tag === 'quote'))
  }

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    const gt = html.indexOf('>', lt)
    if (gt === -1) {
      // Malformed tail — treat the remainder as inside the open block if any.
      if (open) open.parts.push(html.slice(lt))
      break
    }
    const rawTag = html.slice(lt + 1, gt)
    const isClosing = rawTag.startsWith('/')
    const tagNameMatch = rawTag.match(isClosing ? /^\/([a-zA-Z][a-zA-Z0-9]*)/ : /^([a-zA-Z][a-zA-Z0-9]*)/)
    const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : ''
    const inner = html.slice(i, lt)

    if (open) {
      // Inside a block: text belongs to it.
      open.parts.push(inner)
      if (isClosing) {
        if (closesOpen(tagName)) flushOpen()
        // Inline close tags are dropped (already stripped at render time).
        i = gt + 1
        continue
      }
      if (tagName === 'td' || tagName === 'th') {
        // Cell boundary inside a table row: join cells with ' | '.
        if (open.parts.join('').trim()) open.parts.push(' | ')
        i = gt + 1
        continue
      }
      if (BLOCK_TAGS[tagName]) {
        // Nested structural tag (e.g. <p> inside <blockquote>, <li> inside
        // <li>): close the outer block first — the flat block list keeps
        // locators simple. Then fall through so this tag opens the next one.
        flushOpen()
      } else {
        // Inline open tag (e.g. <b>): its text arrives as `inner` later.
        i = gt + 1
        continue
      }
    }

    if (isClosing || tagName.startsWith('!') || rawTag.startsWith('!')) {
      // Comments, doctype, closing tags outside any block: no effect.
      i = gt + 1
      continue
    }

    const kind = BLOCK_TAGS[tagName]
    if (kind === 'heading') {
      // Headings become blocks themselves and update the ancestry stack.
      // Update the stack FIRST so the heading block's own path includes
      // itself (a section heading is its own locator, not the previous
      // section's).
      const closeIdx = html.toLowerCase().indexOf(`</${tagName}>`, gt)
      const segEnd = closeIdx === -1 ? html.length : closeIdx
      const headingText = decodeEntities(stripInlineTags(html.slice(gt + 1, segEnd))).replace(/\s+/g, ' ').trim()
      const level = parseInt(tagName.slice(1), 10)
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop()
      }
      if (headingText) headingStack.push({ level, text: headingText })
      pushBlock('heading', headingText, level)
      i = closeIdx === -1 ? html.length : html.toLowerCase().indexOf('>', segEnd) + 1
      continue
    }

    if (kind) {
      open = { tag: tagName, parts: [] }
      i = gt + 1
      continue
    }

    i = gt + 1
  }

  flushOpen()
  return blocks
}

// ─── Chunking (§7.1 step 3) ───

export interface DocChunk {
  /** stable locator: first–last block ordinals */
  startBlock: number
  endBlock: number
  /** heading ancestry of the first block in the chunk */
  headingPath: string[]
  /** rendered text (heading path + block texts) */
  text: string
  /** content hash for change detection (§7.1 step 5) */
  hash: string
}

/** djb2-style 32-bit hash rendered as hex — stable, fast, adequate for
 * change detection (not cryptographic). */
export function contentHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}

export interface ChunkOptions {
  /** target chunk size in characters (~1600 ≈ 400 tokens) */
  targetChars?: number
  /** hard maximum (~2800 ≈ 700 tokens) */
  maxChars?: number
  /** tail text repeated at the head of the next chunk */
  overlapChars?: number
}

const DEFAULT_CHUNK: Required<ChunkOptions> = {
  targetChars: 1600,
  maxChars: 2800,
  overlapChars: 200
}

/**
 * Group consecutive blocks into chunks of roughly 300–700 tokens with modest
 * overlap, keeping section (heading path) boundaries when possible (§7.1).
 */
export function chunkBlocks(blocks: DocBlock[], opts: ChunkOptions = {}): DocChunk[] {
  const { targetChars, maxChars, overlapChars } = { ...DEFAULT_CHUNK, ...opts }
  const chunks: DocChunk[] = []
  let current: DocBlock[] = []
  let currentPath: string[] = []
  let currentSize = 0

  const flush = () => {
    if (current.length === 0) return
    const text = renderChunk(current, overlapChars, chunks[chunks.length - 1])
    chunks.push({
      startBlock: current[0].index,
      endBlock: current[current.length - 1].index,
      headingPath: currentPath,
      text,
      hash: contentHash(text)
    })
    current = []
    currentSize = 0
  }

  for (const block of blocks) {
    const isHeading = block.kind === 'heading'
    // A new top-of-section heading closes the current chunk so sections stay
    // addressable (unless the chunk is tiny — headings alone aren't worth a chunk).
    if (isHeading && currentSize > 0 && (currentPath.length === 0 || block.headingPath.length <= currentPath.length)) {
      flush()
    }
    if (current.length === 0) currentPath = block.headingPath
    current.push(block)
    currentSize += block.text.length + 1
    if (currentSize >= targetChars) flush()
  }
  flush()

  // Enforce the hard maximum on oversized single blocks (a single block
  // larger than maxChars is split at the character level as a last resort).
  return chunks.map((c) =>
    c.text.length > maxChars
      ? { ...c, text: c.text.slice(0, maxChars), hash: contentHash(c.text.slice(0, maxChars)) }
      : c
  )
}

function renderChunk(blocks: DocBlock[], overlapChars: number, previous?: DocChunk): string {
  const lines: string[] = []
  for (const b of blocks) {
    if (b.kind === 'heading') lines.push(`# ${b.text}`)
    else if (b.kind === 'tableRow') lines.push(`| ${b.text} |`)
    else lines.push(b.text)
  }
  let text = lines.join('\n')
  // Modest overlap with the previous chunk for cross-boundary continuity.
  // The tail is capped relative to the previous chunk's own size so a tiny
  // previous chunk is never duplicated wholesale (that would make every
  // later chunk "match" everything the earlier one did).
  if (previous && overlapChars > 0) {
    const tailLen = Math.min(overlapChars, Math.floor(previous.text.length / 4))
    const tail = previous.text.slice(-tailLen)
    if (tail) text = `${tail}\n${text}`
  }
  return text
}

// ─── FTS-style ranking (§7.2) ───

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'of', 'to', 'in', 'on', 'at', 'for',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'with', 'as',
  'by', 'from', 'you', 'your', 'i', 'me', 'my', 'we', 'our', 'they', 'them', 'their',
  'he', 'she', 'his', 'her', 'will', 'would', 'can', 'could', 'should', 'do', 'does',
  'did', 'not', 'no', 'so', 'what', 'which', 'who', 'when', 'where', 'how', 'about'
])

/** Lowercase word tokens, stopwords and 2-char noise removed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\uffff]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

export interface ScoredChunk {
  chunk: DocChunk
  score: number
  /** distinct query terms matched in this chunk */
  matchedTerms: string[]
}

export interface RankOptions {
  /** maximum chunks returned */
  k?: number
  /** diversity cap (§7.2): max chunks sharing one leaf section */
  perSectionCap?: number
}

const DEFAULT_RANK: Required<RankOptions> = { k: 5, perSectionCap: 2 }

/**
 * FTS-style ranking without embeddings (§7.2): term frequency with sqrt
 * damping, heading-path term boost, exact-phrase boost, and a distinct-term
 * coverage bonus so a chunk matching more of the query outranks one repeating
 * a single term. Diversity: at most `perSectionCap` chunks per leaf section so
 * near-identical sections can't consume the budget.
 */
export function rankChunks(query: string, chunks: DocChunk[], opts: RankOptions = {}): ScoredChunk[] {
  const { k, perSectionCap } = { ...DEFAULT_RANK, ...opts }
  const terms = Array.from(new Set(tokenize(query)))
  if (terms.length === 0) return []
  const phrase = query.trim().toLowerCase()

  const scored: ScoredChunk[] = chunks.map((chunk) => {
    const lowerText = chunk.text.toLowerCase()
    const lowerPath = chunk.headingPath.join(' > ').toLowerCase()
    const counts = new Map<string, number>()
    let score = 0
    for (const term of terms) {
      let tf = 0
      let idx = lowerText.indexOf(term)
      while (idx !== -1) {
        tf++
        idx = lowerText.indexOf(term, idx + term.length)
      }
      if (tf === 0) continue
      counts.set(term, tf)
      // sqrt damping: repetition helps sublinearly (§7.2 diversity)
      score += Math.sqrt(tf)
      // exact-term-in-heading boost — headings carry intent
      if (lowerPath.includes(term)) score += 1.5
    }
    // Exact phrase (multi-term) is strong evidence of relevance.
    if (terms.length > 1 && phrase.length > 3 && lowerText.includes(phrase)) score += 2
    // Coverage bonus: matching more distinct query terms matters more than
    // repeating one — recency or repetition alone must not win (§7.2).
    const coverage = counts.size / terms.length
    score *= 0.5 + 0.5 * coverage + coverage
    return { chunk, score, matchedTerms: Array.from(counts.keys()) }
  })

  // Diversity: cap chunks per leaf section.
  const perSection = new Map<string, number>()
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.startBlock - b.chunk.startBlock)
    .filter((s) => {
      const key = s.chunk.headingPath.join(' > ')
      const used = perSection.get(key) ?? 0
      if (used >= perSectionCap) return false
      perSection.set(key, used + 1)
      return true
    })
    .slice(0, k)
}

// ─── Per-document index with change detection (§7.1 steps 5–6) ───

export interface IndexedDocument {
  /** content hash of the indexed HTML */
  hash: string
  chunks: DocChunk[]
}

export class DocumentIndex {
  private docs = new Map<string, IndexedDocument>()

  /**
   * Index a document revision. Re-indexing identical content is a no-op
   * (change detection by hash). A newer call for the same key supersedes any
   * earlier job — there are no async jobs, so supersession is inherent.
   */
  update(documentId: string, html: string): IndexedDocument {
    const hash = contentHash(html)
    const existing = this.docs.get(documentId)
    if (existing && existing.hash === hash) return existing
    const chunks = chunkBlocks(extractBlocks(html))
    const doc: IndexedDocument = { hash, chunks }
    this.docs.set(documentId, doc)
    return doc
  }

  get(documentId: string): IndexedDocument | undefined {
    return this.docs.get(documentId)
  }

  /** Query-relevant chunks for a document, ranked (§7.2). */
  search(documentId: string, query: string, opts: RankOptions = {}): ScoredChunk[] {
    const doc = this.docs.get(documentId)
    if (!doc) return []
    return rankChunks(query, doc.chunks, opts)
  }

  drop(documentId: string): void {
    this.docs.delete(documentId)
  }
}

// ─── Whole-document passes (§7.4: coverage, not top-k) ───

/**
 * Section outline: deduplicated heading paths in document order, indented
 * by path depth. Used to enumerate a document's sections (§7.4 step 1)
 * and to disclose coverage of whole-document tasks.
 */
export function buildOutline(blocks: DocBlock[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const b of blocks) {
    if (b.kind !== 'heading' || b.headingPath.length === 0) continue
    const key = b.headingPath.join(' > ')
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(`${'  '.repeat(b.headingPath.length - 1)}${b.headingPath[b.headingPath.length - 1]}`)
  }
  return lines.join('\n')
}

export interface BatchPlan {
  /** batches of chunks in document order, each within batchChars */
  batches: DocChunk[][]
  /** chunks too large for a batch even alone (always counted, never hidden) */
  skipped: number
}

/**
 * Group chunks into bounded batches for whole-document processing
 * (§7.4: "enumerate the document's sections and process them in bounded
 * batches"). Batches never split a chunk; an oversized chunk is skipped and
 * counted so coverage can be labeled accurately.
 */
export function planBatches(chunks: DocChunk[], batchChars: number): BatchPlan {
  const batches: DocChunk[][] = []
  let current: DocChunk[] = []
  let currentChars = 0
  let skipped = 0
  const flush = () => {
    if (current.length > 0) batches.push(current)
    current = []
    currentChars = 0
  }
  for (const chunk of chunks) {
    if (chunk.text.length > batchChars) {
      skipped++
      continue
    }
    if (currentChars + chunk.text.length > batchChars && current.length > 0) flush()
    current.push(chunk)
    currentChars += chunk.text.length
  }
  flush()
  return { batches, skipped }
}

/**
 * Render a batch as prompt content with section locators (§7.3: items carry
 * document locators so results can cite sections).
 */
export function renderBatch(chunks: DocChunk[]): string {
  const lines: string[] = []
  for (const chunk of chunks) {
    if (chunk.headingPath.length > 0) {
      lines.push(`[Section: ${chunk.headingPath.join(' > ')}]`)
    }
    lines.push(chunk.text)
    lines.push('')
  }
  return lines.join('\n').trim()
}

// ─── Prompt formatting (§7.3: cite sections, disclose partial retrieval) ───

export const RETRIEVAL_DISCLOSURE =
  '[Partial document view — sections retrieved by relevance to your request. Use document_read for anything not shown or for exact quotations.]'

/**
 * Render ranked chunks as prompt context with section locators. Chunks carry
 * their heading ancestry inline; the disclosure makes clear this is a partial,
 * query-conditioned view of a larger document (§7.1 step 7, §7.3).
 */
export function formatRetrieval(scored: ScoredChunk[], totalChunks: number): string {
  const lines = [RETRIEVAL_DISCLOSURE, `(${scored.length} of ${totalChunks} sections shown)`]
  for (const s of scored) {
    lines.push('')
    if (s.chunk.headingPath.length > 0) {
      lines.push(`Section: ${s.chunk.headingPath.join(' > ')}`)
    }
    lines.push(s.chunk.text)
  }
  return lines.join('\n')
}
