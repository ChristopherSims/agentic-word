/**
 * Agent content normalization.
 *
 * The editor stores rich text as HTML while language models naturally emit
 * Markdown or plain text (and, because the prompt ships the document as HTML,
 * sometimes a confused mix of the two). These helpers give the app one format
 * contract:
 *
 *   - Chat bubbles display Markdown; stray HTML is neutralized so tags never
 *     appear as literal text while tokens stream in.
 *   - Document insertions are normalized to HTML once (Markdown -> HTML) before
 *     they reach TipTap, after being sanitized.
 *
 * The functions are intentionally synchronous (except `normalizeAgentContent`,
 * which needs the Markdown converter) so they can run on every streamed token.
 */

export type ContentFormat = 'html' | 'markdown' | 'plain'
export type MarkdownToHtml = (markdown: string) => Promise<string>

const HTML_TAG = /<\/?([a-z][a-z0-9-]*)\b[^>]*>/i
const MARKDOWN = /(^|\n)#{1,6}\s|\*\*[^*\n]+\*\*|(^|\n)\s*[-*+]\s|\d+\.\s|\[[^\]]+\]\([^)]+\)|(^|\n)```/
const BLOCK_OPEN = /<(p|div|h[1-6]|li|ul|ol|blockquote|tr|table|thead|tbody|pre|section|article|figure|figcaption)\b[^>]*>/gi
const BLOCK_CLOSE = /<\/(p|div|h[1-6]|li|ul|ol|blockquote|tr|table|thead|tbody|pre|section|article|figure|figcaption)>/gi
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
const FENCE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g

/** True when the text contains an HTML element tag. */
export function looksLikeHtml(input: string): boolean {
  return HTML_TAG.test(input)
}

/** True when the text contains recognisable Markdown structure. */
export function looksLikeMarkdown(input: string): boolean {
  return MARKDOWN.test(input)
}

/**
 * Classify the dominant format. Mixed HTML + Markdown is treated as Markdown so
 * the converter (which safely handles embedded HTML) is applied.
 */
export function detectContentFormat(input: string): ContentFormat {
  const html = looksLikeHtml(input)
  const markdown = looksLikeMarkdown(input)
  if (markdown) return 'markdown'
  if (html) return 'html'
  return 'plain'
}

/** Decode the HTML entities a model or renderer is likely to emit. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&hellip;/gi, '\u2026')
}

/** Strip every tag, keeping block boundaries as newlines and decoding entities. */
export function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(SCRIPT_OR_STYLE, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(BLOCK_CLOSE, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Drop a tag that has started but not closed yet (`<stro`, `</stro`, `<div clas`).
 * A "less than" in prose (`2 < 3`) is left alone because it is not tag-shaped.
 * Applied while a stream is still arriving so a chunk boundary that splits a tag
 * never shows a dangling `<prefix`.
 */
export function trimIncompleteTrailingTag(text: string): string {
  return text.replace(/<[a-z/!][^<>]*$/i, '')
}

/**
 * Turn streamed assistant text into Markdown-safe text for the chat renderer.
 * HTML block boundaries become newlines, inline tags are dropped, and fenced
 * code blocks are left untouched so code samples keep their tags.
 */
export function sanitizeStreamingMarkdown(input: string): string {
  if (!input) return input
  const out = input
    .split(FENCE)
    .map((part) => {
      if (/^(```|~~~)/.test(part)) return part
      return decodeHtmlEntities(
        part
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(BLOCK_CLOSE, '\n')
          .replace(BLOCK_OPEN, '\n')
          .replace(/<[^>]*>/g, '')
      )
    })
    .join('')
  return trimIncompleteTrailingTag(out).replace(/\n{3,}/g, '\n\n')
}

/**
 * Normalize model output to HTML suitable for TipTap. Markdown is converted
 * with `convert`; genuine HTML is passed through (TipTap parses a strict
 * subset); plain text becomes paragraph blocks so line structure survives.
 */
export async function normalizeAgentContent(
  content: string,
  convert: MarkdownToHtml
): Promise<string> {
  if (!content || !content.trim()) return ''

  const format = detectContentFormat(content)
  if (format === 'markdown') {
    try {
      // Strip stray HTML the model mixed in before converting the Markdown.
      const html = await convert(sanitizeStreamingMarkdown(content))
      if (html) return html
    } catch {
      /* fall through to plain-text wrapping */
    }
  } else if (format === 'html') {
    return content
  }

  return content
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
