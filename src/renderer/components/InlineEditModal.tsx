import React, { useState, useRef, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const InlineEditModal: FC = () => {
  const { inlineEditOpen, setInlineEditOpen, inlineEditSelection, inlineEditCallback } = useAppStore()
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inlineEditOpen) {
      setInstruction('')
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [inlineEditOpen])

  if (!inlineEditOpen) return null

  const handleSubmit = async () => {
    if (!instruction.trim() || !inlineEditSelection || !inlineEditCallback) return
    setLoading(true)
    try {
      await inlineEditCallback(instruction, inlineEditSelection)
    } finally {
      setLoading(false)
      setInlineEditOpen(false)
    }
  }

  return (
    <div className="inline-edit-overlay" onClick={() => setInlineEditOpen(false)}>
      <div className="inline-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inline-edit-header">
          <span style={{ fontSize: 12, fontWeight: 600 }}>Edit Selection</span>
          <button className="toolbar-btn" style={{ width: 20, height: 20, fontSize: 10 }} onClick={() => setInlineEditOpen(false)}>✕</button>
        </div>
        <div className="inline-edit-selection" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          &ldquo;{inlineEditSelection.slice(0, 120)}{inlineEditSelection.length > 120 ? '...' : ''}&rdquo;
        </div>
        <input
          ref={inputRef}
          className="chat-input"
          style={{ width: '100%', fontSize: 12 }}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Instruction, e.g. &quot;make this more formal&quot;"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          disabled={loading}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setInlineEditOpen(false)} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={handleSubmit} disabled={loading || !instruction.trim()}>
            {loading ? 'Editing...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
