/**
 * Shortcut help merges editable bindings with registry command shortcuts
 * (ui-updates.md §8) so settings and the cheat sheet show one set.
 */

import { describe, expect, it } from 'vitest'
import { buildShortcutHelp, commandShortcutBindings } from '../../src/renderer/commands/shortcuts'
import type { ShortcutBinding } from '../../src/renderer/utils/keyboard-shortcuts'

const bindings: ShortcutBinding[] = [
  { id: 'file-save', command: 'file.save', label: 'Save', category: 'file', keybinding: 'ctrl+s' },
  { id: 'file-new', command: 'file.new', label: 'New Document', category: 'file', keybinding: 'ctrl+n' }
]

describe('commandShortcutBindings', () => {
  it('only returns commands that declare a shortcut', () => {
    const list = commandShortcutBindings()
    expect(list.length).toBeGreaterThan(0)
    for (const item of list) {
      expect(item.id.startsWith('command:')).toBe(true)
      expect(item.keybinding.length).toBeGreaterThan(0)
    }
  })
})

describe('buildShortcutHelp', () => {
  const rows = buildShortcutHelp(bindings)

  it('keeps the editable bindings', () => {
    expect(rows.some((r) => r.id === 'file-save' && r.source === 'binding')).toBe(true)
  })

  it('adds registry shortcuts that are not already covered', () => {
    expect(rows.some((r) => r.label === 'Exit Focus Mode' && r.source === 'command')).toBe(true)
  })

  it('does not duplicate keybindings or labels', () => {
    const keys = rows.map((r) => r.keybinding.toLowerCase().replace(/\s+/g, '').replace(/cmd/g, 'ctrl'))
    const labels = rows.map((r) => r.label.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
