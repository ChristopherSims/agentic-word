/**
 * Keyboard shortcut presets for v0.4.3
 * Pre-configured schemes: VS Code, Vim, Emacs
 */

import type { ShortcutPreset } from './keyboard-shortcuts'

export const VS_CODE_PRESET: ShortcutPreset = {
  id: 'vscode',
  name: 'VS Code',
  description: 'VS Code keyboard shortcuts',
  bindings: [
    // File
    { id: 'file-new', command: 'file.new', label: 'New Document', category: 'file', keybinding: 'ctrl+n' },
    { id: 'file-open', command: 'file.open', label: 'Open File', category: 'file', keybinding: 'ctrl+o' },
    { id: 'file-save', command: 'file.save', label: 'Save', category: 'file', keybinding: 'ctrl+s' },
    { id: 'file-save-as', command: 'file.saveAs', label: 'Save As', category: 'file', keybinding: 'ctrl+shift+s' },
    // Edit
    { id: 'edit-undo', command: 'edit.undo', label: 'Undo', category: 'edit', keybinding: 'ctrl+z' },
    { id: 'edit-redo', command: 'edit.redo', label: 'Redo', category: 'edit', keybinding: 'ctrl+y' },
    { id: 'edit-cut', command: 'edit.cut', label: 'Cut', category: 'edit', keybinding: 'ctrl+x' },
    { id: 'edit-copy', command: 'edit.copy', label: 'Copy', category: 'edit', keybinding: 'ctrl+c' },
    { id: 'edit-paste', command: 'edit.paste', label: 'Paste', category: 'edit', keybinding: 'ctrl+v' },
    // View
    { id: 'view-toggle-sidebar', command: 'view.toggleSidebar', label: 'Toggle Sidebar', category: 'view', keybinding: 'ctrl+b' },
    { id: 'view-zoom-in', command: 'view.zoomIn', label: 'Zoom In', category: 'view', keybinding: 'ctrl+equal' },
    { id: 'view-zoom-out', command: 'view.zoomOut', label: 'Zoom Out', category: 'view', keybinding: 'ctrl+minus' },
    // Tools
    { id: 'tools-find-replace', command: 'tools.findReplace', label: 'Find & Replace', category: 'tools', keybinding: 'ctrl+h' },
    { id: 'tools-command-palette', command: 'tools.commandPalette', label: 'Command Palette', category: 'tools', keybinding: 'ctrl+shift+p' },
    { id: 'tools-go-to-line', command: 'tools.goToLine', label: 'Go to Line', category: 'tools', keybinding: 'ctrl+g' },
    // Spell Check & Grammar
    { id: 'spell-check-toggle', command: 'spellCheck.toggle', label: 'Toggle Spell Check', category: 'spell-check', keybinding: 'ctrl+shift+c' },
    { id: 'grammar-check-toggle', command: 'grammar.toggle', label: 'Toggle Grammar Check', category: 'spell-check', keybinding: 'ctrl+shift+g' },
    { id: 'writing-suggestions-toggle', command: 'writing.toggle', label: 'Toggle Writing Suggestions', category: 'spell-check', keybinding: 'ctrl+shift+w' }
  ]
}

export const VIM_PRESET: ShortcutPreset = {
  id: 'vim',
  name: 'Vim',
  description: 'Vim-inspired keyboard shortcuts',
  bindings: [
    // File (using colon prefix would require mode switching, simplified for this implementation)
    { id: 'file-new', command: 'file.new', label: 'New Document', category: 'file', keybinding: 'ctrl+n' },
    { id: 'file-open', command: 'file.open', label: 'Open File', category: 'file', keybinding: 'ctrl+o' },
    { id: 'file-save', command: 'file.save', label: 'Save', category: 'file', keybinding: 'ctrl+s' },
    { id: 'file-save-as', command: 'file.saveAs', label: 'Save As', category: 'file', keybinding: 'ctrl+shift+s' },
    // Edit (Vim style)
    { id: 'edit-undo', command: 'edit.undo', label: 'Undo', category: 'edit', keybinding: 'ctrl+u' },
    { id: 'edit-redo', command: 'edit.redo', label: 'Redo', category: 'edit', keybinding: 'ctrl+r' },
    { id: 'edit-cut', command: 'edit.cut', label: 'Cut', category: 'edit', keybinding: 'ctrl+x' },
    { id: 'edit-copy', command: 'edit.copy', label: 'Copy', category: 'edit', keybinding: 'ctrl+c' },
    { id: 'edit-paste', command: 'edit.paste', label: 'Paste', category: 'edit', keybinding: 'ctrl+v' },
    // View
    { id: 'view-toggle-sidebar', command: 'view.toggleSidebar', label: 'Toggle Sidebar', category: 'view', keybinding: 'alt+b' },
    { id: 'view-zoom-in', command: 'view.zoomIn', label: 'Zoom In', category: 'view', keybinding: 'ctrl+equal' },
    { id: 'view-zoom-out', command: 'view.zoomOut', label: 'Zoom Out', category: 'view', keybinding: 'ctrl+minus' },
    // Tools
    { id: 'tools-find-replace', command: 'tools.findReplace', label: 'Find & Replace', category: 'tools', keybinding: 'alt+h' },
    { id: 'tools-command-palette', command: 'tools.commandPalette', label: 'Command Palette', category: 'tools', keybinding: 'shift+colon' },
    { id: 'tools-go-to-line', command: 'tools.goToLine', label: 'Go to Line', category: 'tools', keybinding: 'shift+g' },
    // Spell Check & Grammar
    { id: 'spell-check-toggle', command: 'spellCheck.toggle', label: 'Toggle Spell Check', category: 'spell-check', keybinding: 'alt+s' },
    { id: 'grammar-check-toggle', command: 'grammar.toggle', label: 'Toggle Grammar Check', category: 'spell-check', keybinding: 'alt+g' },
    { id: 'writing-suggestions-toggle', command: 'writing.toggle', label: 'Toggle Writing Suggestions', category: 'spell-check', keybinding: 'alt+w' }
  ]
}

export const EMACS_PRESET: ShortcutPreset = {
  id: 'emacs',
  name: 'Emacs',
  description: 'Emacs-inspired keyboard shortcuts',
  bindings: [
    // File (Emacs style - using Ctrl+X prefix)
    { id: 'file-new', command: 'file.new', label: 'New Document', category: 'file', keybinding: 'ctrl+n' },
    { id: 'file-open', command: 'file.open', label: 'Open File', category: 'file', keybinding: 'ctrl+x' },
    { id: 'file-save', command: 'file.save', label: 'Save', category: 'file', keybinding: 'ctrl+s' },
    { id: 'file-save-as', command: 'file.saveAs', label: 'Save As', category: 'file', keybinding: 'ctrl+x+s' },
    // Edit (Emacs style)
    { id: 'edit-undo', command: 'edit.undo', label: 'Undo', category: 'edit', keybinding: 'ctrl+underscore' },
    { id: 'edit-redo', command: 'edit.redo', label: 'Redo', category: 'edit', keybinding: 'shift+alt+underscore' },
    { id: 'edit-cut', command: 'edit.cut', label: 'Cut', category: 'edit', keybinding: 'ctrl+w' },
    { id: 'edit-copy', command: 'edit.copy', label: 'Copy', category: 'edit', keybinding: 'alt+w' },
    { id: 'edit-paste', command: 'edit.paste', label: 'Paste', category: 'edit', keybinding: 'ctrl+y' },
    // View
    { id: 'view-toggle-sidebar', command: 'view.toggleSidebar', label: 'Toggle Sidebar', category: 'view', keybinding: 'ctrl+x+0' },
    { id: 'view-zoom-in', command: 'view.zoomIn', label: 'Zoom In', category: 'view', keybinding: 'ctrl+plus' },
    { id: 'view-zoom-out', command: 'view.zoomOut', label: 'Zoom Out', category: 'view', keybinding: 'ctrl+minus' },
    // Tools
    { id: 'tools-find-replace', command: 'tools.findReplace', label: 'Find & Replace', category: 'tools', keybinding: 'alt+percent' },
    { id: 'tools-command-palette', command: 'tools.commandPalette', label: 'Command Palette', category: 'tools', keybinding: 'alt+x' },
    { id: 'tools-go-to-line', command: 'tools.goToLine', label: 'Go to Line', category: 'tools', keybinding: 'alt+g' },
    // Spell Check & Grammar
    { id: 'spell-check-toggle', command: 'spellCheck.toggle', label: 'Toggle Spell Check', category: 'spell-check', keybinding: 'alt+o' },
    { id: 'grammar-check-toggle', command: 'grammar.toggle', label: 'Toggle Grammar Check', category: 'spell-check', keybinding: 'alt+i' },
    { id: 'writing-suggestions-toggle', command: 'writing.toggle', label: 'Toggle Writing Suggestions', category: 'spell-check', keybinding: 'alt+e' }
  ]
}

export function getPresetById(id: string): ShortcutPreset | undefined {
  const presets: Record<string, ShortcutPreset> = {
    vscode: VS_CODE_PRESET,
    vim: VIM_PRESET,
    emacs: EMACS_PRESET
  }
  return presets[id]
}

export function getAllPresets(): ShortcutPreset[] {
  return [VS_CODE_PRESET, VIM_PRESET, EMACS_PRESET]
}
