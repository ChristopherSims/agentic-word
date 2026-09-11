/**
 * Shortcut help built from one place (ui-updates.md §8).
 *
 * Combines the editable `keyboardShortcuts` bindings (the source for
 * customization) with shortcut-bearing commands from the shared registry, so the
 * settings list and the cheat sheet show the same set and new commands appear
 * automatically.
 */

import type { ShortcutBinding } from '../utils/keyboard-shortcuts'
import { getAppCommands, type CommandCategory } from './registry'

const CATEGORY_MAP: Record<CommandCategory, ShortcutBinding['category']> = {
  File: 'file',
  Edit: 'edit',
  View: 'view',
  'Version Control': 'vcs',
  Agent: 'ai',
  Help: 'help'
}

export interface ShortcutHelpRow {
  id: string
  label: string
  keybinding: string
  category: string
  /** Where the row came from: an editable binding or a registry command. */
  source: 'binding' | 'command'
}

function normalizeKeybinding(keybinding: string): string {
  return keybinding.toLowerCase().replace(/\s+/g, '').replace(/cmd/g, 'ctrl')
}

export function commandShortcutBindings(): ShortcutBinding[] {
  return getAppCommands()
    .filter((command): command is typeof command & { shortcut: string } => Boolean(command.shortcut))
    .map((command) => ({
      id: `command:${command.id}`,
      command: command.id,
      label: command.label.replace(/…$/, ''),
      category: CATEGORY_MAP[command.category],
      keybinding: command.shortcut.toLowerCase(),
      description: command.keywords?.join(', ')
    }))
}

export function buildShortcutHelp(bindings: ShortcutBinding[]): ShortcutHelpRow[] {
  const rows: ShortcutHelpRow[] = bindings.map((binding) => ({
    id: binding.id,
    label: binding.label,
    keybinding: binding.keybinding,
    category: binding.category,
    source: 'binding'
  }))

  const seenKeys = new Set(rows.map((row) => normalizeKeybinding(row.keybinding)))
  const seenLabels = new Set(rows.map((row) => row.label.toLowerCase()))

  for (const binding of commandShortcutBindings()) {
    const key = normalizeKeybinding(binding.keybinding)
    const label = binding.label.toLowerCase()
    if (seenKeys.has(key) || seenLabels.has(label)) continue
    seenKeys.add(key)
    seenLabels.add(label)
    rows.push({
      id: binding.id,
      label: binding.label,
      keybinding: binding.keybinding,
      category: binding.category,
      source: 'command'
    })
  }

  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label))
}
