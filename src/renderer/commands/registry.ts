/**
 * Shared renderer command registry (ui-updates.md §8).
 *
 * One definition per app-level command with id, label, category, shortcut,
 * availability, and execution. The command palette consumes this today; menus,
 * toolbar, and shortcut help should adopt it through adapters rather than
 * duplicating action wiring.
 */

import { useAppStore } from '../store/app-store'

export type CommandCategory = 'File' | 'Edit' | 'View' | 'Version Control' | 'Agent' | 'Help'

export interface AppCommand {
  id: string
  label: string
  category: CommandCategory
  shortcut?: string
  keywords?: string[]
  /** Optional prerequisites; when false the command is shown disabled. */
  isEnabled?: () => boolean
  disabledReason?: string
  run: () => void
}

export async function loadTemplate(name: string): Promise<void> {
  const result = await window.wordapp?.template.get(name)
  if (result) {
    const store = useAppStore.getState()
    store.setDocumentContent(result.content ?? '')
    store.setDocumentTitle(name.charAt(0).toUpperCase() + name.slice(1))
    store.setCurrentFilePath(null)
    store.markDirty()
  }
}

const withVcsView = (view: VcsView) => () => {
  const store = useAppStore.getState()
  store.setVcsPanelOpen(true)
  store.setVcsPanelView(view)
}

type VcsView =
  | 'log' | 'commit' | 'branches' | 'graph' | 'merge' | 'diff' | 'tags'
  | 'stash' | 'blame' | 'rebase' | 'patches' | 'hooks'
  | 'merge-strategies' | 'branch-protection' | 'merge-requests'

export function getAppCommands(): AppCommand[] {
  return [
    {
      id: 'file.new',
      label: 'New Document',
      category: 'File',
      shortcut: 'Ctrl+N',
      run: () => {
        const state = useAppStore.getState()
        state.setDocumentContent('')
        state.setDocumentTitle('Untitled')
        state.setCurrentFilePath(null)
        state.resetSaveStatus()
        state.updateDocTab(state.activeTabId, { title: 'Untitled', filePath: null, isDirty: false })
      }
    },
    {
      id: 'file.new-tab',
      label: 'New Tab',
      category: 'File',
      shortcut: 'Ctrl+T',
      run: () => useAppStore.getState().addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })
    },
    {
      id: 'file.open',
      label: 'Open File…',
      category: 'File',
      shortcut: 'Ctrl+O',
      run: () => { void window.wordapp?.file.openDialog() }
    },
    {
      id: 'file.save',
      label: 'Save',
      category: 'File',
      shortcut: 'Ctrl+S',
      run: () => { window.dispatchEvent(new Event('lexicon:save-document')) }
    },
    {
      id: 'file.save-as',
      label: 'Save As…',
      category: 'File',
      shortcut: 'Ctrl+Shift+S',
      run: () => { window.dispatchEvent(new Event('lexicon:save-as-document')) }
    },
    {
      id: 'file.print',
      label: 'Print…',
      category: 'File',
      shortcut: 'Ctrl+P',
      run: () => useAppStore.getState().setPrintPreviewOpen(true)
    },
    {
      id: 'file.export',
      label: 'Export…',
      category: 'File',
      keywords: ['pdf', 'docx', 'html', 'markdown', 'epub'],
      run: () => useAppStore.getState().setExportDialogOpen(true)
    },
    {
      id: 'file.template-gallery',
      label: 'Template Gallery…',
      category: 'File',
      run: () => useAppStore.getState().setTemplateGalleryOpen(true)
    },
    ...['blank', 'letter', 'resume', 'report', 'memo'].map((name) => ({
      id: `file.template.${name}`,
      label: `New from Template: ${name.charAt(0).toUpperCase() + name.slice(1)}`,
      category: 'File' as CommandCategory,
      run: () => { void loadTemplate(name) }
    })),
    {
      id: 'edit.find',
      label: 'Find…',
      category: 'Edit',
      shortcut: 'Ctrl+F',
      run: () => useAppStore.getState().setFindBarOpen(true)
    },
    {
      id: 'edit.replace',
      label: 'Find and Replace…',
      category: 'Edit',
      shortcut: 'Ctrl+H',
      keywords: ['replace'],
      run: () => useAppStore.getState().setFindBarOpen(true)
    },
    {
      id: 'edit.word-count',
      label: 'Word Count',
      category: 'Edit',
      run: () => {
        const state = useAppStore.getState()
        state.setDocStatsPanelOpen(!state.docStatsPanelOpen)
      }
    },
    {
      id: 'edit.insert-footnote',
      label: 'Insert Footnote',
      category: 'Edit',
      shortcut: 'Ctrl+Shift+F',
      run: () => { window.dispatchEvent(new Event('lexicon:insert-footnote')) }
    },
    {
      id: 'view.settings',
      label: 'Settings…',
      category: 'View',
      shortcut: 'Ctrl+,',
      run: () => useAppStore.getState().setSettingsPanelOpen(true)
    },
    {
      id: 'view.toggle-agent',
      label: 'Toggle Agent Workspace',
      category: 'View',
      keywords: ['chat', 'assistant', 'sidebar'],
      run: () => useAppStore.getState().toggleChatSidebar()
    },
    {
      id: 'view.toggle-vcs',
      label: 'Toggle Version Control Panel',
      category: 'View',
      run: () => useAppStore.getState().setVcsPanelOpen(!useAppStore.getState().vcsPanelOpen)
    },
    {
      id: 'view.toggle-split',
      label: 'Toggle Split View',
      category: 'View',
      shortcut: 'Ctrl+\\',
      run: () => useAppStore.getState().setSplitViewOpen(!useAppStore.getState().splitViewOpen)
    },
    {
      id: 'view.toggle-focus',
      label: 'Toggle Focus Mode',
      category: 'View',
      keywords: ['zen', 'distraction'],
      run: () => useAppStore.getState().toggleFocusMode()
    },
    {
      id: 'view.exit-focus',
      label: 'Exit Focus Mode',
      category: 'View',
      shortcut: 'Esc',
      isEnabled: () => useAppStore.getState().focusMode,
      disabledReason: 'Focus mode is off',
      run: () => useAppStore.getState().setFocusMode(false)
    },
    {
      id: 'view.toggle-md-preview',
      label: 'Toggle Markdown Preview',
      category: 'View',
      run: () => useAppStore.getState().setMdPreviewOpen(!useAppStore.getState().mdPreviewOpen)
    },
    {
      id: 'view.toggle-outline',
      label: 'Toggle Outline View',
      category: 'View',
      run: () => useAppStore.getState().setOutlineOpen(!useAppStore.getState().outlineOpen)
    },
    {
      id: 'view.toggle-collab',
      label: 'Toggle Collaboration Panel',
      category: 'View',
      run: () => useAppStore.getState().setCollabPanelOpen(!useAppStore.getState().collabPanelOpen)
    },
    {
      id: 'vcs.commit',
      label: 'Create Version (Commit)…',
      category: 'Version Control',
      shortcut: 'Ctrl+Shift+G',
      keywords: ['commit', 'save version'],
      run: withVcsView('commit')
    },
    { id: 'vcs.log', label: 'Version Control: History', category: 'Version Control', run: withVcsView('log') },
    { id: 'vcs.branches', label: 'Version Control: Branches', category: 'Version Control', run: withVcsView('branches') },
    { id: 'vcs.graph', label: 'Version Control: Commit Graph', category: 'Version Control', run: withVcsView('graph') },
    { id: 'vcs.merge', label: 'Version Control: Merge…', category: 'Version Control', run: withVcsView('merge') },
    { id: 'vcs.diff', label: 'Version Control: Diff', category: 'Version Control', run: withVcsView('diff') },
    { id: 'vcs.tags', label: 'Version Control: Tags', category: 'Version Control', run: withVcsView('tags') },
    {
      id: 'agent.undo',
      label: 'Undo Last Agent Action',
      category: 'Agent',
      isEnabled: () => useAppStore.getState().pendingChanges.some((c) => c.status === 'accepted'),
      disabledReason: 'No accepted agent changes to undo',
      run: () => useAppStore.getState().undoLastAcceptedChange()
    }
  ]
}

export function filterCommands(commands: AppCommand[], query: string): AppCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  return commands.filter((command) => {
    const haystack = [command.label, command.category, ...(command.keywords ?? [])].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}

export function groupCommands(commands: AppCommand[]): Array<{ category: CommandCategory; commands: AppCommand[] }> {
  const groups = new Map<CommandCategory, AppCommand[]>()
  for (const command of commands) {
    const list = groups.get(command.category) ?? []
    list.push(command)
    groups.set(command.category, list)
  }
  return Array.from(groups.entries()).map(([category, list]) => ({ category, commands: list }))
}
