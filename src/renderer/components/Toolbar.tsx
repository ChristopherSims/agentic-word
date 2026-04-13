import React, { type FC } from 'react'
import { type Editor } from '@tiptap/react'
import { useAppStore } from '../store/app-store'

interface ToolbarProps {
  editor: Editor | null
  onOpen: () => void
  onNew: () => void
}

export const Toolbar: FC<ToolbarProps> = ({ editor, onOpen, onNew }) => {
  const { toggleChatSidebar, setVcsPanelOpen, setVcsPanelView, setAgentConfigOpen } = useAppStore()

  if (!editor) return <div className="toolbar" />

  const btn = (label: string, onClick: () => void, active?: boolean, disabled?: boolean) => (
    <button
      className={`toolbar-btn${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {label}
    </button>
  )

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
    const { currentFilePath, documentContent } = useAppStore.getState()
    if (currentFilePath) {
      // Direct save via main process
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
      {/* File */}
      <div className="toolbar-group">
        {btn('New', onNew)}
        {btn('Open', onOpen)}
        {btn('Save', handleSave)}
      </div>

      <div className="toolbar-divider" />

      {/* Undo/Redo */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">↩</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">↪</button>
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
        >
          H1
        </button>
        <button
          className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Lists */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          •≡
        </button>
        <button
          className={`toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          1.
        </button>
        <button
          className={`toolbar-btn${editor.isActive('blockquote') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          ❝
        </button>
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
        {btn('Commit', handleCommit)}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Agent & Sidebar */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => setAgentConfigOpen(true)} title="AI Agent Settings">⚙</button>
        <button className="toolbar-btn" onClick={toggleChatSidebar} title="Toggle Chat">💬</button>
      </div>
    </div>
  )
}
