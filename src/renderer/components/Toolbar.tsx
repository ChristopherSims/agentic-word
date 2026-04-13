import React, { type FC } from 'react'
import { type Editor } from '@tiptap/react'
import { useAppStore } from '../store/app-store'

interface ToolbarProps {
  editor: Editor | null
  onOpen: () => void
  onNew: () => void
}

export const Toolbar: FC<ToolbarProps> = ({ editor, onOpen, onNew }) => {
  const { toggleChatSidebar, setVcsPanelOpen, setVcsPanelView, setAgentConfigOpen, pendingChanges } = useAppStore()
  const pendingCount = pendingChanges.filter((c) => c.status === 'pending').length

  if (!editor) return <div className="toolbar" />

  const formatBtn = (label: string, command: string, attrs?: Record<string, unknown>) => (
    <button
      className={`toolbar-btn${editor.isActive(command, attrs) ? ' active' : ''}`}
      onClick={() => editor.chain().focus().toggleMark(command, attrs).run()}
      title={label}
    >
      {label}
    </button>
  )

  const handleSave = async () => {
    const { currentFilePath } = useAppStore.getState()
    if (currentFilePath) {
      useAppStore.getState().setDirty(false)
    } else {
      const filePath = await window.wordapp?.file.saveDialog()
      if (filePath) {
        useAppStore.getState().setCurrentFilePath(filePath)
        useAppStore.getState().setDirty(false)
      }
    }
  }

  const handleCommit = () => {
    setVcsPanelOpen(true)
    setVcsPanelView('commit')
  }

  return (
    <div className="toolbar">
      {/* File operations — spaced out with wider buttons */}
      <div className="toolbar-group toolbar-group-file">
        <button className="toolbar-btn toolbar-btn-labeled" onClick={onNew} title="New Document">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          <span>New</span>
        </button>
        <button className="toolbar-btn toolbar-btn-labeled" onClick={onOpen} title="Open Document">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>Open</span>
        </button>
        <button className="toolbar-btn toolbar-btn-labeled" onClick={handleSave} title="Save Document">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <span>Save</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Undo/Redo */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Text formatting */}
      <div className="toolbar-group">
        {formatBtn('B', 'bold')}
        {formatBtn('I', 'italic')}
        {formatBtn('U', 'underline')}
        {formatBtn('S', 'strike')}
      </div>

      <div className="toolbar-divider" />

      {/* Headings */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >H1</button>
        <button
          className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >H2</button>
        <button
          className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >H3</button>
      </div>

      <div className="toolbar-divider" />

      {/* Lists */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >•≡</button>
        <button
          className={`toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >1.</button>
        <button
          className={`toolbar-btn${editor.isActive('blockquote') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >❝</button>
      </div>

      <div className="toolbar-divider" />

      {/* Insert */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert Table">⊞</button>
        <button className="toolbar-btn" onClick={() => { const url = window.prompt('Image URL:'); if (url) editor.chain().focus().setImage({ src: url }).run() }} title="Insert Image">🖼</button>
        <button className="toolbar-btn" onClick={() => { const url = window.prompt('Link URL:'); if (url) editor.chain().focus().setLink({ href: url }).run() }} title="Insert Link">🔗</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">—</button>
      </div>

      <div className="toolbar-divider" />

      {/* VCS */}
      <div className="toolbar-group">
        <button className="toolbar-btn toolbar-btn-labeled" onClick={handleCommit} title="Commit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="1" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="23" y2="12"/></svg>
          <span>Commit</span>
        </button>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Pending changes indicator */}
      {pendingCount > 0 && (
        <div className="toolbar-group" style={{ marginRight: 4 }}>
          <span className="pending-badge">{pendingCount} pending</span>
        </div>
      )}

      {/* Agent & Sidebar */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => setAgentConfigOpen(true)} title="AI Agent Settings">⚙</button>
        <button className="toolbar-btn" onClick={toggleChatSidebar} title="Toggle Chat">💬</button>
      </div>
    </div>
  )
}
