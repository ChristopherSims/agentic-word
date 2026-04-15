import React, { type FC } from 'react'
import { type Editor } from '@tiptap/react'
import { useAppStore } from '../store/app-store'

interface ToolbarProps {
  editor: Editor | null
  onOpen: () => void
  onNew: () => void
  onSave: () => void
}

const FONT_FAMILIES = [
  'Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New',
  'Georgia', 'Helvetica', 'Segoe UI', 'Times New Roman', 'Verdana'
]

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72']

const COLORS = [
  '#cdd6f4', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa',
  '#cba6f7', '#94e2d5', '#fab387', '#f5c2e7', '#a6adc8',
  '#1e1e2e', '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff'
]

export const Toolbar: FC<ToolbarProps> = ({ editor, onOpen, onNew, onSave }) => {
  const { toggleChatSidebar, setVcsPanelOpen, setVcsPanelView, setAgentConfigOpen,
    pendingChanges, setFindBarOpen, findBarOpen } = useAppStore()
  const pendingCount = pendingChanges.filter((c) => c.status === 'pending').length

  if (!editor) return <div className="toolbar" />

  const formatBtn = (label: string, command: string, attrs?: Record<string, unknown>) => (
    <button
      className={`toolbar-btn${editor.isActive(command, attrs) ? ' active' : ''}`}
      onClick={() => editor.chain().focus().toggleMark(command, attrs).run()}
      title={label}
    >{label}</button>
  )

  const handleCommit = () => {
    setVcsPanelOpen(true)
    setVcsPanelView('commit')
  }

  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || ''
  const currentFontSize = editor.getAttributes('textStyle').fontSize || ''

  return (
    <div className="toolbar">
      {/* File */}
      <div className="toolbar-group toolbar-group-file">
        <button className="toolbar-btn toolbar-btn-labeled" onClick={onNew} title="New Document">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          <span>New</span>
        </button>
        <button className="toolbar-btn toolbar-btn-labeled" onClick={onOpen} title="Open Document">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>Open</span>
        </button>
        <button className="toolbar-btn toolbar-btn-labeled" onClick={onSave} title="Save Document (Ctrl+S)">
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

      {/* Font Family */}
      <div className="toolbar-group">
        <select
          className="toolbar-select"
          value={currentFontFamily}
          onChange={(e) => {
            if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run()
            else editor.chain().focus().unsetFontFamily().run()
          }}
          title="Font Family"
        >
          <option value="">Font</option>
          {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        {/* Font Size */}
        <select
          className="toolbar-select toolbar-select-sm"
          value={currentFontSize}
          onChange={(e) => {
            if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run()
            else editor.chain().focus().unsetFontSize().run()
          }}
          title="Font Size"
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => <option key={s} value={`${s}px`}>{s}</option>)}
        </select>
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

      {/* Text Color & Highlight */}
      <div className="toolbar-group">
        <label className="toolbar-color-picker" title="Text Color">
          <span className="toolbar-color-icon">A</span>
          <div className="toolbar-color-indicator" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#cdd6f4' }} />
          <input
            type="color"
            value={editor.getAttributes('textStyle').color || '#cdd6f4'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <label className="toolbar-color-picker" title="Highlight Color">
          <span className="toolbar-color-icon" style={{ background: 'var(--warning)', borderRadius: 2, padding: '0 2px' }}>A</span>
          <div className="toolbar-color-indicator" style={{ backgroundColor: editor.getAttributes('highlight').color || '#f9e2af' }} />
          <input
            type="color"
            value={editor.getAttributes('highlight').color || '#f9e2af'}
            onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
          />
        </label>
      </div>

      <div className="toolbar-divider" />

      {/* Headings */}
      <div className="toolbar-group">
        <button className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={`toolbar-btn toolbar-btn-text${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
      </div>

      <div className="toolbar-divider" />

      {/* Lists & Alignment */}
      <div className="toolbar-group">
        <button className={`toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">•≡</button>
        <button className={`toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered List">1.</button>
        <button className={`toolbar-btn${editor.isActive('blockquote') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">❝</button>
      </div>

      <div className="toolbar-divider" />

      {/* Text Alignment */}
      <div className="toolbar-group">
        <button className={`toolbar-btn${editor.isActive({ textAlign: 'left' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left">⫷</button>
        <button className={`toolbar-btn${editor.isActive({ textAlign: 'center' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align Center">⫿</button>
        <button className={`toolbar-btn${editor.isActive({ textAlign: 'right' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right">⫶</button>
        <button className={`toolbar-btn${editor.isActive({ textAlign: 'justify' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">☰</button>
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

      {/* Find & Replace */}
      <div className="toolbar-group">
        <button className={`toolbar-btn${findBarOpen ? ' active' : ''}`} onClick={() => setFindBarOpen(!findBarOpen)} title="Find & Replace (Ctrl+F)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>

      {/* Pending changes */}
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
