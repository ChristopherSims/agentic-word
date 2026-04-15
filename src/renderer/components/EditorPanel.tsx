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
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Toolbar } from './Toolbar'
import { DiffOverlay } from './DiffOverlay'
import { FindReplaceBar } from './FindReplaceBar'
import { useAppStore } from '../store/app-store'

// Custom FontSize extension using TextStyle
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

import { Extension } from '@tiptap/core'

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, string>) => {
            if (!attrs.fontSize) return {}
            return { style: `font-size: ${attrs.fontSize}` }
          }
        }
      }
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }
  }
})

export const EditorPanel: React.FC = () => {
  const { documentContent, documentTitle, currentFilePath, isDirty, currentBranch,
    setDocumentContent, setDirty, pendingChanges, activePendingChangeId,
    autoSaveEnabled, setFindBarOpen, findBarOpen } = useAppStore()

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
      TableHeader,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    content: documentContent || '<p></p>',
    onUpdate: ({ editor }) => {
      setDocumentContent(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
        spellcheck: 'true'
      }
    }
  })

  // Sync documentContent from outside changes to the editor
  useEffect(() => {
    if (editor && documentContent !== editor.getHTML()) {
      const pos = editor.state.selection.from
      editor.commands.setContent(documentContent || '<p></p>')
      try { editor.commands.setTextSelection(Math.min(pos, editor.state.doc.content.size)) } catch {}
    }
  }, [documentContent, editor])

  // Keyboard shortcuts for pending changes + find/replace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useAppStore.getState()

      // Pending change shortcuts
      if (state.activePendingChangeId) {
        if (e.key === 'Enter' && !e.shiftKey) {
          if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
          e.preventDefault()
          state.acceptPendingChange(state.activePendingChangeId)
          return
        } else if (e.key === 'Escape') {
          e.preventDefault()
          state.rejectPendingChange(state.activePendingChangeId)
          return
        }
      }

      // Find/replace shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        state.setFindBarOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        state.setFindBarOpen(true)
      }
      if (e.key === 'Escape' && state.findBarOpen) {
        state.setFindBarOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-save: listen for trigger from main process
  useEffect(() => {
    window.wordapp?.on('auto-save-trigger', () => {
      const state = useAppStore.getState()
      if (state.autoSaveEnabled && state.isDirty && state.currentFilePath) {
        window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent).then(() => {
          useAppStore.getState().setDirty(false)
          useAppStore.getState().setLastAutoSave(Date.now())
        })
      }
    })
  }, [])

  // Menu event listeners for find
  useEffect(() => {
    window.wordapp?.on('find-open', () => setFindBarOpen(true))
    window.wordapp?.on('find-replace-open', () => setFindBarOpen(true))
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

  // Save handler — actually writes to disk
  const handleSave = useCallback(async () => {
    const state = useAppStore.getState()
    if (state.currentFilePath) {
      await window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent)
      useAppStore.getState().setDirty(false)
    } else {
      const filePath = await window.wordapp?.file.saveDialog()
      if (filePath) {
        await window.wordapp?.file.saveFile(filePath, state.documentContent)
        useAppStore.getState().setCurrentFilePath(filePath)
        useAppStore.getState().setDirty(false)
      }
    }
  }, [])

  const { wordCount, charCount } = useAppStore()
  const collabCursors = useAppStore((s) => s.collabCursors)

  return (
    <div className="editor-panel">
      <Toolbar editor={editor} onOpen={handleOpen} onNew={handleNew} onSave={handleSave} />
      {hasPending && <DiffOverlay />}
      <FindReplaceBar editor={editor} />
      <div className={`editor-content${hasPending ? ' editor-content-dimmed' : ''}`}>
        <EditorContent editor={editor} />
        {/* Collab cursors overlay */}
        {collabCursors.length > 0 && (
          <div className="collab-cursors-overlay">
            {collabCursors.map((c) => (
              <div key={c.id} className="collab-cursor-label" style={{ color: c.color }}>
                <span className="collab-cursor-dot" style={{ background: c.color }} />
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="editor-footer">
        <span>{isDirty ? '● ' : ''}{documentTitle}</span>
        <span className="editor-footer-center">
          {wordCount} words · {charCount} chars
        </span>
        <span>
          {currentFilePath && <span>{currentFilePath} · </span>}
          <span style={{ color: 'var(--accent)' }}>⎇ {currentBranch}</span>
        </span>
      </div>
    </div>
  )
}
