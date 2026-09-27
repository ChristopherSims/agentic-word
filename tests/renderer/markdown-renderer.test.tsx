// @vitest-environment jsdom
/**
 * Renderer test for the shared markdown renderer now used by assistant chat
 * messages (ui-updates.md §5 conversation).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MarkdownRenderer } from '../../src/renderer/components/MarkdownRenderer'
import { sanitizeStreamingMarkdown } from '../../src/renderer/utils/agent-content'

vi.mock('../../src/renderer/utils/agent-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/utils/agent-content')>()
  return { ...actual, sanitizeStreamingMarkdown: vi.fn(actual.sanitizeStreamingMarkdown) }
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('MarkdownRenderer', () => {
  it('renders headings, bold, inline code, and lists', () => {
    act(() => {
      root.render(
        <MarkdownRenderer content={'# Title\n\nSome **bold** and `code`.\n\n- one\n- two'} />
      )
    })
    const text = container.textContent || ''
    expect(text).toContain('Title')
    expect(text).toContain('bold')
    expect(text).toContain('code')
    expect(text).toContain('one')
    expect(text).toContain('two')
    expect(container.querySelector('h4')).not.toBeNull()
    expect(container.querySelector('strong')).not.toBeNull()
  })

  it('renders a placeholder for empty content', () => {
    act(() => {
      root.render(<MarkdownRenderer content="" />)
    })
    expect(container.textContent).toContain('No content to display')
  })

  it('never renders raw HTML tags as literal text (streamed model output)', () => {
    act(() => {
      root.render(
        <MarkdownRenderer content={'<p>Hello <strong>world</strong></p><div>Second line</div>'} />
      )
    })
    const text = container.textContent || ''
    expect(text).toContain('Hello')
    expect(text).toContain('world')
    expect(text).toContain('Second line')
    expect(text).not.toContain('<p>')
    expect(text).not.toContain('<strong>')
    expect(text).not.toContain('<div>')
  })

  it('skips re-parsing when props are identical (memoized streaming bubbles)', () => {
    const content = '# Title\n\nSome **bold** and `code`.'
    const parse = vi.mocked(sanitizeStreamingMarkdown)
    parse.mockClear()

    // The parent re-renders on every store change; the memoized
    // MarkdownRenderer must bail out when `content` did not change.
    const Probe = () => <MarkdownRenderer content={content} />
    act(() => { root.render(<Probe />) })
    act(() => { root.render(<Probe />) })
    act(() => { root.render(<Probe />) })
    expect(parse).toHaveBeenCalledTimes(1) // parsed once, bailed out twice
    expect(container.querySelector('strong')).not.toBeNull()
  })

  it('does not double-apply emphasis inside bold text', () => {
    act(() => {
      root.render(<MarkdownRenderer content={'**bold text**'} />)
    })
    const strong = container.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong?.querySelector('em')).toBeNull() // no nested italic from ** overlap
  })
})
