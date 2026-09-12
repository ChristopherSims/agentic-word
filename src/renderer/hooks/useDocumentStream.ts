/**
 * useDocumentStream
 *
 * Streams the assistant's in-progress response into the TipTap document safely.
 *
 * The model emits Markdown/plain text (and occasionally HTML), so the whole
 * accumulated buffer is converted to HTML and sanitized on each throttled tick
 * and written into a single replaceable document range. Because the entire
 * buffer is re-normalized every time, a chunk boundary can never split a tag or
 * leave the editor holding partial markup.
 *
 * The scheduler is a true throttle (not a debounce): a render is guaranteed to
 * run at least every THROTTLE_MS while tokens keep arriving, so the document
 * fills in live instead of only when the stream ends.
 */

import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { DOMParser as PMDOMParser, Slice } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import DOMPurify from 'dompurify'
import { useAppStore } from '../store/app-store'
import { normalizeAgentContent, trimIncompleteTrailingTag } from '../utils/agent-content'

const THROTTLE_MS = 80

interface StreamRange {
  from: number
  to: number
}

export function useDocumentStream(editor: Editor | null): void {
  const rangeRef = useRef<StreamRange | null>(null)
  const applyingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestContentRef = useRef('')
  const seqRef = useRef(0)

  useEffect(() => {
    if (!editor) return

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const applyHtml = (html: string) => {
      const range = rangeRef.current
      if (!range) return
      const dom = new window.DOMParser().parseFromString(html || '<p></p>', 'text/html')
      const parsed = PMDOMParser.fromSchema(editor.schema).parse(dom.body)
      const slice = new Slice(parsed.content, 0, 0)
      const tr = editor.state.tr.replace(range.from, range.to, slice)
      const newTo = tr.mapping.map(range.to, -1)
      applyingRef.current = true
      editor.view.dispatch(tr)
      applyingRef.current = false
      rangeRef.current = { from: range.from, to: newTo }
    }

    /** Convert `content` and, unless a newer render superseded it, apply it. */
    const convertAndApply = async (content: string, final: boolean, seq: number) => {
      const source = final ? content : trimIncompleteTrailingTag(content)
      let html = ''
      try {
        html = await normalizeAgentContent(
          source,
          (markdown) => window.wordapp?.markdown.toHtml(markdown) ?? Promise.resolve('')
        )
      } catch {
        html = ''
      }
      if (seq !== seqRef.current) return // superseded by a newer render
      applyHtml(DOMPurify.sanitize(html))
    }

    const scheduleRender = () => {
      // A render is already pending and will pick up the latest buffer, so no
      // need to reset the timer (resetting is what starved the old version).
      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        const seq = ++seqRef.current
        void convertAndApply(latestContentRef.current, false, seq)
      }, THROTTLE_MS)
    }

    const finalize = () => {
      clearTimer()
      const seq = ++seqRef.current
      void convertAndApply(latestContentRef.current, true, seq).then(() => {
        if (seq !== seqRef.current) return
        rangeRef.current = null
        useAppStore.getState().resetDocumentStream()
      })
    }

    const handleTransaction = ({ transaction }: { transaction: Transaction }) => {
      const range = rangeRef.current
      if (!range || applyingRef.current) return
      // Keep the tracked range aligned with edits made above/before the stream.
      range.from = transaction.mapping.map(range.from, 1)
      range.to = transaction.mapping.map(range.to, -1)
    }

    editor.on('transaction', handleTransaction)

    const unsubActive = useAppStore.subscribe(
      (s) => s.documentStreamActive,
      (active) => {
        if (active) {
          const doc = editor.state.doc
          const position = useAppStore.getState().documentStreamPosition
          let from = editor.state.selection.to
          if (position === 'start') from = 0
          else if (position === 'end') from = doc.content.size
          if (from < 0) from = 0
          if (from > doc.content.size) from = doc.content.size
          rangeRef.current = { from, to: from }
          latestContentRef.current = ''
        } else if (rangeRef.current) {
          finalize()
        }
      }
    )

    const unsubContent = useAppStore.subscribe(
      (s) => s.documentStreamContent,
      (content) => {
        if (!rangeRef.current) return
        latestContentRef.current = content
        scheduleRender()
      }
    )

    return () => {
      editor.off('transaction', handleTransaction)
      unsubActive()
      unsubContent()
      clearTimer()
    }
  }, [editor])
}

export default useDocumentStream
