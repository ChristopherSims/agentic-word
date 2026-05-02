import React, { useCallback, useEffect, useState, useRef, type FC } from 'react'
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
import Mark from '@tiptap/extension-mark'
import { Toolbar } from './Toolbar'
import { DiffOverlay } from './DiffOverlay'
import { FindReplaceBar } from './FindReplaceBar'
import { TabBar } from './TabBar'
import { FootnoteReference, FootnoteContent, FootnotesSection } from './Footnotes'
import { InlineDiffOverlay } from './InlineDiffOverlay'
import { TrackChangesPanel } from './TrackChangesPanel'
import { useAppStore } from '../store/app-store'
import { type Editor } from '@tiptap/react'
import { type DocTab } from '../../shared/types'
import { getYDoc } from '../collab-client'
import { PageBreak, Autocorrect, CommentMark, InlineSuggestionGhost, inlineSuggestionKey } from '../extensions'
import { EditorContextMenu, type ContextMenuPos } from './EditorContextMenu'

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
        // coordsAtPos can throw if position is out of range or view is transitioning
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
          {c.selWidth !== undefined && c.selLeft !== undefined && c.selWidth > 0 && (
            <div style={{ position: 'absolute', left: c.selLeft, top: c.top, width: c.selWidth, height: 20, background: c.color, opacity: 0.15, borderRadius: 2 }} />
          )}
          <div style={{ position: 'absolute', left: c.left, top: c.top, width: 2, height: 20, background: c.color, borderRadius: 1 }} />
          <div style={{ position: 'absolute', left: c.left - 2, top: c.top - 16, background: c.color, color: '#fff', fontSize: 10, fontWeight: 600, lineHeight: '14px', padding: '1px 4px', borderRadius: '3px 3px 3px 0', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{c.name}</div>
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
    pageBreak: {
      insertPageBreak: () => ReturnType
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



// Helper to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const EditorPanel: React.FC = () => {
  const { documentContent, documentTitle, currentFilePath, isDirty, currentBranch,
    setDocumentContent, updateDocumentStats, setDirty, pendingChanges, activePendingChangeId,
    autoSaveEnabled, setFindBarOpen, findBarOpen,
    autocorrectEnabled, smartQuotesEnabled, emDashEnabled,
    documentMarginTop, documentMarginBottom, documentMarginLeft, documentMarginRight,
    trackChangesOn, inlineDiffOpen, pendingEditorOperation, setPendingEditorOperation } = useAppStore()

  const settingContentRef = useRef(false)
  const updateContentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateStatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updatePageBreakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateSelectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spellcheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentContentRef = useRef(documentContent)
  const lastHeadingsHtmlRef = useRef('')
  const lastHtmlForStatsRef = useRef('')
  const [contextMenuPos, setContextMenuPos] = React.useState<ContextMenuPos | null>(null)
  const [contextMenuText, setContextMenuText] = React.useState('')

  // Register inline edit callback
  useEffect(() => {
    useAppStore.getState().setInlineEditCallback(async (instruction: string, selection: string) => {
      const contentBefore = useAppStore.getState().documentContent
      try {
        const messages = [
          { role: 'user' as const, content: `Edit the following text according to this instruction: "${instruction}"\n\nText to edit:\n${selection}\n\nReturn ONLY the edited text, nothing else. Do not include any explanation or markdown formatting.` }
        ]
        await window.wordapp?.agent.chatStream(messages, {
          documentContent: contentBefore.slice(0, 4000),
          selection,
          currentBranch
        })
        const checkResult = () => {
          const state = useAppStore.getState()
          const lastAssistant = [...state.chatMessages].reverse().find((m) => m.role === 'assistant' && !m.streaming)
          if (lastAssistant && lastAssistant.content) {
            const editedText = lastAssistant.content.trim()
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
      PageBreak,
      CommentMark,
      Autocorrect.configure({ enabled: autocorrectEnabled, smartQuotes: smartQuotesEnabled, emDash: emDashEnabled }),
      InlineSuggestionGhost,
      // Add Collaboration extension when Y.Doc exists (collab connected)
      ...(getYDoc() ? [Collaboration.configure({ document: getYDoc()! })] : [])
    ],
    content: documentContent || '<p></p>',
    onUpdate: ({ editor }) => {
      // Skip if content is being set from outside (file open, save, etc.)
      if (settingContentRef.current) return

      // Aggressive debouncing: minimize store updates during fast typing
      // Clear all pending timers and reschedule
      if (updateContentTimerRef.current) clearTimeout(updateContentTimerRef.current)
      if (updateStatsTimerRef.current) clearTimeout(updateStatsTimerRef.current)
      if (updateSelectionTimerRef.current) clearTimeout(updateSelectionTimerRef.current)

      // Only immediately mark as dirty - everything else gets debounced
      const isDirtyAlready = useAppStore.getState().isDirty
      if (!isDirtyAlready) {
        useAppStore.getState().setDirty(true)
      }

      // Get current editor state once for all debounced updates
      const { from, to } = editor.state.selection

      // Debounce selection updates (low priority)
      updateSelectionTimerRef.current = setTimeout(() => {
        useAppStore.getState().setEditorSelection({ from, to })
      }, 100)

      // Debounce content and structural updates (medium priority)
      updateContentTimerRef.current = setTimeout(() => {
        const html = editor.getHTML()
        lastSentContentRef.current = html
        lastHtmlForStatsRef.current = html
        setDocumentContent(html)

        // Update outline headings only if content changed (cache optimization)
        if (html !== lastHeadingsHtmlRef.current) {
          lastHeadingsHtmlRef.current = html
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
        }

        // Track changes if enabled (batched after content update)
        if (useAppStore.getState().trackChangesOn) {
          const insertedText = editor.state.doc.textBetween(
            Math.min(from, to),
            Math.max(from, to),
            ' '
          )
          if (insertedText && insertedText.length > 0) {
            useAppStore.getState().addTrackedChange({
              type: 'insert',
              from: Math.min(from, to),
              to: Math.max(from, to),
              text: insertedText.slice(0, 100),
              author: useAppStore.getState().collabDisplayName
            })
          }
        }
      }, 200)

      // Debounce spellcheck: disable immediately via DOM (no state update = no re-render)
      // This is CRITICAL for performance - we avoid triggering React state updates on every keystroke
      const editorEl = document.querySelector('.tiptap') as HTMLElement
      if (editorEl && editorEl.getAttribute('spellcheck') !== 'false') {
        editorEl.setAttribute('spellcheck', 'false')
      }
      
      if (spellcheckTimerRef.current) clearTimeout(spellcheckTimerRef.current)
      spellcheckTimerRef.current = setTimeout(() => {
        // 800ms of no typing has passed, now wait 2000ms more before enabling
        setTimeout(() => {
          const editorEl = document.querySelector('.tiptap') as HTMLElement
          if (editorEl) editorEl.setAttribute('spellcheck', 'true')
        }, 2000)
      }, 800)

      // Debounce page break count updates (low priority, expensive regex)
      if (updatePageBreakTimerRef.current) clearTimeout(updatePageBreakTimerRef.current)
      updatePageBreakTimerRef.current = setTimeout(() => {
        const pbCount = (lastHtmlForStatsRef.current.match(/data-page-break/g) || []).length
        useAppStore.getState().setPageBreakCount(pbCount)
      }, 1500)

      // Debounce word count updates with longer delay (lowest priority)
      if (updateStatsTimerRef.current) clearTimeout(updateStatsTimerRef.current)
      updateStatsTimerRef.current = setTimeout(() => {
        updateDocumentStats(lastHtmlForStatsRef.current)
      }, 1500)
    },
    onSelectionUpdate: ({ editor }) => {
      // Skip - we handle selection updates in onUpdate with debounce
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
        spellcheck: 'true'
      }
    }
  })

  // Sync autocorrect config when settings change
  useEffect(() => {
    if (editor) {
      const acExt = editor.extensionManager.extensions.find((e) => e.name === 'autocorrect')
      if (acExt) {
        acExt.options.enabled = autocorrectEnabled
        acExt.options.smartQuotes = smartQuotesEnabled
        acExt.options.emDash = emDashEnabled
      }
    }
  }, [autocorrectEnabled, smartQuotesEnabled, emDashEnabled, editor])

  // Handle pending editor operations from agent tools
  useEffect(() => {
    if (!editor || !pendingEditorOperation) return

    console.log('[EditorPanel] Applying pending editor operation:', pendingEditorOperation)

    try {
      if (pendingEditorOperation.type === 'insert' && pendingEditorOperation.content) {
        // Insert content at specified position
        if (pendingEditorOperation.position === 'end') {
          editor.commands.focus('end')
          editor.commands.insertContent(pendingEditorOperation.content)
        } else if (pendingEditorOperation.position === 'start') {
          editor.commands.focus('start')
          editor.commands.insertContent(pendingEditorOperation.content)
        } else {
          editor.commands.insertContent(pendingEditorOperation.content, { updateSelection: true })
        }
        
        // Note: insertContent() triggers onUpdate handler, which debounces content sync
        // No need to call getHTML() here - avoids redundant DOM serialization
        useAppStore.getState().addToast('success', 'Content inserted')
      } else if (pendingEditorOperation.type === 'replace' && pendingEditorOperation.search && pendingEditorOperation.replace !== undefined) {
        const plainText = editor.getText()
        
        // Count matches using regex
        const regex = new RegExp(escapeRegExp(pendingEditorOperation.search), pendingEditorOperation.replaceAll ? 'g' : '')
        const matches = plainText.match(regex)
        const replacedCount = matches ? matches.length : 0
        
        if (replacedCount > 0) {
          // Replace in plain text first to count
          const newText = plainText.replace(regex, pendingEditorOperation.replace!)
          
          // Apply replacement by finding positions and using editor commands
          // This is safer than HTML manipulation and triggers onUpdate for content sync
          let searchIndex = 0
          let replaceCount = 0
          
          while (replaceCount < (pendingEditorOperation.replaceAll ? replacedCount : 1) && searchIndex < plainText.length) {
            const foundIndex = plainText.indexOf(pendingEditorOperation.search, searchIndex)
            if (foundIndex === -1) break
            
            editor.commands.focus(foundIndex)
            editor.commands.selectTextRange({ from: foundIndex, to: foundIndex + pendingEditorOperation.search.length })
            editor.commands.insertContent(pendingEditorOperation.replace!)
            
            replaceCount++
            searchIndex = foundIndex + 1
          }
          
          useAppStore.getState().addToast('success', `Replaced ${replacedCount} occurrence${replacedCount !== 1 ? 's' : ''}`)
        } else {
          useAppStore.getState().addToast('warning', `No matches found for \"${pendingEditorOperation.search}\"`)
        }
      }
    } catch (err) {
      console.error('[EditorPanel] Failed to apply editor operation:', err)
      useAppStore.getState().addToast('error', `Failed to apply change: ${(err as Error).message}`)
    }

    // Clear the pending operation
    setPendingEditorOperation(null)
  }, [editor, pendingEditorOperation, setDocumentContent, setPendingEditorOperation])

  // Handle structured TipTap operations from agent
  useEffect(() => {
    if (!editor) return

    const handleEditTiptap = (data: unknown) => {
      const tiptapData = data as { ops?: Array<Record<string, unknown>> }
      if (!tiptapData.ops || !Array.isArray(tiptapData.ops)) return

      console.log('[EditorPanel] Applying TipTap operations:', tiptapData.ops.length)

      try {
        // Dynamically import and apply the TipTap tool
        import('../utils/tiptap-tool').then(({ applyTiptapOps }) => {
          applyTiptapOps(editor, { ops: tiptapData.ops as any })
          
          // Note: applyTiptapOps triggers editor updates which are debounced in onUpdate
          // No need to call getHTML() - avoids redundant DOM serialization
          useAppStore.getState().addToast('success', `Applied ${tiptapData.ops?.length || 0} document operation${(tiptapData.ops?.length || 0) !== 1 ? 's' : ''}`)
        })
      } catch (err) {
        console.error('[EditorPanel] Failed to apply TipTap operations:', err)
        useAppStore.getState().addToast('error', `Failed to apply operations: ${(err as Error).message}`)
      }
    }

    const unsub = window.wordapp?.on('agent-edit-tiptap', handleEditTiptap as any) as (() => void) | undefined
    return () => {
      unsub?.()
    }
  }, [editor, setDocumentContent])

  // After 1.5s of inactivity, ask the agent for a continuation suggestion
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | null = null

    const handleUpdate = () => {
      // Clear any existing suggestion
      editor.commands.clearInlineSuggestion()
      useAppStore.getState().setInlineSuggestion(null)
      useAppStore.getState().setInlineSuggestionVisible(false)

      // Debounce: fetch suggestion after 1.5s of inactivity
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        const state = useAppStore.getState()
        if (!state.documentContent) return

        const { from } = editor.state.selection
        const textBefore = editor.state.doc.textBetween(
          Math.max(0, from - 300),
          from,
          '\n'
        )

        // Inline suggestions are best-effort — don't interrupt user if AI endpoint is unavailable
        try {
          const suggestion = await window.wordapp?.agent.inlineSuggest(
            state.documentContent,
            from,
            textBefore
          )
          if (suggestion && typeof suggestion === 'string' && suggestion.trim()) {
            // Only show if cursor hasn't moved
            const currentFrom = editor.state.selection.from
            if (currentFrom === from) {
              editor.commands.setInlineSuggestion(suggestion.trim(), from)
              useAppStore.getState().setInlineSuggestion(suggestion.trim())
              useAppStore.getState().setInlineSuggestionVisible(true)
            }
          }
        } catch { /* ignore */ }
      }, 1500)
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
      if (timer) clearTimeout(timer)
    }
  }, [editor])

  // Sync documentContent to the editor only for external changes (file open, tab switch, AI edits)
  // Skip when content came from the editor itself (tracked via lastSentContentRef)
  useEffect(() => {
    if (editor && documentContent !== lastSentContentRef.current) {
      // Clear any pending debounced save from a previous tab
      if (updateContentTimerRef.current) {
        clearTimeout(updateContentTimerRef.current)
        updateContentTimerRef.current = null
      }
      settingContentRef.current = true
      lastSentContentRef.current = documentContent
      const pos = editor.state.selection.from
      editor.commands.setContent(documentContent || '<p></p>')
      try { editor.commands.setTextSelection(Math.min(pos, editor.state.doc.content.size)) } catch { /* position may be out of range after content update */ }
      // Reset flag after a tick so the editor can settle
      setTimeout(() => { settingContentRef.current = false }, 50)
    }
  }, [documentContent, editor])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useAppStore.getState()

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

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); state.setFindBarOpen(true) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); state.setFindBarOpen(true) }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); state.setSettingsPanelOpen(!state.settingsPanelOpen) }
      if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); state.addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false }) }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); state.setSplitViewOpen(!state.splitViewOpen) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        const selection = window.getSelection()?.toString() || ''
        if (selection) { state.setInlineEditSelection(selection); state.setInlineEditOpen(true) }
      }
      // Ctrl+Shift+M — add comment on selection
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault()
        const sel = window.getSelection()?.toString() || ''
        if (sel && editor) {
          const { from, to } = editor.state.selection
          state.setCommentSelection(from, to, sel)
          state.setCommentInputOpen(true)
          state.setCommentPanelOpen(true)
        }
      }
      // Ctrl+Enter — insert page break
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        editor?.commands.insertPageBreak()
      }
      if (e.key === 'Escape' && state.findBarOpen) { state.setFindBarOpen(false) }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editor])

  // Handle pending suggestion insertion
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe(
      (state) => state.pendingSuggestionInsert,
      (pendingText) => {
        if (pendingText && editor) {
          // Insert the text at the current cursor position using TipTap's chain API
          editor.chain().focus().insertContent(pendingText).run()
          
          // Clear the pending suggestion
          useAppStore.getState().setPendingSuggestionInsert(null)
        }
      }
    )
    return unsubscribe
  }, [editor])

  // Bridge store's inlineSuggestion text into the InlineSuggestionGhost TipTap extension
  // so the grey ghost text appears and Tab/Escape handlers work.
  useEffect(() => {
    if (!editor) return
    return useAppStore.subscribe(
      (state) => state.inlineSuggestion,
      (text) => {
        if (!editor) return
        if (text) {
          const selection = useAppStore.getState().editorSelection
          const from = selection?.from ?? editor.state.selection.from
          editor.commands.setInlineSuggestion(text, from)
        } else {
          editor.commands.clearInlineSuggestion()
        }
      }
    )
  }, [editor])

  // Capture-phase DOM listener for Tab/Escape to accept/dismiss inline suggestions.
  // Must use native DOM capture (not ProseMirror handleKeyDown) because Electron
  // intercepts Tab at the browser level before TipTap's pipeline sees it.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom

    const handleCapture = (e: KeyboardEvent) => {
      const state = inlineSuggestionKey.getState(editor.state)
      if (!state?.suggestion) return

      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopImmediatePropagation()
        // Use the same insert method the AI writing tool uses
        editor.commands.insertContent(state.suggestion)
        editor.commands.clearInlineSuggestion()
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        editor.commands.clearInlineSuggestion()
      }
    }

    dom.addEventListener('keydown', handleCapture, true) // capture phase
    return () => dom.removeEventListener('keydown', handleCapture, true)
  }, [editor])

  // Right-click context menu
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const text = window.getSelection()?.toString() || editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        ' '
      )
      setContextMenuText(text || '')
      setContextMenuPos({ x: e.clientX, y: e.clientY })
    }

    dom.addEventListener('contextmenu', handleContextMenu, true)
    return () => dom.removeEventListener('contextmenu', handleContextMenu, true)
  }, [editor])

  // Auto-save: listen for trigger from main process
  useEffect(() => {
    const unsubscribe = window.wordapp?.on('auto-save-trigger', () => {
      const state = useAppStore.getState()
      if (state.autoSaveEnabled && state.isDirty && state.currentFilePath) {
        window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent).then(() => {
          useAppStore.getState().setDirty(false)
          useAppStore.getState().setLastAutoSave(Date.now())
        })
      }
    })
    return () => unsubscribe?.()
  }, [])

  // Menu event listeners for find
  useEffect(() => {
    const unsub1 = window.wordapp?.on('find-open', () => setFindBarOpen(true))
    const unsub2 = window.wordapp?.on('find-replace-open', () => setFindBarOpen(true))
    return () => {
      unsub1?.()
      unsub2?.()
    }
  }, [])

  const hasPending = pendingChanges.some((c) => c.status === 'pending')

  const handleOpen = useCallback(async () => {
    const filePath = await window.wordapp?.file.openDialog()
    if (filePath) {
      const result = await window.wordapp?.file.importDocx(filePath)
      if (result) {
        const name = result.filePath.split(/[\\/]/).pop()
        if (!name) throw new Error(`Invalid file path: ${result.filePath}`)
        editor?.commands.setContent(result.content)
        useAppStore.getState().setDocumentContent(result.content)
        useAppStore.getState().setDocumentTitle(name)
        useAppStore.getState().setCurrentFilePath(result.filePath)
        useAppStore.getState().setDirty(false)
        useAppStore.getState().updateDocTab(useAppStore.getState().activeTabId, { title: name, filePath: result.filePath, isDirty: false })
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
    // Update the current tab to reflect the new document
    useAppStore.getState().updateDocTab(state.activeTabId, {
      title: 'Untitled',
      filePath: null,
      content: newContent,
      isDirty: false
    })
  }, [editor])

  const handleSave = useCallback(async () => {
    const state = useAppStore.getState()
    try {
      if (state.vcsAutoCommitOnSave && state.documentContent) {
        await window.wordapp?.settings.vcsAutoCommit(`Auto-save: ${new Date().toISOString()}`, state.documentContent)
      }
      if (state.currentFilePath) {
        await window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent)
        useAppStore.getState().setDirty(false)
        useAppStore.getState().addToast('success', 'File saved')
        // Sync tab title with filename
        const name = state.currentFilePath.split(/[\\/]/).pop() || state.documentTitle
        if (name !== state.documentTitle) {
          useAppStore.getState().setDocumentTitle(name)
        }
        useAppStore.getState().updateDocTab(state.activeTabId, { title: name, filePath: state.currentFilePath, isDirty: false })
      } else {
        const filePath = await window.wordapp?.file.saveDialog()
        if (filePath) {
          await window.wordapp?.file.saveFile(filePath, state.documentContent)
          const name = filePath.split(/[\\/]/).pop()
          if (!name) throw new Error(`Invalid file path: ${filePath}`)
          useAppStore.getState().setCurrentFilePath(filePath)
          useAppStore.getState().setDocumentTitle(name)
          useAppStore.getState().setDirty(false)
          useAppStore.getState().addToast('success', 'File saved')
          // Update tab title to match
          const tabId = useAppStore.getState().activeTabId
          useAppStore.getState().updateDocTab(tabId, { title: name, filePath })
        }
      }
    } catch (err) {
      useAppStore.getState().addToast('error', `Save failed: ${(err as Error).message}`)
    }
  }, [])

  const { wordCount, charCount, pageBreakCount } = useAppStore()
  const collabCursors = useAppStore((s) => s.collabCursors)
  const splitViewOpen = useAppStore((s) => s.splitViewOpen)
  const splitViewRightTabId = useAppStore((s) => s.splitViewRightTabId)
  const docTabs = useAppStore((s) => s.docTabs)
  const setSplitViewRightTab = useAppStore((s) => s.setSplitViewRightTab)

  const pageCount = pageBreakCount + 1
  
  // Get the right pane tab content
  const rightTab = docTabs.find((t) => t.id === splitViewRightTabId)

  return (
    <div className="editor-panel">
      <Toolbar editor={editor} onOpen={handleOpen} onNew={handleNew} onSave={handleSave} />
      <TabBar />
      {hasPending && <DiffOverlay />}
      <FindReplaceBar editor={editor} />
      <div className={`editor-content${hasPending ? ' editor-content-dimmed' : ''}`} style={{ position: 'relative' }}>
        {/* Inline diff overlay (covers editor when active) */}
        {inlineDiffOpen && <InlineDiffOverlay />}

        {splitViewOpen ? (
          <div className="split-view-container">
            {/* Left editor pane */}
            <div className="split-pane">
              <div style={{ margin: `${documentMarginTop}px ${documentMarginRight}px ${documentMarginBottom}px ${documentMarginLeft}px`, flex: 1, overflow: 'auto' }}>
                <EditorContent editor={editor} />
              </div>
            </div>
            {/* Divider */}
            <div className="split-divider" />
            {/* Right preview pane */}
            <div className="split-pane">
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <label style={{ color: 'var(--text-secondary)' }}>View:</label>
                <select 
                  value={splitViewRightTabId || ''} 
                  onChange={(e) => setSplitViewRightTab(e.target.value || null)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  <option value="">-- Select a document --</option>
                  {docTabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title} {tab.isDirty ? '●' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {rightTab && (
                <div style={{ margin: `${documentMarginTop}px ${documentMarginRight}px ${documentMarginBottom}px ${documentMarginLeft}px`, flex: 1, overflow: 'auto' }}>
                  <div className="tiptap" dangerouslySetInnerHTML={{ __html: rightTab.content || '<p></p>' }} style={{ pointerEvents: 'none' }} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ margin: `${documentMarginTop}px ${documentMarginRight}px ${documentMarginBottom}px ${documentMarginLeft}px` }}>
              <EditorContent editor={editor} />
            </div>
            {collabCursors.length > 0 && editor && (
              <CollabCursorOverlay editor={editor} cursors={collabCursors} />
            )}
          </>
        )}
        <FootnotesSection editor={editor} />

        {/* Track changes panel (bottom of editor) */}
        {trackChangesOn && <TrackChangesPanel />}
      <EditorContextMenu
        editor={editor!}
        position={contextMenuPos}
        selectedText={contextMenuText}
        onClose={() => setContextMenuPos(null)}
      />
      </div>
      <div className="editor-footer">
        <span>{isDirty ? '● ' : ''}{documentTitle}</span>
        <span className="editor-footer-center">
          {wordCount} words · {charCount} chars · {pageCount} page{pageCount !== 1 ? 's' : ''}
        </span>
        <span>
          {currentFilePath && <span>{currentFilePath} · </span>}
          <span style={{ color: 'var(--accent)' }}>⎇ {currentBranch}</span>
        </span>
      </div>
      </div>
    )
  }
