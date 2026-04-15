import React, { useCallback, useEffect, useState } from 'react'
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
import Collaboration from '@tiptap/extension-collaboration'
import { Toolbar } from './Toolbar'
import { DiffOverlay } from './DiffOverlay'
import { FindReplaceBar } from './FindReplaceBar'
import { TabBar } from './TabBar'
import { SplitEditor } from './SplitEditor'
import { FootnoteReference, FootnoteContent, FootnotesSection } from './Footnotes'
import { useAppStore } from '../store/app-store'
import { type Editor } from '@tiptap/react'
import { getYDoc } from '../collab-client'

// ─── Real Collab Cursor Overlay ───
const CollabCursorOverlay: FC<{ editor: Editor; cursors: Array<{ id: string; name: string; color: string; position: number; selection?: { from: number; to: number } }> }> = ({ editor, cursors }) => {
  const [coords, setCoords] = useState<Array<{ id: string; name: string; color: string; left: number; top: number; selLeft?: number; selWidth?: number }>>([])

  useEffect(() => {
    const updateCoords = () => {
      const editorEl = document.querySelector('.tiptap')
      if (!editorEl) return
      const editorRect = editorEl.getBoundingClientRect()
      const view = editor.view
      const newCoords: typeof coords = []

      for (const c of cursors) {
        try {
          const pos = Math.min(c.position, view.state.doc.content.size - 1)
          const domPos = view.coordsAtPos(pos)
          newCoords.push({
            id: c.id,
            name: c.name,
            color: c.color,
            left: domPos.left - editorRect.left,
            top: domPos.top - editorRect.top,
            ...(c.selection ? {
              selLeft: view.coordsAtPos(c.selection.from).left - editorRect.left,
              selWidth: view.coordsAtPos(c.selection.to).left - view.coordsAtPos(c.selection.from).left
            } : {})
          })
        } catch {}
      }
      setCoords(newCoords)
    }
    updateCoords()
    const interval = setInterval(updateCoords, 300)
    return () => clearInterval(interval)
  }, [editor, cursors])

  return (
    <div className="collab-cursors-overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      {coords.map((c) => (
        <div key={c.id}>
          {/* Selection highlight */}
          {c.selWidth !== undefined && c.selLeft !== undefined && c.selWidth > 0 && (
            <div style={{
              position: 'absolute', left: c.selLeft, top: c.top,
              width: c.selWidth, height: 20,
              background: c.color, opacity: 0.15, borderRadius: 2
            }} />
          )}
          {/* Cursor line */}
          <div style={{
            position: 'absolute', left: c.left, top: c.top,
            width: 2, height: 20,
            background: c.color, borderRadius: 1
          }} />
          {/* Name label */}
          <div style={{
            position: 'absolute', left: c.left - 2, top: c.top - 16,
            background: c.color, color: '#fff',
            fontSize: 10, fontWeight: 600, lineHeight: '14px',
            padding: '1px 4px', borderRadius: '3px 3px 3px 0',
            whiteSpace: 'nowrap', pointerEvents: 'none'
          }}>
            {c.name}
          </div>
        </div>
      ))}
    </div>
  )
}

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

  // Register inline edit callback
  useEffect(() => {
    useAppStore.getState().setInlineEditCallback(async (instruction: string, selection: string) => {
      const contentBefore = useAppStore.getState().documentContent
      try {
        // Send instruction to agent as a chat message
        const messages = [
          { role: 'user' as const, content: `Edit the following text according to this instruction: "${instruction}"\n\nText to edit:\n${selection}\n\nReturn ONLY the edited text, nothing else. Do not include any explanation or markdown formatting.` }
        ]
        await window.wordapp?.agent.chatStream(messages, {
          documentContent: contentBefore.slice(0, 4000),
          selection,
          currentBranch
        })
        // The response comes back via streaming events; the final message will be in chatMessages
        // Wait for streaming to finish, then use the last assistant message as the replacement
        const checkResult = () => {
          const state = useAppStore.getState()
          const lastAssistant = [...state.chatMessages].reverse().find((m) => m.role === 'assistant' && !m.streaming)
          if (lastAssistant && lastAssistant.content) {
            const editedText = lastAssistant.content.trim()
            // Replace selection in document
            const newContent = contentBefore.replace(selection, editedText)
            useAppStore.getState().addPendingChange({
              toolName: 'inline_edit',
              args: { instruction, selection },
              contentBefore,
              contentAfter: newContent,
              description: `Inline edit: "${instruction}" on "${selection.slice(0, 40)}..."`
            })
          }
        }
        // Poll for result since streaming is async
        setTimeout(checkResult, 3000)
      } catch (err) {
        useAppStore.getState().addToast('error', `Inline edit failed: ${(err as Error).message}`)
      }
    })
  }, [currentBranch])

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
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FootnoteReference,
      FootnoteContent,
      // Add Collaboration extension when Y.Doc exists (collab connected)
      ...(getYDoc() ? [Collaboration.configure({ document: getYDoc()! })] : [])
    ],
    content: documentContent || '<p></p>',
    onUpdate: ({ editor }) => {
      setDocumentContent(editor.getHTML())
      // Update outline headings
      const headings: Array<{ id: string; level: number; text: string; position: number }> = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          headings.push({
            id: `${node.attrs.level}-${pos}`,
            level: node.attrs.level as number,
            text: node.textContent,
            position: pos
          })
        }
      })
      useAppStore.getState().setOutlineHeadings(headings)
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
      // Settings shortcut
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        state.setSettingsPanelOpen(!state.settingsPanelOpen)
      }
      // New tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        state.addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })
      }
      // Toggle split view
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        state.setSplitViewOpen(!state.splitViewOpen)
      }
      // AI inline edit
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        const selection = window.getSelection()?.toString() || ''
        if (selection) {
          state.setInlineEditSelection(selection)
          state.setInlineEditOpen(true)
        }
      }
      if (e.key === 'Escape' && state.findBarOpen) {
        state.setFindBarOpen(false)
      }
      if (e.key === 'Escape' && state.focusMode) {
        state.setFocusMode(false)
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
    const state = useAppStore.getState()
    const defaultFont = state.defaultFontFamily
    const defaultSize = state.defaultFontSize
    const newContent = (defaultFont || defaultSize)
      ? `<p><span${defaultFont ? ` style="font-family: ${defaultFont}"` : ''}${defaultSize ? ` style="font-size: ${defaultSize}"` : ''}></span></p>`
      : '<p></p>'
    editor?.commands.setContent(newContent)
    useAppStore.getState().setDocumentContent(newContent)
    useAppStore.getState().setDocumentTitle('Untitled')
    useAppStore.getState().setCurrentFilePath(null)
    useAppStore.getState().setDirty(false)
  }, [editor])

  // Save handler — actually writes to disk
  const handleSave = useCallback(async () => {
    const state = useAppStore.getState()
    try {
      // VCS auto-commit before save if enabled
      if (state.vcsAutoCommitOnSave && state.documentContent) {
        await window.wordapp?.settings.vcsAutoCommit(`Auto-save: ${new Date().toISOString()}`, state.documentContent)
      }
      if (state.currentFilePath) {
        await window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent)
        useAppStore.getState().setDirty(false)
        useAppStore.getState().addToast('success', 'File saved')
      } else {
        const filePath = await window.wordapp?.file.saveDialog()
        if (filePath) {
          await window.wordapp?.file.saveFile(filePath, state.documentContent)
          useAppStore.getState().setCurrentFilePath(filePath)
          useAppStore.getState().setDirty(false)
          useAppStore.getState().addToast('success', 'File saved')
        }
      }
    } catch (err) {
      useAppStore.getState().addToast('error', `Save failed: ${(err as Error).message}`)
    }
  }, [])

  const { wordCount, charCount } = useAppStore()
  const collabCursors = useAppStore((s) => s.collabCursors)
  const splitViewOpen = useAppStore((s) => s.splitViewOpen)
  const focusMode = useAppStore((s) => s.focusMode)

  return (
    <div className={`editor-panel${focusMode ? ' focus-mode' : ''}`}>
      {!focusMode && <Toolbar editor={editor} onOpen={handleOpen} onNew={handleNew} onSave={handleSave} />}
      {!focusMode && <TabBar />}
      {hasPending && <DiffOverlay />}
      <FindReplaceBar editor={editor} />
      <div className={`editor-content${hasPending ? ' editor-content-dimmed' : ''}`}>
        {splitViewOpen ? (
          <div className="split-view-container">
            <div className="split-pane">
              <EditorContent editor={editor} />
            </div>
            <div className="split-divider" />
            <div className="split-pane split-pane-mirror">
              <div className="split-pane-label">Preview</div>
              <div className="tiptap" dangerouslySetInnerHTML={{ __html: documentContent || '<p></p>' }} style={{ padding: '2rem 3rem' }} />
            </div>
          </div>
        ) : (
          <>
            <EditorContent editor={editor} />
            {collabCursors.length > 0 && editor && (
              <CollabCursorOverlay editor={editor} cursors={collabCursors} />
            )}
          </>
        )}
        <FootnotesSection editor={editor} />
      </div>
      {!focusMode && (
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
      )}
    </div>
  )
}
