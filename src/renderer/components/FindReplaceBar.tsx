import React, { useState, useRef, useEffect, useCallback, type FC } from 'react'
import { type Editor } from '@tiptap/react'
import { useAppStore } from '../store/app-store'

interface FindReplaceBarProps {
  editor: Editor | null
}

export const FindReplaceBar: FC<FindReplaceBarProps> = ({ editor }) => {
  const { findBarOpen, findQuery, replaceQuery, findUseRegex, findCaseSensitive, findResults, findCurrentIndex,
    setFindBarOpen, setFindQuery, setReplaceQuery, setFindUseRegex, setFindCaseSensitive, setFindResults } = useAppStore()
  const findInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (findBarOpen) findInputRef.current?.focus()
  }, [findBarOpen])

  useEffect(() => {
    if (!findBarOpen || !findQuery) {
      setFindResults(0, 0)
      return
    }
    doSearch()
  }, [findQuery, findUseRegex, findCaseSensitive])

  const doSearch = useCallback(() => {
    if (!editor || !findQuery) { setFindResults(0, 0); return }

    const doc = editor.state.doc
    const text = doc.textContent
    let count = 0

    try {
      const flags = findCaseSensitive ? 'g' : 'gi'
      const pattern = findUseRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(pattern, flags)
      const matches = text.match(regex)
      count = matches ? matches.length : 0
    } catch {
      count = 0
    }

    setFindResults(count, count > 0 ? 1 : 0)
  }, [editor, findQuery, findUseRegex, findCaseSensitive, setFindResults])

  const handleFindNext = () => {
    if (!editor || findResults === 0) return
    const nextIdx = findCurrentIndex >= findResults ? 1 : findCurrentIndex + 1
    setFindResults(findResults, nextIdx)

    // Use browser find to select the text
    const { state } = editor
    const doc = state.doc
    const text = doc.textContent
    try {
      const flags = findCaseSensitive ? 'g' : 'gi'
      const pattern = findUseRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(pattern, flags)
      let matchIdx = 0
      let m: RegExpExecArray | null
      while ((m = regex.exec(text)) !== null) {
        matchIdx++
        if (matchIdx === nextIdx && m) {
          // Find position in the document
          const pos = findTextPosition(doc, m[0], m.index)
          if (pos !== null) {
            editor.chain().focus().setTextSelection({ from: pos, to: pos + m[0].length }).run()
          }
          break
        }
      }
    } catch { /* ignore regex errors */ }
  }

  const handleFindPrev = () => {
    if (!editor || findResults === 0) return
    const prevIdx = findCurrentIndex <= 1 ? findResults : findCurrentIndex - 1
    setFindResults(findResults, prevIdx)
  }

  const handleReplace = () => {
    if (!editor || !findQuery) return
    const { state } = editor
    const { from, to } = state.selection
    const selectedText = state.doc.textBetween(from, to)

    if (selectedText && matchesQuery(selectedText)) {
      editor.chain().focus().insertContentAt({ from, to }, replaceQuery).run()
    }
    handleFindNext()
  }

  const handleReplaceAll = () => {
    if (!editor || !findQuery) return

    const { state } = editor
    const doc = state.doc
    const html = editor.getHTML()

    try {
      const flags = findCaseSensitive ? 'g' : 'gi'
      const pattern = findUseRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(pattern, flags)

      // Replace in text nodes within the HTML — simple approach via HTML string
      const newHtml = html.replace(regex, replaceQuery)
      if (newHtml !== html) {
        editor.commands.setContent(newHtml)
        useAppStore.getState().setDocumentContent(newHtml)
      }
    } catch { /* ignore regex errors */ }

    setFindResults(0, 0)
  }

  const matchesQuery = (text: string): boolean => {
    try {
      const flags = findCaseSensitive ? '' : 'i'
      const pattern = findUseRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`^${pattern}$`, flags).test(text)
    } catch {
      return false
    }
  }

  if (!findBarOpen) return null

  return (
    <div className="find-bar">
      <div className="find-bar-row">
        <input
          ref={findInputRef}
          className="find-input"
          value={findQuery}
          onChange={(e) => setFindQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleFindNext(); if (e.key === 'Escape') setFindBarOpen(false) }}
          placeholder="Find..."
        />
        <span className="find-results">{findResults > 0 ? `${findCurrentIndex}/${findResults}` : 'No results'}</span>
        <button className="find-btn" onClick={handleFindPrev} disabled={findResults === 0} title="Previous (Shift+Enter)">↑</button>
        <button className="find-btn" onClick={handleFindNext} disabled={findResults === 0} title="Next (Enter)">↓</button>
        <button className={`find-btn${findCaseSensitive ? ' active' : ''}`} onClick={() => setFindCaseSensitive(!findCaseSensitive)} title="Case Sensitive">Aa</button>
        <button className={`find-btn${findUseRegex ? ' active' : ''}`} onClick={() => setFindUseRegex(!findUseRegex)} title="Use Regex">.*</button>
        <button className="find-btn find-btn-close" onClick={() => setFindBarOpen(false)} title="Close (Escape)">✕</button>
      </div>
      <div className="find-bar-row">
        <input
          className="find-input"
          value={replaceQuery}
          onChange={(e) => setReplaceQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setFindBarOpen(false) }}
          placeholder="Replace with..."
        />
        <button className="find-btn" onClick={handleReplace} disabled={findResults === 0} title="Replace">Replace</button>
        <button className="find-btn" onClick={handleReplaceAll} disabled={findResults === 0} title="Replace All">All</button>
      </div>
    </div>
  )
}

function findTextPosition(doc: import('@tiptap/pm/model').Node, searchText: string, textOffset: number): number | null {
  let currentOffset = 0
  let foundPos: number | null = null

  doc.descendants((node, pos) => {
    if (foundPos !== null) return false
    if (!node.isText) return true

    const nodeText = node.text || ''
    const nodeStart = currentOffset
    const nodeEnd = currentOffset + nodeText.length

    if (textOffset >= nodeStart && textOffset < nodeEnd) {
      const localOffset = textOffset - nodeStart
      foundPos = pos + localOffset
      return false
    }

    currentOffset += nodeText.length
    return true
  })

  return foundPos
}
