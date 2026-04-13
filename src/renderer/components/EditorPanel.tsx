import React, { useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Toolbar } from './Toolbar'
import { DiffOverlay } from './DiffOverlay'
import { useAppStore } from '../store/app-store'

export const EditorPanel: React.FC = () => {
  const { documentContent, documentTitle, currentFilePath, isDirty, currentBranch,
    setDocumentContent, setDirty, pendingChanges, activePendingChangeId } = useAppStore()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Placeholder.configure({ placeholder: 'Start writing your document...' }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader
    ],
    content: documentContent || '<p></p>',
    onUpdate: ({ editor }) => {
      setDocumentContent(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'tiptap'
      }
    }
  })

  // When documentContent changes from outside (e.g., accepting a pending change), sync to editor
  useEffect(() => {
    if (editor && documentContent !== editor.getHTML()) {
      const pos = editor.state.selection.from
      editor.commands.setContent(documentContent || '<p></p>')
      // Try to restore cursor position
      try { editor.commands.setTextSelection(Math.min(pos, editor.state.doc.content.size)) } catch {}
    }
  }, [documentContent, editor])

  // Keyboard shortcut: Enter to accept, Escape to reject active pending change
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useAppStore.getState()
      if (!state.activePendingChangeId) return

      if (e.key === 'Enter' && !e.shiftKey) {
        // Only if not typing in an input/textarea
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
        e.preventDefault()
        state.acceptPendingChange(state.activePendingChangeId)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        state.rejectPendingChange(state.activePendingChangeId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const hasPending = pendingChanges.some((c) => c.status === 'pending')

  const handleOpen = useCallback(async () => {
    const filePath = await window.wordapp?.file.openDialog()
    if (filePath) {
      const result = await window.wordapp?.file.importDocx(filePath)
      if (result) {
        editor?.commands.setContent(result.content)
        useAppStore.getState().setDocumentContent(result.content)
        useAppStore.getState().setDocumentTitle(result.filePath.split(/[\\/]/).pop() || 'Untitled')
        useAppStore.getState().setCurrentFilePath(result.filePath)
        useAppStore.getState().setDirty(false)
      }
    }
  }, [editor])

  const handleNew = useCallback(() => {
    editor?.commands.setContent('<p></p>')
    useAppStore.getState().setDocumentContent('')
    useAppStore.getState().setDocumentTitle('Untitled')
    useAppStore.getState().setCurrentFilePath(null)
    useAppStore.getState().setDirty(false)
  }, [editor])

  return (
    <div className="editor-panel">
      <Toolbar editor={editor} onOpen={handleOpen} onNew={handleNew} />
      {hasPending && <DiffOverlay />}
      <div className={`editor-content${hasPending ? ' editor-content-dimmed' : ''}`}>
        <EditorContent editor={editor} />
      </div>
      <div className="editor-footer">
        <span>{isDirty ? '● ' : ''}{documentTitle}</span>
        <span>
          {currentFilePath && <span>{currentFilePath} · </span>}
          <span style={{ color: 'var(--accent)' }}>⎇ {currentBranch}</span>
        </span>
      </div>
    </div>
  )
}
