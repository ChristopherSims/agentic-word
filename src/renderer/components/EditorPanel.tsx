import React, { useCallback } from 'react'
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
import { useAppStore } from '../store/app-store'

export const EditorPanel: React.FC = () => {
  const { documentContent, documentTitle, currentFilePath, isDirty, currentBranch, setDocumentContent, setDirty } = useAppStore()

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
      <div className="editor-content">
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
