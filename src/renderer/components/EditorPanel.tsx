import React, { useCallback, useEffect, useState, useRef } from 'react'
import DOMPurify from 'dompurify'
import { throwIfIpcError } from '../utils'
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
import { FootnoteReference, FootnoteContent, FootnotesSection } from './Footnotes'
import { InlineDiffOverlay } from './InlineDiffOverlay'
import { TrackChangesPanel } from './TrackChangesPanel'
import { useAppStore } from '../store/app-store'
import { type Editor } from '@tiptap/react'
import { type DocTab } from '../../shared/types'
import { getYDoc } from '../collab-client'
import { PageBreak, Autocorrect, CommentMark, InlineSuggestionGhost, inlineSuggestionKey, FontSize } from '../extensions'
import { EditorContextMenu, type ContextMenuPos } from './EditorContextMenu'
import { CollabCursorOverlay } from './CollabCursorOverlay'
import { useDebounceManager } from '../hooks/useDebounceManager'
import { useCachedValue } from '../hooks/useCachedValue'
import { useDocumentStream } from '../hooks/useDocumentStream'
import type { Node as PMNode } from '@tiptap/pm/model'

// ─── Timing Constants (ms) ───
const DEBOUNCE_SELECTION = 150
const DEBOUNCE_CONTENT_SYNC = 350
const DEBOUNCE_SPELLCHECK = 800
const DEBOUNCE_SPELLCHECK_REENABLE = 2000
const DEBOUNCE_PAGE_BREAK = 1500
const DEBOUNCE_STATS = 1500
// How much plain text before the cursor is kept for the agent's context
const CURSOR_CONTEXT_CHARS = 1500

// ─── Agent operation position helpers ───
interface TextRange { from: number; to: number }

/**
 * Find all occurrences of `search` in the doc's leaf textblocks, returning exact doc positions.
 * Plain-text offsets don't equal ProseMirror positions, so a char-index → doc-position map is
 * built per block instead of searching editor.getText().
 */
function findTextRangesInDoc(doc: PMNode, search: string): TextRange[] {
  const ranges: TextRange[] = []
  if (!search) return ranges
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const map: number[] = []
    node.descendants((child, childPos) => {
      if (child.isText && child.text) {
        const start = pos + 1 + childPos
        for (let i = 0; i < child.text.length; i++) map.push(start + i)
        text += child.text
      }
      return false
    })
    let idx = text.indexOf(search)
    while (idx !== -1) {
      ranges.push({ from: map[idx], to: map[idx + search.length - 1] + 1 })
      idx = text.indexOf(search, idx + search.length)
    }
    return false
  })
  return ranges
}

/** Find the doc position immediately after the first block whose text contains `search`. */
function findPosAfterBlock(doc: PMNode, search: string): number | null {
  let result: number | null = null
  doc.descendants((node, pos) => {
    if (result !== null) return false
    if (!node.isTextblock) return true
    if (node.textContent.includes(search)) {
      result = pos + node.nodeSize
    }
    return false
  })
  return result
}

export const EditorPanel: React.FC = () => {
  // Selective subscriptions: only fields that directly affect rendered JSX
  const documentTitle = useAppStore((s) => s.documentTitle)
  const currentFilePath = useAppStore((s) => s.currentFilePath)
  const isDirty = useAppStore((s) => s.isDirty)
  const saveStatus = useAppStore((s) => s.saveStatus)
  const saveError = useAppStore((s) => s.saveError)
  const findBarOpen = useAppStore((s) => s.findBarOpen)
  const inlineDiffOpen = useAppStore((s) => s.inlineDiffOpen)
  const trackChangesOn = useAppStore((s) => s.trackChangesOn)
  const openStoryboardPopup = useAppStore((s) => s.openStoryboardPopup)
  const openMemoryPopup = useAppStore((s) => s.openMemoryPopup)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const documentMarginTop = useAppStore((s) => s.documentMarginTop)
  const documentMarginBottom = useAppStore((s) => s.documentMarginBottom)
  const documentMarginLeft = useAppStore((s) => s.documentMarginLeft)
  const documentMarginRight = useAppStore((s) => s.documentMarginRight)
  const wordCount = useAppStore((s) => s.wordCount)
  const charCount = useAppStore((s) => s.charCount)
  const pageBreakCount = useAppStore((s) => s.pageBreakCount)
  const pendingChanges = useAppStore((s) => s.pendingChanges)
  const activePendingChangeId = useAppStore((s) => s.activePendingChangeId)
  const pendingEditorOperations = useAppStore((s) => s.pendingEditorOperations)

  // documentContent needs to be reactive for editor content sync
  const documentContent = useAppStore((s) => s.documentContent)
  // currentBranch shown in footer
  const currentBranch = useAppStore((s) => s.currentBranch)
  // Autocorrect settings need to be reactive for extension reconfiguration
  const autocorrectEnabled = useAppStore((s) => s.autocorrectEnabled)
  const smartQuotesEnabled = useAppStore((s) => s.smartQuotesEnabled)
  const emDashEnabled = useAppStore((s) => s.emDashEnabled)

  const settingContentRef = useRef(false)
  // True while a spellcheck suggestion is being applied — tells the update
  // handler to run a fast spellcheck re-scan instead of the slow typing cycle
  const spellCorrectionRef = useRef(false)
  const lastDocSigRef = useRef<string>('')
  const editorElRef = useRef<HTMLElement | null>(null)
  const updateRafRef = useRef<number | null>(null)

  const timers = useDebounceManager()
  const sentContent = useCachedValue<string>()
  const headingsHtml = useCachedValue<string>()
  const htmlForStats = useCachedValue<string>()

  // Keep the store's cursorContext fresh: plain text just before the cursor,
  // so the agent can continue writing from the cursor position
  const updateCursorContext = (ed: Editor) => {
    const { from } = ed.state.selection
    const start = Math.max(0, from - CURSOR_CONTEXT_CHARS)
    useAppStore.getState().setCursorContext(ed.state.doc.textBetween(start, from, '\n', ' '))
  }

  // Throttled update handler — runs at most once per animation frame (~16ms).
  // When holding a key, the OS fires 30-50+ repeat events/sec; this batches
  // them so timer creation/cancellation and pattern matching only runs once per frame.
  const handleEditorUpdate = (editor: Editor) => {
    // Clear all pending timers and reschedule
    timers.cancel('contentSync')
    timers.cancel('stats')

    // Get current editor state once for all debounced updates
    const { from, to } = editor.state.selection

    // Debounce selection updates (low priority)
    timers.schedule('selection', () => {
      useAppStore.getState().setEditorSelection({ from, to })
      updateCursorContext(editor)
    }, DEBOUNCE_SELECTION)

    // Debounce content and structural updates (medium priority)
    // Use a cheap doc signature to skip expensive getHTML() when content hasn't changed
    const docSig = `${editor.state.doc.content.size}:${editor.state.doc.childCount}`
    timers.schedule('contentSync', () => {
      // Skip expensive serialization if doc hasn't changed since last sync
      if (lastDocSigRef.current === docSig) return
      lastDocSigRef.current = docSig

      const html = editor.getHTML()
      sentContent.update(html)
      htmlForStats.update(html)
      useAppStore.getState().setDocumentContent(html)

      // Update outline headings only if content changed (cache optimization)
      if (headingsHtml.hasChanged(html)) {
        headingsHtml.update(html)
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
    }, DEBOUNCE_CONTENT_SYNC)

    // Debounce spellcheck: disable immediately via DOM (no state update = no re-render).
    // Spellcheck corrections take a fast cycle (~100ms instead of ~2.8s): Chromium
    // doesn't re-check after programmatic DOM changes, so the attribute must be
    // toggled to force a re-scan — quickly, so other underlines barely flicker.
    const quickRecheck = spellCorrectionRef.current
    const editorEl = editorElRef.current || (document.querySelector('.tiptap') as HTMLElement | null)
    if (editorEl) editorElRef.current = editorEl
    if (editorEl && editorEl.getAttribute('spellcheck') !== 'false') {
      editorEl.setAttribute('spellcheck', 'false')
    }

    timers.schedule('spellcheck', () => {
      setTimeout(() => {
        const el = editorElRef.current || (document.querySelector('.tiptap') as HTMLElement | null)
        if (el) el.setAttribute('spellcheck', 'true')
      }, quickRecheck ? 50 : DEBOUNCE_SPELLCHECK_REENABLE)
    }, quickRecheck ? 50 : DEBOUNCE_SPELLCHECK)

    // Debounce page break count updates (low priority, expensive regex)
    timers.schedule('pageBreak', () => {
      const pbCount = (htmlForStats.get()!.match(/data-page-break/g) || []).length
      useAppStore.getState().setPageBreakCount(pbCount)
    }, DEBOUNCE_PAGE_BREAK)

    // Debounce word count updates with longer delay (lowest priority)
    timers.schedule('stats', () => {
      useAppStore.getState().updateDocumentStats(htmlForStats.get() || '')
    }, DEBOUNCE_STATS)
  }

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (updateRafRef.current !== null) {
        cancelAnimationFrame(updateRafRef.current)
      }
    }
  }, [])
  const [contextMenuPos, setContextMenuPos] = React.useState<ContextMenuPos | null>(null)
  const [contextMenuText, setContextMenuText] = React.useState('')
  // Misspelled word under the last right-click + suggestions from Chromium (via main)
  const [spellContext, setSpellContext] = React.useState<{ word: string; from: number; to: number; suggestions: string[] } | null>(null)
  const spellTargetRef = useRef<{ word: string; from: number; to: number } | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')

  // Fetch app version for display
  useEffect(() => {
    window.wordapp?.window?.getVersion?.().then((v: { version: string }) => {
      if (v?.version) setCurrentVersion(v.version)
    }).catch(() => {})
  }, [])

  // Register inline edit callback
  useEffect(() => {
    useAppStore.getState().setInlineEditCallback(async (instruction: string, selection: string) => {
      const contentBefore = useAppStore.getState().documentContent
      try {
        const messages = [
          { role: 'user' as const, content: `Edit the following text according to this instruction: "${instruction}"\n\nText to edit:\n${selection}\n\nReturn ONLY the edited text, nothing else. Do not include any explanation or markdown formatting.` }
        ]
        await window.wordapp?.agent.chatStream(messages, {
          documentContent: contentBefore,
          selection,
          currentBranch,
          documentId: useAppStore.getState().getActiveDocumentId(),
          // §11: protected documents run in ephemeral mode (no persistence)
          protectedDocument: useAppStore.getState().isDocumentProtected()
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

      // Throttle: skip processing if we already have a pending frame.
      // When holding a key, the OS fires 30-50+ repeat events/sec — each one
      // would create/cancel timers and run pattern matching. Instead, batch
      // them into a single rAF (~16ms) so we only process once per frame.
      if (updateRafRef.current !== null) return
      updateRafRef.current = requestAnimationFrame(() => {
        updateRafRef.current = null
        handleEditorUpdate(editor)
      })
    },  // end onUpdate

    onSelectionUpdate: ({ editor }) => {
      // Track cursor moves that don't change the doc (plain clicks), so the
      // agent's cursor context is fresh even if the user just clicked somewhere
      const { from, to } = editor.state.selection
      timers.schedule('selection', () => {
        useAppStore.getState().setEditorSelection({ from, to })
        updateCursorContext(editor)
      }, DEBOUNCE_SELECTION)
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

  // Publish the active editor instance for FloatingToolbar and menu commands.
  useEffect(() => {
    useAppStore.getState().setEditor(editor ?? null)
    return () => { useAppStore.getState().setEditor(null) }
  }, [editor])

  // Handle pending editor operations from agent tools (queue: applied in order)
  useEffect(() => {
    if (!editor || pendingEditorOperations.length === 0) return

    const summaries: string[] = []

    for (const op of pendingEditorOperations) {
      try {
        if (op.type === 'insert' && op.content) {
          if (op.afterElement) {
            const pos = findPosAfterBlock(editor.state.doc, op.afterElement)
            if (pos === null) {
              useAppStore.getState().addToast('warning', `Element "${op.afterElement.slice(0, 30)}" not found; inserted at end`)
              editor.chain().focus('end').insertContent(op.content).run()
            } else {
              editor.chain().focus().insertContentAt(pos, op.content).run()
            }
          } else if (op.position === 'end') {
            editor.chain().focus('end').insertContent(op.content).run()
          } else if (op.position === 'start') {
            editor.chain().focus('start').insertContent(op.content).run()
          } else {
            editor.chain().focus().insertContent(op.content, { updateSelection: true }).run()
          }
          // Note: insertContent() triggers onUpdate handler, which debounces content sync
          summaries.push('Inserted content')
        } else if (op.type === 'replace' && op.search && op.replace !== undefined) {
          const ranges = findTextRangesInDoc(editor.state.doc, op.search)
          if (ranges.length === 0) {
            useAppStore.getState().addToast('warning', `No matches found for "${op.search}"`)
            continue
          }
          const targets = op.replaceAll ? ranges : ranges.slice(0, 1)
          // Apply back-to-front so earlier positions stay valid
          const chain = editor.chain().focus()
          for (const r of [...targets].reverse()) {
            if (op.replace) chain.insertContentAt(r, op.replace)
            else chain.deleteRange(r)
          }
          chain.run()
          summaries.push(`${op.replace ? 'Replaced' : 'Deleted'} ${targets.length} occurrence${targets.length !== 1 ? 's' : ''}`)
        } else if (op.type === 'format' && op.format) {
          let targets: TextRange[] = []
          if (op.search) {
            const ranges = findTextRangesInDoc(editor.state.doc, op.search)
            if (ranges.length === 0) {
              useAppStore.getState().addToast('warning', `No matches found for "${op.search}"`)
              continue
            }
            const occ = op.occurrence
            targets = !occ || occ === 0 ? ranges : (ranges[occ - 1] ? [ranges[occ - 1]] : [])
          } else {
            targets = [{ from: 0, to: editor.state.doc.content.size }]
          }
          for (const r of [...targets].reverse()) {
            const chain = op.search
              ? editor.chain().focus().setTextSelection(r)
              : editor.chain().focus().selectAll()
            if (op.format.bold) chain.setBold()
            if (op.format.italic) chain.setItalic()
            if (op.format.underline) chain.setUnderline()
            if (op.format.color) chain.setColor(op.format.color)
            if (op.format.heading) chain.setHeading({ level: Math.min(Math.max(op.format.heading, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6 })
            if (op.format.list === 'bullet') chain.toggleBulletList()
            if (op.format.list === 'ordered') chain.toggleOrderedList()
            chain.run()
          }
          summaries.push('Applied formatting')
        }
      } catch (err) {
        console.error('[EditorPanel] Failed to apply editor operation:', err)
        useAppStore.getState().addToast('error', `Failed to apply change: ${(err as Error).message}`)
      }
    }

    if (summaries.length > 0) {
      useAppStore.getState().addToast('success', summaries.length === 1 ? summaries[0] : `Applied ${summaries.length} changes`)
      // Auto-commit agent actions to VCS for rollback
      try {
        const content = editor.getHTML() || ''
        window.wordapp?.vcs.commit(`[Agent] ${summaries.join('; ').slice(0, 80)}`, content).catch(() => {})
      } catch { /* best-effort */ }
    }

    // Clear the queue after processing
    useAppStore.getState().clearPendingEditorOperations()
  }, [editor, pendingEditorOperations])

  // Handle structured TipTap operations from agent
  useEffect(() => {
    if (!editor) return

    const handleEditTiptap = (data: unknown) => {
      const tiptapData = data as { ops?: Array<Record<string, unknown>>; documentId?: string }
      if (!tiptapData.ops || !Array.isArray(tiptapData.ops)) return
      // §B/D8: refuse an edit proposed for a different document than the one
      // this editor currently holds (stale run / tab switch).
      const activeId = useAppStore.getState().getActiveDocumentId()
      if (tiptapData.documentId && activeId !== tiptapData.documentId) {
        useAppStore.getState().addToast('warning', 'Ignored a stale agent edit for a different document')
        return
      }

  
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
  }, [editor])

  // Answer main-process requests for the current document text (used by document_search)
  useEffect(() => {
    if (!editor) return

    const handleDocContentRequest = (data: unknown) => {
      const { id, format, documentId } = (data as { id?: string; format?: 'text' | 'html'; documentId?: string }) || {}
      if (!id) return
      // §B: never answer a request for a different document than the one this
      // editor holds — report it stale so main refuses the wrong content.
      const activeId = useAppStore.getState().getActiveDocumentId()
      if (documentId && activeId !== documentId) {
        window.wordapp?.agent.docContentResponse(id, '', true)
        return
      }
      const content = format === 'html'
        ? editor.getHTML()
        // One block per line so search results map to visible lines
        : editor.getText({ blockSeparator: '\n' })
      window.wordapp?.agent.docContentResponse(id, content)
    }

    const unsub = window.wordapp?.on('agent-doc-content-request', handleDocContentRequest as any) as (() => void) | undefined
    return () => {
      unsub?.()
    }
  }, [editor])

  // After 1.5s of inactivity, ask the agent for a continuation suggestion
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | null = null

    const handleUpdate = () => {
      // Clear any existing suggestion (batch: clear decoration + store in one pass)
      editor.commands.clearInlineSuggestion()
      // Only update store if there's actually a suggestion visible (avoids unnecessary re-renders)
      const currentState = useAppStore.getState()
      if (currentState.inlineSuggestion || currentState.inlineSuggestionVisible) {
        useAppStore.getState().setInlineSuggestion(null)
        useAppStore.getState().setInlineSuggestionVisible(false)
      }

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
  // Skip when content came from the editor itself (tracked via sentContent)
  useEffect(() => {
    if (editor && sentContent.hasChanged(documentContent)) {
      // Clear any pending debounced save from a previous tab
      timers.cancel('contentSync')
      settingContentRef.current = true
      sentContent.update(documentContent)
      const pos = editor.state.selection.from
      editor.commands.setContent(documentContent || '<p></p>')
      // Content came from outside the editor (file open, tab switch, template,
      // import) — count words now instead of showing 0 until the first keystroke
      useAppStore.getState().updateDocumentStats(documentContent)
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

  // Capture-phase DOM listener for Tab/Shift+Tab/Escape to handle inline suggestions.
  // Must use native DOM capture (not ProseMirror handleKeyDown) because Electron
  // intercepts Tab at the browser level before TipTap's pipeline sees it.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom

    const handleCapture = (e: KeyboardEvent) => {
      const state = inlineSuggestionKey.getState(editor.state)

      if (e.key === 'Tab') {
        // Shift+Tab: accept inline suggestion
        if (e.shiftKey && state?.suggestion) {
          e.preventDefault()
          e.stopImmediatePropagation()
          editor.commands.insertContent(state.suggestion)
          editor.commands.clearInlineSuggestion()
          return
        }
        // Plain Tab: insert a tab character in the document
        e.preventDefault()
        e.stopImmediatePropagation()
        editor.commands.insertContent('\t')
        return
      }

      if (e.key === 'Escape') {
        if (state?.suggestion) {
          e.preventDefault()
          e.stopImmediatePropagation()
          editor.commands.clearInlineSuggestion()
        }
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
      // No preventDefault: Chromium must still issue its context-menu request so
      // the main process receives the 'context-menu' event carrying spellcheck
      // suggestions for the clicked word. Electron shows no default menu, so
      // the custom menu below remains the only one.
      e.stopPropagation()
      const text = window.getSelection()?.toString() || editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        ' '
      )
      setContextMenuText(text || '')

      // Remember the word + doc range under the cursor so spellcheck
      // suggestions arriving from the main process can be applied to it
      spellTargetRef.current = null
      setSpellContext(null)
      const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (pos) {
        try {
          const $pos = editor.state.doc.resolve(pos.pos)
          const blockStart = $pos.start()
          const blockText = $pos.parent.textContent
          const offset = pos.pos - blockStart
          const isWordChar = (ch: string) => /[\w'’-]/.test(ch)
          let start = offset
          let end = offset
          while (start > 0 && isWordChar(blockText[start - 1])) start--
          while (end < blockText.length && isWordChar(blockText[end])) end++
          if (start < end) {
            spellTargetRef.current = { word: blockText.slice(start, end), from: blockStart + start, to: blockStart + end }
          }
        } catch { /* unresolvable position — no spell target */ }
      }

      setContextMenuPos({ x: e.clientX, y: e.clientY })
    }

    // Spellcheck suggestions arrive from the main process right after the click
    const unsubSpell = window.wordapp?.on('editor-spell-context', (data: { word: string; suggestions: string[] }) => {
      const target = spellTargetRef.current
      if (!target || !data?.word) return
      if (target.word.toLowerCase() === data.word.toLowerCase()) {
        setSpellContext({ ...target, suggestions: data.suggestions || [] })
        return
      }
      // Chromium's flagged range can differ from posAtCoords word expansion
      // (e.g. click landed on a word boundary) — locate the word in the block
      try {
        const $from = editor.state.doc.resolve(target.from)
        const blockStart = $from.start()
        const blockText = $from.parent.textContent
        const idx = blockText.toLowerCase().indexOf(data.word.toLowerCase())
        if (idx !== -1) {
          setSpellContext({
            word: blockText.slice(idx, idx + data.word.length),
            from: blockStart + idx,
            to: blockStart + idx + data.word.length,
            suggestions: data.suggestions || []
          })
        }
      } catch { /* stale position — ignore */ }
    })

    dom.addEventListener('contextmenu', handleContextMenu, true)
    return () => {
      dom.removeEventListener('contextmenu', handleContextMenu, true)
      unsubSpell?.()
    }
  }, [editor])

  // Apply a spellcheck suggestion: replace the flagged word in the document,
  // preserving its capitalization
  const handleApplySuggestion = useCallback((suggestion: string) => {
    const ctx = spellContext
    if (!ctx || !editor) return
    let replacement = suggestion
    if (ctx.word.length > 1 && ctx.word === ctx.word.toUpperCase()) {
      replacement = suggestion.toUpperCase()
    } else if (ctx.word[0] === ctx.word[0]?.toUpperCase()) {
      replacement = suggestion.charAt(0).toUpperCase() + suggestion.slice(1)
    }
    try {
      if (editor.state.doc.textBetween(ctx.from, ctx.to) === ctx.word) {
        // Mark as a spell correction so the update handler runs the fast
        // re-scan cycle. onUpdate reaches handleEditorUpdate via rAF, so the
        // flag must outlive one frame.
        spellCorrectionRef.current = true
        editor.chain().focus().insertContentAt({ from: ctx.from, to: ctx.to }, replacement).run()
        setTimeout(() => { spellCorrectionRef.current = false }, 50)
      }
    } catch { /* range went stale — skip replacement */ }
    setSpellContext(null)
    setContextMenuPos(null)
  }, [spellContext, editor])

  const handleAddMisspellingToDictionary = useCallback((word: string) => {
    window.wordapp?.spellcheck.addToDictionary(word).catch(() => {})
    setSpellContext(null)
    setContextMenuPos(null)
  }, [])

  // Auto-save: listen for trigger from main process
  useEffect(() => {
    const unsubscribe = window.wordapp?.on('auto-save-trigger', () => {
      const state = useAppStore.getState()
      if (state.autoSaveEnabled && state.isDirty && state.currentFilePath) {
        state.markSaving()
        window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent).then((result) => {
          throwIfIpcError(result)
          useAppStore.getState().markSaved()
          useAppStore.getState().setLastAutoSave(Date.now())
        }).catch((err) => {
          useAppStore.getState().markSaveFailed((err as Error).message || 'Auto-save failed')
        })
      }
    })
    return () => unsubscribe?.()
  }, [])

  // Menu event listeners for find
  useEffect(() => {
    const unsub1 = window.wordapp?.on('find-open', () => useAppStore.getState().setFindBarOpen(true))
    const unsub2 = window.wordapp?.on('find-replace-open', () => useAppStore.getState().setFindBarOpen(true))
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
        useAppStore.getState().resetSaveStatus()
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
    useAppStore.getState().resetSaveStatus()
    // Update the current tab to reflect the new document
    useAppStore.getState().updateDocTab(state.activeTabId, {
      title: 'Untitled',
      filePath: null,
      content: newContent,
      isDirty: false
    })
  }, [editor])

  const handleSave = useCallback(async (): Promise<boolean> => {
    const state = useAppStore.getState()
    const wasClean = !state.isDirty
    state.markSaving()
    try {
      if (state.vcsAutoCommitOnSave && state.documentContent) {
        await window.wordapp?.settings.vcsAutoCommit(`Auto-save: ${new Date().toISOString()}`, state.documentContent)
      }
      if (state.currentFilePath) {
        const result = await window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent)
        throwIfIpcError(result)
        useAppStore.getState().markSaved()
        // Sync tab title with filename
        const name = state.currentFilePath.split(/[\\/]/).pop() || state.documentTitle
        if (name !== state.documentTitle) {
          useAppStore.getState().setDocumentTitle(name)
        }
        useAppStore.getState().updateDocTab(state.activeTabId, { title: name, filePath: state.currentFilePath, isDirty: false })
        return true
      } else {
        const filePath = await window.wordapp?.file.saveDialog()
        if (filePath) {
          const result = await window.wordapp?.file.saveFile(filePath, state.documentContent)
          throwIfIpcError(result)
          const name = filePath.split(/[\\/]/).pop()
          if (!name) throw new Error(`Invalid file path: ${filePath}`)
          useAppStore.getState().setCurrentFilePath(filePath)
          useAppStore.getState().setDocumentTitle(name)
          useAppStore.getState().markSaved()
          // Update tab title to match
          const tabId = useAppStore.getState().activeTabId
          useAppStore.getState().updateDocTab(tabId, { title: name, filePath })
          return true
        } else {
          // Save dialog was cancelled — return to the prior truthful state.
          if (wasClean) {
            useAppStore.getState().resetSaveStatus()
          } else {
            useAppStore.getState().markDirty()
          }
          return false
        }
      }
    } catch (err) {
      const message = (err as Error).message || 'Unknown error'
      useAppStore.getState().markSaveFailed(message)
      useAppStore.getState().addToast('error', `Save failed: ${message}`)
      return false
    }
  }, [])

  // Ctrl+S (main-menu accelerator) → the real save path
  useEffect(() => {
    const unsubscribe = window.wordapp?.on('file-save', () => { void handleSave() })
    const onWindowSave = () => { void handleSave() }
    window.addEventListener('lexicon:save-document', onWindowSave)
    return () => {
      unsubscribe?.()
      window.removeEventListener('lexicon:save-document', onWindowSave)
    }
  }, [handleSave])

  // Main process asks us to save all dirty documents before the app closes.
  // Saving a background tab requires activating it first so the store's active
  // document (and its save path) match the tab being saved.
  useEffect(() => {
    const unsubscribe = window.wordapp?.on('app-save-before-close', async (requestId: unknown) => {
      let allSaved = true
      for (let i = 0; i < 25; i++) {
        const dirty = useAppStore.getState().docTabs.filter((t) => t.isDirty)
        if (dirty.length === 0) break
        const target = dirty[0]
        if (useAppStore.getState().activeTabId !== target.id) {
          useAppStore.getState().switchDocTab(target.id)
          await new Promise((r) => setTimeout(r, 60))
        }
        const ok = await handleSave()
        if (!ok) { allSaved = false; break }
      }
      const stillDirty = useAppStore.getState().docTabs.some((t) => t.isDirty)
      window.wordapp?.window?.reportSaveBeforeClose?.(String(requestId), allSaved && !stillDirty)
    })
    return () => unsubscribe?.()
  }, [handleSave])

  // Command palette: insert footnote at the current selection
  useEffect(() => {
    const onInsertFootnote = () => { editor?.commands.insertFootnote() }
    window.addEventListener('lexicon:insert-footnote', onInsertFootnote)
    return () => window.removeEventListener('lexicon:insert-footnote', onInsertFootnote)
  }, [editor])

  const collabCursors = useAppStore((s) => s.collabCursors)
  const splitViewOpen = useAppStore((s) => s.splitViewOpen)
  const splitViewRightTabId = useAppStore((s) => s.splitViewRightTabId)
  const docTabs = useAppStore((s) => s.docTabs)
  const setSplitViewRightTab = useAppStore((s) => s.setSplitViewRightTab)
  const focusMode = useAppStore((s) => s.focusMode)

  const pageCount = pageBreakCount + 1
  
  // Get the right pane tab content
  const rightTab = docTabs.find((t) => t.id === splitViewRightTabId)

  // Live assistant streaming into the document
  useDocumentStream(editor)

  return (
    <div className="editor-panel">
      {!focusMode && <Toolbar editor={editor} onOpen={handleOpen} onNew={handleNew} onSave={handleSave} />}
      {!focusMode && <TabBar />}
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
                    borderRadius: 0.5,
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
                  <div className="tiptap" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rightTab.content || '<p></p>') }} style={{ pointerEvents: 'none' }} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="editor-document-wrapper" style={{ margin: `${documentMarginTop}px ${documentMarginRight}px ${documentMarginBottom}px ${documentMarginLeft}px` }}>
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
        spellContext={spellContext}
        onApplySuggestion={handleApplySuggestion}
        onAddToDictionary={handleAddMisspellingToDictionary}
        onClose={() => setContextMenuPos(null)}
      />
      </div>
      {!focusMode && <div className="editor-footer">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isDirty ? <span style={{ color: 'var(--ui-warning)' }}>●</span> : ''}{documentTitle}
          {currentVersion && <span style={{ color: 'var(--ui-text-muted)', marginLeft: 8, fontSize: 12 }}>v{currentVersion}</span>}
        </span>
        <span className="editor-footer-center">
          {(() => {
            const hasStoryboard = docTabs.some(t => t.type === 'storyboard' && t.parentFilePath === (currentFilePath || 'Untitled'))
            return (
              <button
                className="footer-chip"
                data-active={hasStoryboard}
                onClick={() => openStoryboardPopup(currentFilePath)}
                title={currentFilePath ? (hasStoryboard ? 'Open storyboard' : 'Create storyboard') : 'Create storyboard for this document'}
              >
                Storyboard
              </button>
            )
          })()}
          {(() => {
            return (
              <button
                className="footer-chip"
                onClick={() => openMemoryPopup(currentFilePath)}
                title="View agent memory for this document"
              >
                Memory
              </button>
            )
          })()}
          {wordCount} words · {charCount} chars · {pageCount} page{pageCount !== 1 ? 's' : ''}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saveStatus !== 'idle' && (
            <span
              role="status"
              aria-live="polite"
              title={saveError ?? undefined}
              style={{
                color: saveStatus === 'error'
                  ? 'var(--ui-danger)'
                  : saveStatus === 'saving' || saveStatus === 'dirty'
                    ? 'var(--ui-text-secondary)'
                    : 'var(--ui-text-muted)'
              }}
            >
              {saveStatus === 'dirty' && 'Unsaved changes'}
              {saveStatus === 'saving' && 'Saving…'}
              {saveStatus === 'saved' && 'Saved locally'}
              {saveStatus === 'error' && 'Save failed'}
              {saveStatus === 'error' && (
                <button
                  onClick={handleSave}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginLeft: 6,
                    color: 'var(--ui-danger)',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Retry
                </button>
              )}
            </span>
          )}
          {saveStatus !== 'idle' && (currentFilePath || currentBranch) && (
            <span style={{ color: 'var(--ui-border-control)' }}>·</span>
          )}
          {currentFilePath && <span>{currentFilePath} · </span>}
          <span style={{ color: 'var(--accent)' }}>⎇ {currentBranch}</span>
        </span>
      </div>}
      </div>
    )
  }
