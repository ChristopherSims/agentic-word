// @vitest-environment jsdom
/**
 * Diff review rendering: insertion/deletion must be conveyed with marks and
 * labels, not color alone (ui-updates.md §5, §7).
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { DiffOverlay } from '../../src/renderer/components/DiffOverlay'
import { useAppStore } from '../../src/renderer/store/app-store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  useAppStore.setState({
    pendingChanges: [
      {
        id: 'change-1',
        toolName: 'edit',
        args: {},
        contentBefore: '<p>alpha beta gamma</p>',
        contentAfter: '<p>alpha delta gamma</p>',
        description: 'Replaced "beta" with "delta"',
        timestamp: Date.now(),
        status: 'pending'
      }
    ],
    activePendingChangeId: 'change-1'
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useAppStore.setState({ pendingChanges: [], activePendingChangeId: null })
})

describe('DiffOverlay', () => {
  it('marks insertions and deletions without relying on color alone', () => {
    act(() => { root.render(<DiffOverlay />) })

    const removed = container.querySelector('del.diff-removed')
    const added = container.querySelector('ins.diff-added')

    expect(removed).not.toBeNull()
    expect(added).not.toBeNull()
    expect(removed?.getAttribute('aria-label')).toBe('Removed')
    expect(added?.getAttribute('aria-label')).toBe('Added')
    expect(container.textContent).toContain('−')
    expect(container.textContent).toContain('+')
    expect(container.textContent).toContain('Removed')
    expect(container.textContent).toContain('Added')
  })
})
