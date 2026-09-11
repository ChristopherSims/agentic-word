// @vitest-environment jsdom
/**
 * Renderer test for the shared markdown renderer now used by assistant chat
 * messages (ui-updates.md §5 conversation).
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MarkdownRenderer } from '../../src/renderer/components/MarkdownRenderer'

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
})
