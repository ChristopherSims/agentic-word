/**
 * Keyboard shortcuts management for v0.4.3
 * Core shortcut utilities for remapping, conflict detection, and storage
 */

export interface ShortcutBinding {
  id: string
  command: string
  label: string
  category: 'file' | 'edit' | 'view' | 'tools' | 'vcs' | 'help' | 'custom' | 'spell-check' | 'ai'
  keybinding: string // e.g., "ctrl+s", "cmd+z", "alt+shift+p"
  description?: string
  customized?: boolean
}

export interface ShortcutPreset {
  id: string
  name: string
  description: string
  bindings: ShortcutBinding[]
}

export interface ShortcutConflict {
  keybinding: string
  commands: Array<{ id: string; label: string }>
}

/**
 * Parse keybinding string to KeyboardEvent properties
 */
export function parseKeybinding(keybinding: string): {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
} {
  const parts = keybinding.toLowerCase().split('+')
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('cmd') || parts.includes('meta')
  }
}

/**
 * Check if a KeyboardEvent matches a keybinding
 */
export function matchesKeybinding(event: KeyboardEvent, keybinding: string): boolean {
  const { key, ctrl, shift, alt, meta } = parseKeybinding(keybinding)

  // Normalize key names
  let eventKey = event.key.toLowerCase()
  if (event.key === ' ') eventKey = 'space'
  if (event.code === 'Space') eventKey = 'space'

  const matches =
    eventKey === key &&
    event.ctrlKey === ctrl &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    (event.metaKey === meta || event.ctrlKey === meta) // Handle Ctrl vs Meta

  return matches
}

/**
 * Format keybinding for display
 */
export function formatKeybinding(keybinding: string): string {
  const platform = typeof navigator !== 'undefined' ? navigator.platform : ''
  const isMac = platform.toLowerCase().includes('mac')

  let formatted = keybinding
  if (isMac) {
    formatted = formatted.replace(/ctrl/gi, '⌘')
    formatted = formatted.replace(/cmd/gi, '⌘')
    formatted = formatted.replace(/alt/gi, '⌥')
    formatted = formatted.replace(/shift/gi, '⇧')
  } else {
    formatted = formatted.replace(/cmd/gi, 'Ctrl')
    formatted = formatted.replace(/meta/gi, 'Ctrl')
  }

  formatted = formatted.replace(/\+/g, ' ')
  return formatted.toUpperCase()
}

/**
 * Detect keybinding conflicts
 */
export function detectConflicts(bindings: ShortcutBinding[]): ShortcutConflict[] {
  const conflicts: ShortcutConflict[] = []
  const keybindingMap = new Map<string, ShortcutBinding[]>()

  // Group by keybinding
  for (const binding of bindings) {
    const key = binding.keybinding.toLowerCase()
    if (!keybindingMap.has(key)) {
      keybindingMap.set(key, [])
    }
    keybindingMap.get(key)!.push(binding)
  }

  // Find conflicts (more than 1 binding per keybinding)
  for (const [keybinding, bindingsList] of keybindingMap.entries()) {
    if (bindingsList.length > 1) {
      conflicts.push({
        keybinding,
        commands: bindingsList.map((b) => ({ id: b.id, label: b.label }))
      })
    }
  }

  return conflicts
}

/**
 * Validate a keybinding string format
 */
export function validateKeybinding(keybinding: string): { valid: boolean; error?: string } {
  if (!keybinding || typeof keybinding !== 'string') {
    return { valid: false, error: 'Keybinding must be a non-empty string' }
  }

  const parts = keybinding.toLowerCase().split('+')

  // Must have at least 2 parts (modifier + key)
  if (parts.length < 2) {
    return { valid: false, error: 'Keybinding must include at least one modifier (ctrl/alt/shift) and a key' }
  }

  const validModifiers = ['ctrl', 'shift', 'alt', 'cmd', 'meta']
  const modifiers = parts.slice(0, -1)
  const key = parts[parts.length - 1]

  // Validate modifiers
  for (const modifier of modifiers) {
    if (!validModifiers.includes(modifier) && modifier.length > 1) {
      return { valid: false, error: `Invalid modifier: ${modifier}` }
    }
  }

  // Validate key
  if (key.length < 1) {
    return { valid: false, error: 'Missing key' }
  }

  // Key must be single character or special key name
  const specialKeys = [
    'enter',
    'escape',
    'backspace',
    'tab',
    'space',
    'delete',
    'home',
    'end',
    'pageup',
    'pagedown',
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright'
  ]
  if (key.length > 1 && !specialKeys.includes(key)) {
    return { valid: false, error: 'Invalid key' }
  }

  return { valid: true }
}

/**
 * Search shortcuts by command name or label
 */
export function searchShortcuts(bindings: ShortcutBinding[], query: string): ShortcutBinding[] {
  if (!query) return bindings

  const lowerQuery = query.toLowerCase()
  return bindings.filter(
    (binding) =>
      binding.command.toLowerCase().includes(lowerQuery) ||
      binding.label.toLowerCase().includes(lowerQuery) ||
      (binding.description?.toLowerCase().includes(lowerQuery) ?? false)
  )
}

/**
 * Get shortcuts by category
 */
export function getShortcutsByCategory(bindings: ShortcutBinding[], category: string): ShortcutBinding[] {
  return bindings.filter((b) => b.category === category)
}

/**
 * Export shortcuts to JSON
 */
export function exportShortcuts(bindings: ShortcutBinding[]): string {
  return JSON.stringify(bindings, null, 2)
}

/**
 * Import shortcuts from JSON
 */
export function importShortcuts(jsonString: string): { success: boolean; bindings?: ShortcutBinding[]; error?: string } {
  try {
    const parsed = JSON.parse(jsonString)
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Invalid format: must be an array' }
    }

    // Validate each binding
    for (const binding of parsed) {
      if (!binding.id || !binding.command || !binding.keybinding) {
        return { success: false, error: 'Missing required fields in binding' }
      }
      const validation = validateKeybinding(binding.keybinding)
      if (!validation.valid) {
        return { success: false, error: `Invalid keybinding: ${validation.error}` }
      }
    }

    return { success: true, bindings: parsed }
  } catch (error) {
    return { success: false, error: `JSON parse error: ${(error as Error).message}` }
  }
}

/**
 * Get default shortcuts for a category
 */
export function getDefaultShortcuts(category?: string): ShortcutBinding[] {
  const defaults: ShortcutBinding[] = [
    // File operations
    {
      id: 'file-new',
      command: 'file.new',
      label: 'New Document',
      category: 'file',
      keybinding: 'ctrl+n',
      description: 'Create a new document'
    },
    {
      id: 'file-open',
      command: 'file.open',
      label: 'Open File',
      category: 'file',
      keybinding: 'ctrl+o',
      description: 'Open an existing file'
    },
    {
      id: 'file-save',
      command: 'file.save',
      label: 'Save',
      category: 'file',
      keybinding: 'ctrl+s',
      description: 'Save current document'
    },
    {
      id: 'file-save-as',
      command: 'file.saveAs',
      label: 'Save As',
      category: 'file',
      keybinding: 'ctrl+shift+s',
      description: 'Save with a new filename'
    },

    // Edit operations
    {
      id: 'edit-undo',
      command: 'edit.undo',
      label: 'Undo',
      category: 'edit',
      keybinding: 'ctrl+z',
      description: 'Undo last action'
    },
    {
      id: 'edit-redo',
      command: 'edit.redo',
      label: 'Redo',
      category: 'edit',
      keybinding: 'ctrl+shift+z',
      description: 'Redo last undone action'
    },
    {
      id: 'edit-cut',
      command: 'edit.cut',
      label: 'Cut',
      category: 'edit',
      keybinding: 'ctrl+x',
      description: 'Cut selection'
    },
    {
      id: 'edit-copy',
      command: 'edit.copy',
      label: 'Copy',
      category: 'edit',
      keybinding: 'ctrl+c',
      description: 'Copy selection'
    },
    {
      id: 'edit-paste',
      command: 'edit.paste',
      label: 'Paste',
      category: 'edit',
      keybinding: 'ctrl+v',
      description: 'Paste from clipboard'
    },

    // View operations
    {
      id: 'view-toggle-sidebar',
      command: 'view.toggleSidebar',
      label: 'Toggle Sidebar',
      category: 'view',
      keybinding: 'ctrl+b',
      description: 'Show/hide sidebar'
    },
    {
      id: 'view-zoom-in',
      command: 'view.zoomIn',
      label: 'Zoom In',
      category: 'view',
      keybinding: 'ctrl+equal',
      description: 'Increase text size'
    },
    {
      id: 'view-zoom-out',
      command: 'view.zoomOut',
      label: 'Zoom Out',
      category: 'view',
      keybinding: 'ctrl+minus',
      description: 'Decrease text size'
    },

    // Tools
    {
      id: 'tools-find-replace',
      command: 'tools.findReplace',
      label: 'Find & Replace',
      category: 'tools',
      keybinding: 'ctrl+h',
      description: 'Open find and replace dialog'
    },
    {
      id: 'tools-command-palette',
      command: 'tools.commandPalette',
      label: 'Command Palette',
      category: 'tools',
      keybinding: 'ctrl+shift+p',
      description: 'Open command palette'
    },
    {
      id: 'tools-go-to-line',
      command: 'tools.goToLine',
      label: 'Go to Line',
      category: 'tools',
      keybinding: 'ctrl+g',
      description: 'Jump to specific line'
    },

    // Spell Check & Grammar (v0.4.2)
    {
      id: 'spell-check-toggle',
      command: 'spellCheck.toggle',
      label: 'Toggle Spell Check',
      category: 'spell-check',
      keybinding: 'ctrl+shift+c',
      description: 'Show/hide spell check panel'
    },
    {
      id: 'grammar-check-toggle',
      command: 'grammar.toggle',
      label: 'Toggle Grammar Check',
      category: 'spell-check',
      keybinding: 'ctrl+shift+g',
      description: 'Show/hide grammar panel'
    },
    {
      id: 'writing-suggestions-toggle',
      command: 'writing.toggle',
      label: 'Toggle Writing Suggestions',
      category: 'spell-check',
      keybinding: 'ctrl+shift+w',
      description: 'Show/hide writing suggestions'
    },

    // AI Inline Suggestions (v0.5.7)
    {
      id: "ai-accept-suggestion",
      command: "ai.acceptInlineSuggestion",
      label: "Accept AI Suggestion",
      category: "ai",
      keybinding: "tab",
      description: "Accept the grey ghost text suggestion at cursor"
    },
    {
      id: "ai-dismiss-suggestion",
      command: "ai.dismissInlineSuggestion",
      label: "Dismiss AI Suggestion",
      category: "ai",
      keybinding: "escape",
      description: "Dismiss the grey ghost text suggestion at cursor"
    }
  ]

  if (category) {
    return defaults.filter((d) => d.category === category)
  }

  return defaults
}

/**
 * Normalize keybinding (handle platform differences)
 */
export function normalizeKeybinding(keybinding: string): string {
  // Convert platform-specific modifiers
  let normalized = keybinding.toLowerCase()

  // On Mac, convert ctrl to cmd
  const platform = typeof navigator !== 'undefined' ? navigator.platform : ''
  const isMac = platform.toLowerCase().includes('mac')

  if (isMac && !keybinding.includes('cmd') && !keybinding.includes('meta')) {
    // Don't auto-convert, let user specify
  }

  return normalized
}

/**
 * Get keyboard layout shortcut suggestions
 */
export function getKeyboardLayoutSuggestions(baseKey: string): string[] {
  const suggestions: Record<string, string[]> = {
    a: ['ctrl+a', 'shift+a', 'alt+a'],
    s: ['ctrl+s', 'shift+s', 'alt+s'],
    z: ['ctrl+z', 'ctrl+shift+z', 'alt+z'],
    h: ['ctrl+h', 'shift+h', 'alt+h']
  }

  return suggestions[baseKey.toLowerCase()] || []
}
