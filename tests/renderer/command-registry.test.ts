/**
 * Renderer command registry tests (ui-updates.md §8). Pure filtering/grouping
 * plus integrity of the real app command list.
 */

import { describe, expect, it } from 'vitest'
import { filterCommands, getAppCommands, groupCommands, type AppCommand } from '../../src/renderer/commands/registry'

const sample: AppCommand[] = [
  { id: 'a', label: 'New Document', category: 'File', run: () => {} },
  { id: 'b', label: 'Find', category: 'Edit', keywords: ['search'], run: () => {} },
  { id: 'c', label: 'Commit', category: 'Version Control', run: () => {} }
]

describe('filterCommands', () => {
  it('returns all commands for an empty query', () => {
    expect(filterCommands(sample, '   ').length).toBe(3)
  })

  it('matches label and category case-insensitively', () => {
    expect(filterCommands(sample, 'find').map((c) => c.id)).toEqual(['b'])
    expect(filterCommands(sample, 'version').map((c) => c.id)).toEqual(['c'])
  })

  it('matches keywords', () => {
    expect(filterCommands(sample, 'search').map((c) => c.id)).toEqual(['b'])
  })
})

describe('groupCommands', () => {
  it('groups by category preserving first-seen order', () => {
    expect(groupCommands(sample).map((g) => g.category)).toEqual(['File', 'Edit', 'Version Control'])
  })
})

describe('getAppCommands', () => {
  it('has unique ids, non-empty labels, and runnable actions', () => {
    const commands = getAppCommands()
    const ids = commands.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const command of commands) {
      expect(command.label.length).toBeGreaterThan(0)
      expect(typeof command.run).toBe('function')
    }
  })

  it('wires the commands that were previously empty', () => {
    const commands = getAppCommands()
    for (const id of ['file.save', 'file.save-as', 'edit.insert-footnote', 'file.export']) {
      expect(commands.some((c) => c.id === id)).toBe(true)
    }
  })
})
