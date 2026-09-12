/**
 * Unit tests for the agent content normalizer — the format contract that keeps
 * Markdown/plain/HTML model output from corrupting chat and the document.
 *
 * The "fake chunk stream" cases simulate partial output arriving token by token
 * (including a tag split across two chunks) and assert the pipeline never leaks
 * raw markup or produces broken HTML at any point.
 */

import { describe, expect, it } from 'vitest'
import {
  detectContentFormat,
  looksLikeHtml,
  looksLikeMarkdown,
  sanitizeStreamingMarkdown,
  stripHtmlToText,
  decodeHtmlEntities,
  normalizeAgentContent
} from '../../src/renderer/utils/agent-content'

/** A stand-in for the main-process markdown converter (escapes raw HTML). */
async function fakeMarkdownToHtml(markdown: string): Promise<string> {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const heading = block.match(/^(#{1,6})\s+(.*)$/)
      if (heading) return `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`
      const strong = escape(block).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      return `<p>${strong.replace(/\n/g, '<br>')}</p>`
    })
    .join('')
}

describe('agent-content format detection', () => {
  it('classifies markdown, html, and plain text', () => {
    expect(detectContentFormat('# Heading\n\n**bold**')).toBe('markdown')
    expect(detectContentFormat('<p>Hello</p>')).toBe('html')
    expect(detectContentFormat('Just a sentence.')).toBe('plain')
  })

  it('treats mixed HTML + markdown as markdown so the converter runs', () => {
    expect(looksLikeHtml('<p>x</p>')).toBe(true)
    expect(looksLikeMarkdown('**bold**')).toBe(true)
    expect(detectContentFormat('**bold** <p>tag</p>')).toBe('markdown')
  })
})

describe('sanitizeStreamingMarkdown', () => {
  it('drops tags and turns block boundaries into newlines', () => {
    const out = sanitizeStreamingMarkdown('<p>First</p><p>Second</p>')
    expect(out).not.toContain('<p>')
    expect(out).toContain('First')
    expect(out).toContain('Second')
  })

  it('decodes entities so &lt; does not turn into a real tag', () => {
    expect(sanitizeStreamingMarkdown('a &lt; b &amp; c')).toBe('a < b & c')
  })

  it('preserves HTML inside fenced code blocks', () => {
    const input = 'Text\n```html\n<div class="x">keep me</div>\n```'
    const out = sanitizeStreamingMarkdown(input)
    expect(out).toContain('<div class="x">keep me</div>')
  })
})

describe('stripHtmlToText / decodeHtmlEntities', () => {
  it('produces readable text from html', () => {
    expect(stripHtmlToText('<h1>Title</h1><p>Body &amp; more</p>')).toBe('Title\nBody & more')
  })

  it('decodes common entities', () => {
    expect(decodeHtmlEntities('&mdash;&hellip;&#39;')).toBe('\u2014\u2026\'')
  })
})

describe('normalizeAgentContent', () => {
  it('converts markdown to html', async () => {
    const html = await normalizeAgentContent('# Title\n\n**bold**', fakeMarkdownToHtml)
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('wraps plain text in paragraph blocks and escapes angle brackets', async () => {
    const html = await normalizeAgentContent('one\n\ntwo < three', fakeMarkdownToHtml)
    expect(html).toBe('<p>one</p><p>two &lt; three</p>')
  })

  it('passes genuine html through untouched', async () => {
    const html = await normalizeAgentContent('<p>already html</p>', fakeMarkdownToHtml)
    expect(html).toBe('<p>already html</p>')
  })
})

describe('fake chunk stream', () => {
  // A reply that mixes prose, markdown, and an HTML tag split across chunks —
  // exactly the shape that used to corrupt streaming.
  const chunks = ['Here is ', 'a **par', 'tial** answer', ' with <stro', 'ng>tag</strong>', ' and more.']

  it('chat sanitization never leaks a raw tag for any prefix', () => {
    let buffer = ''
    for (const chunk of chunks) {
      buffer += chunk
      const safe = sanitizeStreamingMarkdown(buffer)
      expect(safe).not.toMatch(/<\/?[a-z]/i)
    }
    expect(sanitizeStreamingMarkdown(buffer)).toContain('Here is a **partial** answer with tag and more.')
  })

  it('document normalization yields valid, balanced html at every step', async () => {
    let buffer = ''
    for (const chunk of chunks) {
      buffer += chunk
      const html = await normalizeAgentContent(buffer, fakeMarkdownToHtml)
      // Every opening tag our converter emits has a matching close, even when a
      // chunk boundary lands in the middle of markdown syntax or an HTML tag.
      const opens = (html.match(/<(p|h[1-6]|strong)\b/g) || []).length
      const closes = (html.match(/<\/(p|h[1-6]|strong)>/g) || []).length
      expect(opens).toBe(closes)
    }
  })

  it('neutralizes a tag that is still mid-arrival at a chunk boundary', async () => {
    const html = await normalizeAgentContent('Answer with <stro', fakeMarkdownToHtml)
    expect(html).toContain('&lt;stro')
    // No raw, unclosed tag is ever emitted.
    expect(html).not.toMatch(/<stro(?!ng)/)
  })
})
