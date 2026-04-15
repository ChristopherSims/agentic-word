import React, { useState, useEffect, useRef, useMemo, type FC } from 'react'
import { useAppStore } from '../store/app-store'

interface Command {
  id: string
  label: string
  category: string
  shortcut?: string
  action: () => void
}

export const CommandPalette: FC = () => {
  const { commandPaletteOpen, setCommandPaletteOpen } = useAppStore()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => [
    // File
    { id: 'new', label: 'New Document', category: 'File', shortcut: 'Ctrl+N', action: () => { window.wordapp?.on('file-new', () => {}); useAppStore.getState().setDocumentContent(''); useAppStore.getState().setDocumentTitle('Untitled'); useAppStore.getState().setCurrentFilePath(null); useAppStore.getState().setDirty(false) }},
    { id: 'open', label: 'Open File...', category: 'File', shortcut: 'Ctrl+O', action: () => window.wordapp?.file.openDialog().then(() => {}) },
    { id: 'save', label: 'Save', category: 'File', shortcut: 'Ctrl+S', action: () => window.wordapp?.on('file-save', () => {}) },
    { id: 'save-as', label: 'Save As...', category: 'File', shortcut: 'Ctrl+Shift+S', action: () => window.wordapp?.file.saveAsDialog().then(() => {}) },
    { id: 'export-pdf', label: 'Export PDF...', category: 'File', action: () => window.wordapp?.on('file-export-pdf', () => {}) },
    { id: 'template-blank', label: 'New from Template: Blank', category: 'File', action: () => loadTemplate('blank') },
    { id: 'template-letter', label: 'New from Template: Letter', category: 'File', action: () => loadTemplate('letter') },
    { id: 'template-resume', label: 'New from Template: Resume', category: 'File', action: () => loadTemplate('resume') },
    { id: 'template-report', label: 'New from Template: Report', category: 'File', action: () => loadTemplate('report') },
    { id: 'template-memo', label: 'New from Template: Memo', category: 'File', action: () => loadTemplate('memo') },
    // Edit
    { id: 'find', label: 'Find...', category: 'Edit', shortcut: 'Ctrl+F', action: () => useAppStore.getState().setFindBarOpen(true) },
    { id: 'find-replace', label: 'Find and Replace...', category: 'Edit', shortcut: 'Ctrl+H', action: () => useAppStore.getState().setFindBarOpen(true) },
    // View
    { id: 'settings', label: 'Settings...', category: 'View', shortcut: 'Ctrl+,', action: () => useAppStore.getState().setSettingsPanelOpen(true) },
    { id: 'toggle-sidebar', label: 'Toggle Chat Sidebar', category: 'View', action: () => useAppStore.getState().toggleChatSidebar() },
    { id: 'toggle-vcs', label: 'Toggle VCS Panel', category: 'View', action: () => useAppStore.getState().setVcsPanelOpen(!useAppStore.getState().vcsPanelOpen) },
    { id: 'toggle-split', label: 'Toggle Split View', category: 'View', shortcut: 'Ctrl+\\', action: () => useAppStore.getState().setSplitViewOpen(!useAppStore.getState().splitViewOpen) },
    { id: 'toggle-md-preview', label: 'Toggle Markdown Preview', category: 'View', action: () => useAppStore.getState().setMdPreviewOpen(!useAppStore.getState().mdPreviewOpen) },
    { id: 'focus-mode', label: 'Toggle Focus Mode', category: 'View', shortcut: 'Escape to exit', action: () => useAppStore.getState().toggleFocusMode() },
    { id: 'outline', label: 'Toggle Outline View', category: 'View', action: () => useAppStore.getState().setOutlineOpen(!useAppStore.getState().outlineOpen) },
    { id: 'doc-stats', label: 'Toggle Document Statistics', category: 'View', action: () => useAppStore.getState().setDocStatsPanelOpen(!useAppStore.getState().docStatsPanelOpen) },
    { id: 'insert-footnote', label: 'Insert Footnote', category: 'Edit', shortcut: 'Ctrl+Shift+F', action: () => { /* handled by editor shortcut */ } },
    { id: 'toggle-spellcheck', label: 'Toggle Spell Check', category: 'View', action: () => {} },
    // VCS
    { id: 'vcs-commit', label: 'VCS: Commit...', category: 'VCS', shortcut: 'Ctrl+Shift+G', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('commit') }},
    { id: 'vcs-log', label: 'VCS: Show Log', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('log') }},
    { id: 'vcs-branches', label: 'VCS: Branches', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('branches') }},
    { id: 'vcs-graph', label: 'VCS: Commit Graph', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('graph') }},
    { id: 'vcs-merge', label: 'VCS: Merge...', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('merge') }},
    { id: 'vcs-diff', label: 'VCS: Diff', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('diff') }},
    { id: 'vcs-tags', label: 'VCS: Tags', category: 'VCS', action: () => { useAppStore.getState().setVcsPanelOpen(true); useAppStore.getState().setVcsPanelView('tags') }},
    // Agent
    { id: 'agent-config', label: 'Configure AI Agent...', category: 'Agent', action: () => useAppStore.getState().setAgentConfigOpen(true) },
    { id: 'agent-undo', label: 'Undo Last Agent Action', category: 'Agent', action: () => useAppStore.getState().undoLastAcceptedChange() },
    { id: 'agent-scratchpad', label: 'Open Agent Scratchpad', category: 'Agent', action: () => {} },
    // Tools
    { id: 'devtools', label: 'Toggle Developer Tools', category: 'Tools', action: () => {} },
  ], [])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    )
  }, [commands, query])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const executeCommand = (cmd: Command) => {
    setCommandPaletteOpen(false)
    cmd.action()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      executeCommand(filtered[selectedIndex])
    } else if (e.key === 'Escape') {
      setCommandPaletteOpen(false)
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!commandPaletteOpen) return null

  let lastCategory = ''

  return (
    <div className="modal-overlay" onClick={() => setCommandPaletteOpen(false)}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-input-wrapper">
          <span className="command-palette-icon">⌘</span>
          <input
            ref={inputRef}
            className="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            autoComplete="off"
          />
        </div>
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="command-palette-empty">No commands found</div>
          )}
          {filtered.map((cmd, i) => {
            const showCategory = cmd.category !== lastCategory
            lastCategory = cmd.category
            return (
              <React.Fragment key={cmd.id}>
                {showCategory && <div className="command-palette-category">{cmd.category}</div>}
                <div
                  className={`command-palette-item${i === selectedIndex ? ' selected' : ''}`}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="command-palette-item-label">{cmd.label}</span>
                  {cmd.shortcut && <span className="command-palette-item-shortcut">{cmd.shortcut}</span>}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

async function loadTemplate(name: string) {
  const content = await window.wordapp?.template.get(name)
  if (content) {
    const store = useAppStore.getState()
    store.setDocumentContent(content)
    store.setDocumentTitle(name.charAt(0).toUpperCase() + name.slice(1))
    store.setCurrentFilePath(null)
    store.setDirty(true)
  }
}
