/**
 * Regression tests for the Markdown -> HTML converter used for document import
 * and agent insertions. The previous implementation emitted malformed markup
 * (`</p><p>` with no opening tag) and let raw HTML through, which is what made
 * streamed/generated content corrupt the editor.
 */

import { describe, expect, it } from 'vitest'
import { DocumentStore } from '../../src/main/document-store'

describe('DocumentStore.markdownToHtml', () => {
  const store = new DocumentStore()

  it('wraps every paragraph with matching tags', () => {
    expect(store.markdownToHtml('One\n\nTwo')).toBe('<p>One</p><p>Two</p>')
  })

  it('converts headings, emphasis, links and inline code', () => {
    const html = store.markdownToHtml('# Title\n\n**bold** and *it* and `c` and [x](https://e.com)')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>it</em>')
    expect(html).toContain('<code>c</code>')
    expect(html).toContain('<a href="https://e.com">x</a>')
  })

  it('converts bullet and ordered lists', () => {
    const html = store.markdownToHtml('- a\n- b\n\n1. one\n2. two')
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>')
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>')
  })

  it('escapes raw HTML so a model cannot corrupt the document', () => {
    const html = store.markdownToHtml('Hello <script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('keeps fenced code blocks literal', () => {
    const html = store.markdownToHtml('```\nconst x = 1 < 2\n```')
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1 &lt; 2')
    expect(html).toContain('</code></pre>')
  })
})
