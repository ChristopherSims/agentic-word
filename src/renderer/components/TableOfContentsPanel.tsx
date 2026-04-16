import React, { useEffect, type FC } from 'react'
import { Box, Paper, Typography, IconButton, List, ListItemButton, ListItemText, Chip, Button } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useAppStore } from '../store/app-store'

export const TableOfContentsPanel: FC = () => {
  const { tocOpen, outlineHeadings, setTocOpen } = useAppStore()

  if (!tocOpen) return null

  // Number headings: H1 = 1, 2; H2 = 1.1, 1.2; H3 = 1.1.1, etc.
  const numberedHeadings = (() => {
    const counters = [0, 0, 0]
    return outlineHeadings.map((h) => {
      const level = h.level - 1 // 0-indexed
      counters[level]++
      // Reset sub-counters
      if (level < 2) counters[level + 1] = 0
      if (level < 1) counters[level + 2] = 0

      let num = ''
      if (level === 0) num = `${counters[0]}`
      else if (level === 1) num = `${counters[0]}.${counters[1]}`
      else num = `${counters[0]}.${counters[1]}.${counters[2]}`
      return { ...h, number: num }
    })
  })()

  const handleClick = (position: number) => {
    const editor = document.querySelector('.tiptap') as HTMLElement | null
    if (!editor) return
    const allHeadings = editor.querySelectorAll('h1, h2, h3')
    for (const h of allHeadings) {
      const el = h as HTMLElement
      const heading = outlineHeadings.find((oh) => oh.position === position)
      if (heading && el.textContent?.trim() === heading.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
    }
  }

  // Generate a TOC that can be inserted into the document
  const generateTocHtml = () => {
    const lines = numberedHeadings.map((h) => {
      const indent = (h.level - 1) * 20
      return `<p style="margin-left:${indent}px; font-size:14px;"><a href="#" onclick="return false">${h.number} ${h.text}</a></p>`
    })
    return `<div class="table-of-contents" style="margin-bottom:1em; padding:0.5em; border:1px solid #ccc; border-radius:4px;"><h3 style="margin:0 0 0.5em 0;">Table of Contents</h3>${lines.join('')}</div>`
  }

  return (
    <Paper sx={{ width: 260, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2">Table of Contents</Typography>
        <IconButton size="small" onClick={() => setTocOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {numberedHeadings.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>
            Add headings to generate a table of contents.
          </Typography>
        ) : (
          <List dense sx={{ py: 0 }}>
            {numberedHeadings.map((h, i) => (
              <ListItemButton key={i} onClick={() => handleClick(h.position)} sx={{ pl: (h.level - 1) * 2 + 1.5 }}>
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600, mr: 1, color: 'primary.main', minWidth: 28 }}>{h.number}</Typography>
                <ListItemText primary={h.text} primaryTypographyProps={{ fontSize: 11, noWrap: true }} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Paper>
  )
}
