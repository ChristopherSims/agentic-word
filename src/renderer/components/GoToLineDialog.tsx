import React, { useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Box, Typography, Alert } from '@mui/material'
import { useAppStore } from '../store/app-store'

export const GoToLineDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { documentContent, setGoToLineNumber, setGoToLineDialogOpen, goToLineNumber } = useAppStore()
  const [input, setInput] = useState('')

  const totalLines = documentContent.split('\n').length

  useEffect(() => {
    if (open) {
      setInput(goToLineNumber.toString())
    }
  }, [open, goToLineNumber])

  const handleGo = () => {
    const lineNum = parseInt(input, 10)
    if (!isNaN(lineNum) && lineNum > 0 && lineNum <= totalLines) {
      setGoToLineNumber(lineNum)

      // Scroll to line
      const lines = documentContent.split('\n')
      let charOffset = 0
      for (let i = 0; i < lineNum - 1; i++) {
        charOffset += lines[i].length + 1 // +1 for newline
      }

      const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
      if (editor) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.setStart(editor, 0)
        range.collapse(true)
        selection?.removeAllRanges()
        selection?.addRange(range)
        editor.focus()
      }

      setGoToLineDialogOpen(false)
      onClose()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGo()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const isValid = !isNaN(parseInt(input, 10)) && parseInt(input, 10) > 0 && parseInt(input, 10) <= totalLines

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Go to Line</DialogTitle>
      <DialogContent sx={{ minHeight: '150px' }}>
        <Box sx={{ marginTop: 2 }}>
          <TextField
            autoFocus
            fullWidth
            label="Line number"
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            inputProps={{ min: 1, max: totalLines }}
            helperText={`Enter a line number between 1 and ${totalLines}`}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                '& fieldset': { borderColor: 'var(--border)' }
              }
            }}
          />

          {!isValid && input && <Alert severity="error" sx={{ marginTop: 1 }}>
            Line must be between 1 and {totalLines}
          </Alert>}

          <Typography variant="caption" sx={{ marginTop: 2, display: 'block', color: 'var(--text-muted)' }}>
            Press Enter to go, Escape to cancel
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleGo} disabled={!isValid} variant="contained">
          Go to Line
        </Button>
      </DialogActions>
    </Dialog>
  )
}
