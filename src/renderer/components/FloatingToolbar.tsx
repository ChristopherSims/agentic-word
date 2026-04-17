import React, { useState, useEffect, type FC } from 'react'
import { Box, Paper, IconButton, Tooltip, Divider, ToggleButtonGroup, ToggleButton } from '@mui/material'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import { useAppStore } from '../store/app-store'

export const FloatingToolbar: FC = () => {
  const editor = useAppStore((state) => state.editor)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!editor) return

    const updatePosition = () => {
      const selection = window.getSelection()
      if (!selection || selection.toString().length === 0) {
        setVisible(false)
        return
      }

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      // Position toolbar above selected text with slight offset
      setPosition({
        x: rect.left + rect.width / 2 - 120, // Center toolbar
        y: rect.top - 60 // Above selection
      })
      setVisible(true)
    }

    // Listen for selection changes
    document.addEventListener('selectionchange', updatePosition)
    window.addEventListener('scroll', updatePosition)
    window.addEventListener('resize', updatePosition)

    return () => {
      document.removeEventListener('selectionchange', updatePosition)
      window.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [editor])

  if (!visible || !position) return null

  const selectedText = window.getSelection()?.toString() || ''

  return (
    <Paper
      sx={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
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
        animation: 'fadeIn 150ms ease-out',
        '@keyframes fadeIn': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' }
        }
      }}
    >
      {/* Formatting buttons */}
      <ToggleButtonGroup size="small" sx={{ '& .MuiToggleButton-root': { px: 0.5, py: 0.25, border: 'none' } }}>
        <ToggleButton
          value="bold"
          selected={editor?.isActive('bold') || false}
          onChange={() => editor?.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <FormatBoldIcon sx={{ fontSize: 16 }} />
        </ToggleButton>
        <ToggleButton
          value="italic"
          selected={editor?.isActive('italic') || false}
          onChange={() => editor?.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <FormatItalicIcon sx={{ fontSize: 16 }} />
        </ToggleButton>
        <ToggleButton
          value="underline"
          selected={editor?.isActive('underline') || false}
          onChange={() => editor?.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <FormatUnderlinedIcon sx={{ fontSize: 16 }} />
        </ToggleButton>
        <ToggleButton
          value="strike"
          selected={editor?.isActive('strike') || false}
          onChange={() => editor?.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <StrikethroughSIcon sx={{ fontSize: 16 }} />
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem sx={{ opacity: 0.3, height: '70%' }} />

      {/* Copy/Cut buttons */}
      <Tooltip title="Copy">
        <IconButton
          size="small"
          onClick={() => {
            navigator.clipboard.writeText(selectedText)
            useAppStore.getState().addToast('success', 'Copied to clipboard')
          }}
          sx={{ p: 0.25 }}
        >
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Cut">
        <IconButton
          size="small"
          onClick={() => {
            navigator.clipboard.writeText(selectedText)
            editor?.chain().focus().deleteSelection().run()
            useAppStore.getState().addToast('success', 'Cut to clipboard')
          }}
          sx={{ p: 0.25 }}
        >
          <ContentCutIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Paper>
  )
}
