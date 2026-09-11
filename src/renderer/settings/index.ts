/**
 * Settings navigation and search index (ui-updates.md §6).
 *
 * `SettingsView` keeps the existing `settingsPanelView` values so deep links
 * from menus and the command palette continue to resolve. `SETTINGS_INDEX` is a
 * small static index; entries with an `anchor` scroll to and focus the matching
 * control (marked `data-setting="…"` in the pane).
 */

export type SettingsView =
  | 'appearance'
  | 'agent'
  | 'editor'
  | 'behavior'
  | 'advanced'
  | 'vcs'
  | 'collab'
  | 'privacy'
  | 'plugins'
  | 'keybindings'

export interface SettingsNavItem {
  id: SettingsView
  label: string
  keywords?: string[]
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { id: 'appearance', label: 'Appearance', keywords: ['theme', 'color', 'accent', 'font', 'dark', 'light'] },
  { id: 'editor', label: 'Editor', keywords: ['autosave', 'spell', 'margins', 'autocorrect', 'suggestions'] },
  { id: 'agent', label: 'AI & Agents', keywords: ['provider', 'model', 'api key', 'agents'] },
  { id: 'behavior', label: 'Behavior', keywords: ['autocorrect', 'cache', 'defaults'] },
  { id: 'vcs', label: 'History & Version Control', keywords: ['git', 'commit', 'branch', 'auto-commit'] },
  { id: 'collab', label: 'Collaboration', keywords: ['share', 'server', 'presence'] },
  { id: 'privacy', label: 'Privacy & Security', keywords: ['memory', 'consent', 'audit', 'protection'] },
  { id: 'plugins', label: 'Plugins', keywords: ['extensions', 'marketplace'] },
  { id: 'keybindings', label: 'Keyboard Shortcuts', keywords: ['keys', 'hotkeys', 'accelerators'] },
  { id: 'advanced', label: 'Advanced', keywords: ['performance', 'updates', 'experimental'] }
]

export interface SettingIndexEntry {
  id: string
  label: string
  view: SettingsView
  /** `data-setting` value to scroll to and focus, when the pane marks one. */
  anchor?: string
  keywords?: string[]
}

export const SETTINGS_INDEX: SettingIndexEntry[] = [
  { id: 'theme', label: 'Theme', view: 'appearance', anchor: 'theme', keywords: ['dark', 'light', 'palette'] },
  { id: 'mode', label: 'Light / Dark / System', view: 'appearance', keywords: ['color scheme', 'appearance'] },
  { id: 'accent', label: 'Accent color', view: 'appearance', anchor: 'accent', keywords: ['color'] },
  { id: 'ui-font-size', label: 'UI font size', view: 'appearance', anchor: 'ui-font-size', keywords: ['scale', 'zoom'] },
  { id: 'editor-font', label: 'Editor font', view: 'appearance', anchor: 'editor-font', keywords: ['typeface'] },

  { id: 'autosave', label: 'Auto-save interval', view: 'editor', anchor: 'autosave', keywords: ['save'] },
  { id: 'spellcheck', label: 'Spell check language', view: 'editor', anchor: 'spellcheck', keywords: ['dictionary'] },
  { id: 'default-font-family', label: 'Default font family', view: 'editor', anchor: 'default-font-family' },
  { id: 'default-font-size', label: 'Default font size', view: 'editor', anchor: 'default-font-size' },
  { id: 'line-spacing', label: 'Line spacing', view: 'editor', anchor: 'line-spacing' },
  { id: 'margins', label: 'Document margins', view: 'editor', anchor: 'margins' },
  { id: 'word-count', label: 'Show word/char count', view: 'editor', anchor: 'word-count' },
  { id: 'autocorrect', label: 'Autocorrect', view: 'editor', anchor: 'autocorrect', keywords: ['smart quotes', 'em dash'] },
  { id: 'inline-suggestions', label: 'AI inline suggestions', view: 'editor', anchor: 'inline-suggestions' },
  { id: 'header-footer', label: 'Header & footer', view: 'editor', anchor: 'header-footer' },

  { id: 'provider', label: 'AI provider', view: 'agent', keywords: ['endpoint', 'ollama', 'openai'] },
  { id: 'api-key', label: 'API key', view: 'agent', keywords: ['credentials', 'token'] },
  { id: 'model', label: 'Model', view: 'agent', keywords: ['llm'] },

  { id: 'autocorrect-level', label: 'Autocorrect level', view: 'behavior', keywords: ['typos'] },
  { id: 'cache', label: 'Cache size', view: 'behavior' },
  { id: 'auto-commit', label: 'Auto-commit on save', view: 'vcs', keywords: ['git', 'version'] },
  { id: 'collab-server', label: 'Collaboration server', view: 'collab', keywords: ['room', 'port'] },
  { id: 'memory', label: 'Agent memory & consent', view: 'privacy', keywords: ['retention', 'audit'] },
  { id: 'plugins', label: 'Installed plugins', view: 'plugins', keywords: ['extensions'] },
  { id: 'shortcuts', label: 'Keyboard shortcuts', view: 'keybindings', keywords: ['keys', 'hotkeys'] },
  { id: 'performance', label: 'Performance mode', view: 'advanced', keywords: ['memory', 'power'] },
  { id: 'updates', label: 'Update frequency', view: 'advanced', keywords: ['release', 'auto-update'] }
]

export function searchSettings(query: string): SettingIndexEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return SETTINGS_INDEX.filter((entry) =>
    [entry.label, entry.view, ...(entry.keywords ?? [])].join(' ').toLowerCase().includes(q)
  )
}

export function navLabel(view: SettingsView): string {
  return SETTINGS_NAV.find((item) => item.id === view)?.label ?? view
}
