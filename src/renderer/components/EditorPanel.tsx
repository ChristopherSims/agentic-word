import React, { useCallback, useEffect, useState, useRef } from 'react'
import DOMPurify from 'dompurify'
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
import { cleanAgentHtml } from '../utils/agent-html-cleaner'
import { type Editor } from '@tiptap/react'
import { type DocTab } from '../../shared/types'
import { getYDoc } from '../collab-client'
import { PageBreak, Autocorrect, CommentMark, InlineSuggestionGhost, inlineSuggestionKey, FontSize } from '../extensions'
import { EditorContextMenu, type ContextMenuPos } from './EditorContextMenu'
import { CollabCursorOverlay } from './CollabCursorOverlay'
import { escapeRegExp } from '../../shared/utils/string'
import { useDebounceManager } from '../hooks/useDebounceManager'
import { useCachedValue } from '../hooks/useCachedValue'

// ─── Timing Constants (ms) ───
const DEBOUNCE_SELECTION = 150
const DEBOUNCE_CONTENT_SYNC = 350
const DEBOUNCE_SPELLCHECK = 800
const DEBOUNCE_SPELLCHECK_REENABLE = 2000
const DEBOUNCE_PAGE_BREAK = 1500
const DEBOUNCE_STATS = 1500

export const EditorPanel: React.FC = () => {
  // Selective subscriptions: only fields that directly affect rendered JSX
  const documentTitle = useAppStore((s) => s.documentTitle)
  const currentFilePath = useAppStore((s) => s.currentFilePath)
  const isDirty = useAppStore((s) => s.isDirty)
  const findBarOpen = useAppStore((s) => s.findBarOpen)
  const inlineDiffOpen = useAppStore((s) => s.inlineDiffOpen)
  const trackChangesOn = useAppStore((s) => s.trackChangesOn)
  const updateAvailable = useAppStore((s) => s.updateAvailable)
  const updateVersion = useAppStore((s) => s.updateVersion)
  const updateUrl = useAppStore((s) => s.updateUrl)
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
  const pendingEditorOperation = useAppStore((s) => s.pendingEditorOperation)

  // documentContent needs to be reactive for editor content sync
  const documentContent = useAppStore((s) => s.documentContent)
  // currentBranch shown in footer
  const currentBranch = useAppStore((s) => s.currentBranch)
  // Autocorrect settings need to be reactive for extension reconfiguration
  const autocorrectEnabled = useAppStore((s) => s.autocorrectEnabled)
  const smartQuotesEnabled = useAppStore((s) => s.smartQuotesEnabled)
  const emDashEnabled = useAppStore((s) => s.emDashEnabled)

  const settingContentRef = useRef(false)
  const lastDocSigRef = useRef<string>('')
  const editorElRef = useRef<HTMLElement | null>(null)
  const updateRafRef = useRef<number | null>(null)

  const timers = useDebounceManager()
  const sentContent = useCachedValue<string>()
  const headingsHtml = useCachedValue<string>()
  const htmlForStats = useCachedValue<string>()

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

      // Mark as dirty (batched with content update to avoid extra re-render)
      if (!useAppStore.getState().isDirty) {
        useAppStore.getState().setDirty(true)
      }

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

    // Debounce spellcheck: disable immediately via DOM (no state update = no re-render)
    const editorEl = editorElRef.current || (document.querySelector('.tiptap') as HTMLElement | null)
    if (editorEl) editorElRef.current = editorEl
    if (editorEl && editorEl.getAttribute('spellcheck') !== 'false') {
      editorEl.setAttribute('spellcheck', 'false')
    }

    timers.schedule('spellcheck', () => {
      setTimeout(() => {
        const el = editorElRef.current || (document.querySelector('.tiptap') as HTMLElement | null)
        if (el) el.setAttribute('spellcheck', 'true')
      }, DEBOUNCE_SPELLCHECK_REENABLE)
    }, DEBOUNCE_SPELLCHECK)

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

          try {
            if (pendingEditorOperation.type === 'insert' && pendingEditorOperation.content) {
              const cleaned = cleanAgentHtml(pendingEditorOperation.content)
          // Insert content at specified position
          if (pendingEditorOperation.position === 'end') {
            editor.commands.focus('end')
            editor.commands.insertContent(cleaned)
        } else if (pendingEditorOperation.position === 'start') {
                  editor.commands.focus('start')
                  editor.commands.insertContent(cleaned)
                } else {
                  editor.commands.insertContent(cleaned, { updateSelection: true })
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
          // Count confirmed; replace is applied positionally below
          
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

    // Auto-commit agent actions to VCS for rollback
    try {
      const content = editor?.getHTML() || ''
      const msg = pendingEditorOperation.type === 'replace'
        ? `[Agent] Replaced "${(pendingEditorOperation.search || '').slice(0, 40)}"`
        : `[Agent] Inserted content`
      window.wordapp?.vcs.commit(msg, content).catch(() => {})
    } catch { /* best-effort */ }

    // Clear the pending operation
    useAppStore.getState().setPendingEditorOperation(null)
  }, [editor, pendingEditorOperation])

  // Handle structured TipTap operations from agent
  useEffect(() => {
    if (!editor) return

    const handleEditTiptap = (data: unknown) => {
      const tiptapData = data as { ops?: Array<Record<string, unknown>> }
      if (!tiptapData.ops || !Array.isArray(tiptapData.ops)) return

  
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
                useAppStore.getState().updateDocumentStats(result.content)
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
                  <div className="tiptap" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rightTab.content || '<p></p>') }} style={{ pointerEvents: 'none' }} />
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {updateAvailable && (
            <a
              href={updateUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Update available: v${updateVersion}`}
              style={{
                background: 'var(--accent)',
                border: '1px solid var(--accent)',
                cursor: 'pointer',
                color: 'var(--bg-primary)',
                fontSize: 11, fontWeight: 600,
                padding: '2px 10px', borderRadius: 4,
                fontFamily: 'inherit',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-hover)'
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              Update v{updateVersion}
            </a>
          )}
          {isDirty ? '● ' : ''}{documentTitle}
          {currentVersion && <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 10 }}>v{currentVersion}</span>}
        </span>
        <span className="editor-footer-center">
          {(() => {
            const hasStoryboard = docTabs.some(t => t.type === 'storyboard' && t.parentFilePath === (currentFilePath || 'Untitled'))
            return (
              <button
                onClick={() => openStoryboardPopup(currentFilePath)}
                title={currentFilePath ? (hasStoryboard ? 'Open storyboard' : 'Create storyboard') : 'Create storyboard for this document'}
                style={{
                  background: hasStoryboard ? 'var(--accent)' : 'var(--bg-surface)',
                  border: `1px solid ${hasStoryboard ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  color: hasStoryboard ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  marginRight: 8, fontSize: 11, fontWeight: 600,
                  padding: '2px 10px', borderRadius: 4,
                  fontFamily: 'inherit',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = hasStoryboard ? 'var(--accent)' : 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                Storyboard
              </button>
            )
          })()}
          {(() => {
            return (
              <button
                onClick={() => openMemoryPopup(currentFilePath)}
                title="View agent memory for this document"
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid var(--border)`,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  marginRight: 8, fontSize: 11, fontWeight: 600,
                  padding: '2px 10px', borderRadius: 4,
                  fontFamily: 'inherit',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                Memory
              </button>
            )
          })()}
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
