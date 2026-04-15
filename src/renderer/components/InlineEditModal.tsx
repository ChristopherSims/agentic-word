import React, { useState, useRef, useEffect, type FC } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography } from '@mui/material'
import { useAppStore } from '../store/app-store'

export const InlineEditModal: FC = () => {
  const { inlineEditOpen, setInlineEditOpen, inlineEditSelection, inlineEditCallback } = useAppStore()
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inlineEditOpen) { setInstruction(''); setLoading(false); setTimeout(() => inputRef.current?.focus(), 100) }
  }, [inlineEditOpen])

  const handleSubmit = async () => {
    if (!instruction.trim() || !inlineEditSelection || !inlineEditCallback) return
    setLoading(true)
    try { await inlineEditCallback(instruction, inlineEditSelection) } finally { setLoading(false); setInlineEditOpen(false) }
  }

  return (
    <Dialog open={inlineEditOpen} onClose={() => setInlineEditOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Selection</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, maxHeight: 60, overflow: 'hidden', fontStyle: 'italic' }}>
          &ldquo;{inlineEditSelection.slice(0, 120)}{inlineEditSelection.length > 120 ? '...' : ''}&rdquo;
        </Typography>
        <TextField
          inputRef={inputRef}
          fullWidth
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          placeholder='Instruction, e.g. "make this more formal"'
          disabled={loading}
          size="small"
        />
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => setInlineEditOpen(false)} disabled={loading}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSubmit} disabled={loading || !instruction.trim()}>{loading ? 'Editing...' : 'Apply'}</Button>
      </DialogActions>
    </Dialog>
  )
}
