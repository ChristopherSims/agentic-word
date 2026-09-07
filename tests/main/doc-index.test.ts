/**
 * Unit tests for the document structure index and FTS retrieval
 * (memory.md §7, Phase 3). Pure module — no Electron imports.
 */

import { describe, it, expect } from 'vitest'
import {
  extractBlocks,
  chunkBlocks,
  rankChunks,
  tokenize,
  contentHash,
  DocumentIndex,
  formatRetrieval,
  RETRIEVAL_DISCLOSURE
} from '../../src/main/memory/doc-index'

describe('extractBlocks (§7.1 structure, not prefix)', () => {
  it('extracts paragraphs with heading ancestry preserved', () => {
    const blocks = extractBlocks('<h1>Chapter 1</h1><p>Opening line.</p><h2>Scene 2</h2><p>Later.</p>')
    expect(blocks.map((b) => b.text)).toEqual(['Chapter 1', 'Opening line.', 'Scene 2', 'Later.'])
    // A heading block's path includes itself (its own locator).
    expect(blocks[0].headingPath).toEqual(['Chapter 1'])
    expect(blocks[1].headingPath).toEqual(['Chapter 1'])
    expect(blocks[2].headingPath).toEqual(['Chapter 1', 'Scene 2'])
    expect(blocks[3].headingPath).toEqual(['Chapter 1', 'Scene 2'])
    expect(blocks[0].kind).toBe('heading')
    expect(blocks[1].kind).toBe('paragraph')
  })

  it('pops the heading stack when a shallower heading appears', () => {
    const blocks = extractBlocks('<h1>A</h1><h2>B</h2><p>in b</p><h1>C</h1><p>in c</p>')
    expect(blocks[2].headingPath).toEqual(['A', 'B'])
    expect(blocks[4].headingPath).toEqual(['C'])
  })

  it('flattens table rows with cell separators, keeping inline formatting', () => {
    const blocks = extractBlocks('<table><tr><td>Name</td><td>Value</td></tr><tr><td>alpha</td><td>1</td></tr></table>')
    expect(blocks.map((b) => b.text)).toEqual(['Name | Value', 'alpha | 1'])
    expect(blocks.every((b) => b.kind === 'tableRow')).toBe(true)
  })

  it('keeps inline tags as text and does not flush paragraphs on inline close tags', () => {
    const blocks = extractBlocks('<p>plain <b>bold</b> and <i>italic</i>.</p>')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('plain bold and italic.')
  })

  it('extracts list items', () => {
    const blocks = extractBlocks('<h2>Checklist</h2><ul><li>first item</li><li>second item</li></ul>')
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'listItem', 'listItem'])
    expect(blocks[1].text).toBe('first item')
    expect(blocks[1].headingPath).toEqual(['Checklist'])
  })

  it('decodes entities including numeric, hex, and Unicode text', () => {
    const blocks = extractBlocks('<p>Tom &amp; Jerry &#8212; caf&eacute; &#x201C;quoted&#x201D;</p>')
    expect(blocks[0].text).toBe('Tom & Jerry — café \u201cquoted\u201d')
  })

  it('ignores stray top-level text, comments, and doctype', () => {
    const blocks = extractBlocks('<!DOCTYPE html><!-- hi --><p>kept</p>')
    expect(blocks.map((b) => b.text)).toEqual(['kept'])
  })
})

describe('chunkBlocks (§7.1 ~300–700 token chunks with overlap)', () => {
  function blocksFor(n: number, prefix: string): ReturnType<typeof extractBlocks> {
    const html = Array.from({ length: n }, (_, i) => `<p>${prefix} paragraph ${i} ${'lorem ipsum dolor sit amet '.repeat(8)}</p>`).join('')
    return extractBlocks(html)
  }

  it('groups blocks into bounded chunks and preserves locators', () => {
    const blocks = blocksFor(30, 'A')
    const chunks = chunkBlocks(blocks, { targetChars: 1200, maxChars: 2000 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(2000)
      expect(c.startBlock).toBeLessThanOrEqual(c.endBlock)
    }
    // Locators are contiguous and non-overlapping in block ordinals.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startBlock).toBeGreaterThanOrEqual(chunks[i - 1].startBlock)
    }
  })

  it('adds modest overlap between consecutive chunks', () => {
    const blocks = blocksFor(30, 'A')
    const withOverlap = chunkBlocks(blocks, { targetChars: 1200, overlapChars: 100 })
    const noOverlap = chunkBlocks(blocks, { targetChars: 1200, overlapChars: 0 })
    expect(withOverlap[1].text.length).toBeGreaterThan(noOverlap[1].text.length)
  })

  it('starts a new chunk at each section heading', () => {
    const blocks = extractBlocks(
      '<h1>One</h1><p>a</p><h1>Two</h1><p>b</p><h1>Three</h1><p>c</p>'
    )
    const chunks = chunkBlocks(blocks)
    expect(chunks).toHaveLength(3)
    // The heading path recorded is the path of the first block in the chunk.
    expect(chunks[0].headingPath).toEqual(['One'])
    expect(chunks[1].headingPath).toEqual(['Two'])
    expect(chunks[0].text).toContain('# One')
  })
})

describe('rankChunks (§7.2 FTS ranking, no embeddings)', () => {
  const chunks = chunkBlocks(extractBlocks(
    '<h1>Brewing</h1><p>The French press requires coarse coffee grounds and four minutes of steeping.</p>' +
    '<h1>Roasting</h1><p>Dark roast beans lose acidity during the long roasting process.</p>' +
    '<h1>History</h1><p>Coffee originated in Ethiopia according to most historians.</p>'
  ))

  it('ranks the section matching the query terms highest', () => {
    const scored = rankChunks('How long should French press coffee steep?', chunks)
    expect(scored.length).toBeGreaterThan(0)
    expect(scored[0].chunk.headingPath).toEqual(['Brewing'])
    expect(scored[0].matchedTerms).toContain('french')
  })

  it('boosts chunks containing the exact phrase over same-term scattered chunks', () => {
    const phrase = chunkBlocks(extractBlocks(
      '<h1>A</h1><p>french toast for breakfast and a coffee press on the shelf</p>' +
      '<h1>B</h1><p>she said the french press makes the best cup</p>'
    ))
    const scored = rankChunks('french press', phrase)
    expect(scored).toHaveLength(2)
    expect(scored[0].chunk.text).toContain('the french press makes the best cup')
    expect(scored[1].chunk.text).toContain('french toast')
  })

  it('applies the per-section diversity cap so identical sections cannot consume the budget', () => {
    // Three chunks under one identical heading that all match the query.
    const dup = chunkBlocks(extractBlocks(
      '<h1>Alpha</h1><p>quantum widget details one</p>' +
      '<h1>Alpha</h1><p>quantum widget details two</p>' +
      '<h1>Alpha</h1><p>quantum widget details three</p>'
    ))
    const scored = rankChunks('quantum widget', dup, { k: 3, perSectionCap: 1 })
    expect(scored).toHaveLength(1)
  })

  it('returns nothing for stopword-only queries', () => {
    expect(rankChunks('the and of it', chunks)).toEqual([])
  })
})

describe('tokenize / contentHash', () => {
  it('drops stopwords and short tokens, keeps Unicode words, splits hyphens', () => {
    expect(tokenize('The café über-flow of data')).toEqual(['café', 'über', 'flow', 'data'])
  })
  it('hashes deterministically and differs for different content', () => {
    expect(contentHash('abc')).toBe(contentHash('abc'))
    expect(contentHash('abc')).not.toBe(contentHash('abd'))
  })
})

describe('DocumentIndex + formatRetrieval (§7.1 change detection, §7.3 disclosure)', () => {
  it('skips re-chunking unchanged content and re-indexes on change', () => {
    const idx = new DocumentIndex()
    const html = '<h1>T</h1><p>same content</p>'
    const first = idx.update('doc-1', html)
    const second = idx.update('doc-1', html)
    expect(second).toBe(first) // same IndexedDocument object — no re-chunk

    const changed = idx.update('doc-1', '<h1>T</h1><p>new content</p>')
    expect(changed).not.toBe(first)
    expect(changed.hash).not.toBe(first.hash)
  })

  it('search ranks chunks from the indexed revision', () => {
    const idx = new DocumentIndex()
    idx.update('doc-1', '<h1>Brewing</h1><p>French press steeping time</p><h1>Other</h1><p>unrelated prose here</p>')
    const scored = idx.search('doc-1', 'french press steeping')
    expect(scored[0].chunk.headingPath).toEqual(['Brewing'])
    expect(idx.search('doc-2', 'french')).toEqual([])
  })

  it('discloses partial retrieval with coverage counts and section locators', () => {
    const idx = new DocumentIndex()
    const doc = idx.update('doc-1', '<h1>Brewing</h1><p>french press details</p><h1>Other</h1><p>unrelated</p>')
    const scored = idx.search('doc-1', 'french press')
    const text = formatRetrieval(scored, doc.chunks.length)
    expect(text).toContain(RETRIEVAL_DISCLOSURE)
    expect(text).toContain('(1 of 2 sections shown)')
    expect(text).toContain('Section: Brewing')
  })
})
