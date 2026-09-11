import React, { useEffect, useState, type FC } from 'react'
import { Box, Paper, Typography, IconButton, Button, Chip, Tooltip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useAppStore } from '../store/app-store'

// Word-level diff utility
function wordDiff(oldText: string, newText: string): Array<{ type: 'same' | 'add' | 'delete'; text: string }> {
  const oldWords = oldText.split(/(\s+)/)
  const newWords = newText.split(/(\s+)/)
  const result: Array<{ type: 'same' | 'add' | 'delete'; text: string }> = []

  // Simple LCS-based diff
  const m = oldWords.length
  const n = newWords.length

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldWords[i] === newWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  // Backtrack
  let i = 0, j = 0
  while (i < m && j < n) {
    if (oldWords[i] === newWords[j]) {
      result.push({ type: 'same', text: oldWords[i] })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'delete', text: oldWords[i] })
      i++
    } else {
      result.push({ type: 'add', text: newWords[j] })
      j++
    }
  }
  while (i < m) { result.push({ type: 'delete', text: oldWords[i++] }) }
  while (j < n) { result.push({ type: 'add', text: newWords[j++] }) }

  return result
}

// Escape text before injecting into the diff markup.
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export const InlineDiffOverlay: FC = () => {
  const { inlineDiffOpen, inlineDiffFromCommitId, setInlineDiffOpen, setInlineDiffFromCommitId, documentContent } = useAppStore()
  const [oldContent, setOldContent] = useState<string>('')
  const [diffHtml, setDiffHtml] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!inlineDiffOpen || !inlineDiffFromCommitId) return
    setLoading(true)
    // Fetch old content from VCS
    window.wordapp?.vcs.diff(inlineDiffFromCommitId).then((data) => {
      if (data) {
        const old = data.fromContent ?? ''
        setOldContent(old)
        // Compute word-level diff between old HTML and current HTML
        // Strip tags for diff, then reconstruct
        const oldText = old.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
        const newText = documentContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
        const diff = wordDiff(oldText, newText)
        const html = diff.map((d) => {
          const text = escapeHtml(d.text)
          if (d.type === 'same') return `<span>${text}</span>`
          if (d.type === 'delete') return `<del class="diff-removed" aria-label="Removed"><span aria-hidden="true">− </span>${text}</del>`
          return `<ins class="diff-added" aria-label="Added"><span aria-hidden="true">+ </span>${text}</ins>`
        }).join('')
        setDiffHtml(html)
      }
      setLoading(false)
    }).catch((err) => {
      setLoading(false)
      useAppStore.getState().addToast('error', `Failed to load diff: ${(err as Error).message}`)
    })
  }, [inlineDiffOpen, inlineDiffFromCommitId, documentContent])

  if (!inlineDiffOpen) return null

  return (
    <Paper sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Tooltip title="Back to editor">
          <IconButton size="small" onClick={() => { setInlineDiffOpen(false); setInlineDiffFromCommitId(null) }}>
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>Inline Diff</Typography>
        {inlineDiffFromCommitId && <Chip label={inlineDiffFromCommitId.slice(0, 7)} size="small" variant="outlined" sx={{ fontSize: 12, height: 20, fontFamily: 'monospace' }} />}
        <Chip label="− Deleted" size="small" sx={{ fontSize: 12, height: 20, bgcolor: 'color-mix(in oklab, var(--ui-danger) 22%, transparent)', color: 'var(--ui-danger)' }} />
        <Chip label="+ Added" size="small" sx={{ fontSize: 12, height: 20, bgcolor: 'color-mix(in oklab, var(--ui-success) 22%, transparent)', color: 'var(--ui-success)' }} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => { setInlineDiffOpen(false); setInlineDiffFromCommitId(null) }}>Close</Button>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: 'background.default', lineHeight: 1.8 }}>
        {loading ? (
          <Typography variant="caption" color="text.secondary">Loading diff...</Typography>
        ) : (
          <div style={{ fontSize: 14, fontFamily: 'inherit' }} dangerouslySetInnerHTML={{ __html: diffHtml || '<p style="color:var(--ui-text-muted)">No differences found.</p>' }} />
        )}
      </Box>
    </Paper>
  )
}
