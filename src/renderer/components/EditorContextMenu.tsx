import React, { type FC, useState, useCallback, useEffect, useRef } from 'react'
import {
  Paper,
  MenuList,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Typography,
  Collapse
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import CommentIcon from '@mui/icons-material/Comment'
import TranslateIcon from '@mui/icons-material/Translate'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import type { Editor } from '@tiptap/react'
import { useHoverDismiss } from '../hooks/useHoverDismiss'

export interface ContextMenuPos {
  x: number
  y: number
}

interface EditorContextMenuProps {
  editor: Editor
  position: ContextMenuPos | null
  selectedText: string
  onClose: () => void
}

const LANGUAGES = [
  'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
  'Greek', 'Polish', 'Czech', 'Romanian', 'Hungarian',
  'Turkish', 'Russian', 'Arabic', 'Chinese', 'Japanese',
  'Korean', 'Scottish Gaelic', 'English'
]

export const EditorContextMenu: FC<EditorContextMenuProps> = ({
  editor,
  position,
  selectedText,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showLanguages, setShowLanguages] = useState(false)
  const { onMouseEnter: hoverEnter, onMouseLeave: hoverLeave } = useHoverDismiss(onClose, 1000)

  // Close on click outside
  useEffect(() => {
    if (!position) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [position, onClose])

  // Close on Escape
  useEffect(() => {
    if (!position) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [position, onClose])

  const handleCopy = useCallback(() => {
    if (selectedText) {
      navigator.clipboard.writeText(selectedText).catch(() => {
        document.execCommand('copy')
      })
    }
    onClose()
  }, [selectedText, onClose])

  const handleCut = useCallback(() => {
    if (selectedText) {
      navigator.clipboard.writeText(selectedText).catch(() => {
        document.execCommand('cut')
      })
      editor.commands.deleteSelection()
    }
    onClose()
  }, [selectedText, editor, onClose])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        editor.chain().focus().insertContent(text).run()
      }
    } catch {
      document.execCommand('paste')
    }
    onClose()
  }, [editor, onClose])

  const handleSelectAll = useCallback(() => {
    editor.commands.selectAll()
    onClose()
  }, [editor, onClose])

  const handleAddComment = useCallback(() => {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, ' ')
    if (text) {
      const { useAppStore } = require('../store/app-store')
      useAppStore.getState().setCommentSelection(from, to, text)
      useAppStore.getState().setCommentInputOpen(true)
      useAppStore.getState().setCommentPanelOpen(true)
    }
    onClose()
  }, [editor, onClose])

  const handleSynonyms = useCallback(async () => {
    if (!selectedText) return
    try {
      const results = await window.wordapp?.ai.paraphrase(selectedText, 3)
      if (Array.isArray(results) && results.length > 0) {
        editor.chain().focus().deleteSelection().insertContent(results[0]).run()
      }
    } catch {
      // Silent fail
    }
    onClose()
  }, [selectedText, editor, onClose])

  const handleTranslate = useCallback(async (targetLang: string) => {
    if (!selectedText) return
    try {
      const result = await window.wordapp?.ai.translate(selectedText, targetLang)
      if (result && typeof result === 'string') {
        // Overwrite the highlighted text with the translation
        editor.chain().focus().deleteSelection().insertContent(result).run()
      }
    } catch {
      // Silent fail
    }
    onClose()
  }, [selectedText, editor, onClose])

  if (!position) return null

  return (
    <Paper
      ref={menuRef}
      elevation={8}
      onMouseEnter={hoverEnter}
      onMouseLeave={hoverLeave}
      sx={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 99999,
        minWidth: 220,
        maxHeight: 480,
        overflowY: 'auto',
        py: 0.5,
        backgroundColor: 'var(--color-surface, #1e1e2e)',
        border: '1px solid var(--color-border, #45475a)',
        borderRadius: 1
      }}
    >
      <MenuList dense>
        <MenuItem onClick={handleCopy} disabled={!selectedText} sx={{ fontSize: 12, py: 0.75 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          <ListItemText sx={{ fontSize: 12 }}>Copy</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            Ctrl+C
          </Typography>
        </MenuItem>

        <MenuItem onClick={handleCut} disabled={!selectedText} sx={{ fontSize: 12, py: 0.75 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <ContentCutIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          <ListItemText sx={{ fontSize: 12 }}>Cut</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            Ctrl+X
          </Typography>
        </MenuItem>

        <MenuItem onClick={handlePaste} sx={{ fontSize: 12, py: 0.75 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <ContentPasteIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          <ListItemText sx={{ fontSize: 12 }}>Paste</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            Ctrl+V
          </Typography>
        </MenuItem>

        <MenuItem onClick={handleSelectAll} sx={{ fontSize: 12, py: 0.75 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <SelectAllIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          <ListItemText sx={{ fontSize: 12 }}>Select All</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            Ctrl+A
          </Typography>
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleAddComment} disabled={!selectedText} sx={{ fontSize: 12, py: 0.75 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <CommentIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          <ListItemText sx={{ fontSize: 12 }}>Add Comment</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
            Ctrl+Shift+M
          </Typography>
        </MenuItem>

        <MenuItem onClick={handleSynonyms} disabled={!selectedText} sx={{ fontSize: 12, py: 0.75 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <FindReplaceIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          <ListItemText sx={{ fontSize: 12 }}>Synonyms (AI)</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => setShowLanguages(!showLanguages)}
          disabled={!selectedText}
          sx={{ fontSize: 12, py: 0.75 }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <TranslateIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          <ListItemText sx={{ fontSize: 12 }}>Translate (AI)</ListItemText>
          {showLanguages ? (
            <ExpandLessIcon sx={{ fontSize: 14 }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 14 }} />
          )}
        </MenuItem>

        <Collapse in={showLanguages} timeout="auto" unmountOnExit>
          <MenuList dense sx={{ pl: 2 }}>
            {LANGUAGES.map((lang) => (
              <MenuItem
                key={lang}
                onClick={() => handleTranslate(lang)}
                sx={{ fontSize: 11, py: 0.5 }}
              >
                {lang}
              </MenuItem>
            ))}
          </MenuList>
        </Collapse>
      </MenuList>
    </Paper>
  )
}
