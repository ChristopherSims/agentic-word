import React, { useState, useEffect, useRef, type FC } from 'react'
import { Box, Paper, IconButton, Tooltip, Divider, ToggleButtonGroup, ToggleButton, Grow } from '@mui/material'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import { useAppStore } from '../store/app-store'

const TOOLBAR_WIDTH = 220
const TOOLBAR_HEIGHT = 44

export const FloatingToolbar: FC = () => {
  const editor = useAppStore((state) => state.editor)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [visible, setVisible] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return

    // P1-P4: requestAnimationFrame throttle for selectionchange/scroll/resize
    let rafId: number | null = null
    const updatePosition = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const selection = window.getSelection()
        if (!selection || selection.toString().length === 0) {
          setVisible(false)
          return
        }

        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()

        // Clamp to viewport
        let x = rect.left + rect.width / 2 - TOOLBAR_WIDTH / 2
        let y = rect.top - TOOLBAR_HEIGHT - 8

        // Clamp horizontal
        if (x < 8) x = 8
        if (x + TOOLBAR_WIDTH > window.innerWidth - 8) x = window.innerWidth - TOOLBAR_WIDTH - 8

        // Clamp vertical — if too close to top, show below selection instead
        if (y < 8) y = rect.bottom + 8

        setPosition({ x, y })
        setVisible(true)
      })
    }

    document.addEventListener('selectionchange', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      document.removeEventListener('selectionchange', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [editor])

  const selectedText = window.getSelection()?.toString() || ''

  return (
    <Grow in={visible && !!position} timeout={150}>
      <Paper
        ref={toolbarRef}
        sx={{
          position: 'fixed',
          left: position ? `${position.x}px` : '0px',
          top: position ? `${position.y}px` : '0px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          p: 0.5,
          background: 'linear-gradient(135deg, rgba(24, 24, 37, 0.98), rgba(18, 18, 28, 0.98))',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(88, 91, 112, 0.6)',
          borderRadius: 1,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          visibility: visible && position ? 'visible' : 'hidden',
        }}
      >
        <ToggleButtonGroup size="small" sx={{ '& .MuiToggleButton-root': { px: 0.5, py: 0.25, border: 'none' } }}>
          <ToggleButton value="bold" selected={editor?.isActive('bold') || false} onChange={() => editor?.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
            <FormatBoldIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="italic" selected={editor?.isActive('italic') || false} onChange={() => editor?.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
            <FormatItalicIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="underline" selected={editor?.isActive('underline') || false} onChange={() => editor?.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
            <FormatUnderlinedIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="strike" selected={editor?.isActive('strike') || false} onChange={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough">
            <StrikethroughSIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem sx={{ opacity: 0.3, height: '70%' }} />

        <Tooltip title="Copy">
          <IconButton size="small" onClick={() => { navigator.clipboard.writeText(selectedText); useAppStore.getState().addToast('success', 'Copied to clipboard') }} sx={{ p: 0.25 }}>
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Cut">
          <IconButton size="small" onClick={() => { navigator.clipboard.writeText(selectedText); editor?.chain().focus().deleteSelection().run(); useAppStore.getState().addToast('success', 'Cut to clipboard') }} sx={{ p: 0.25 }}>
            <ContentCutIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Paper>
    </Grow>
  )
}
