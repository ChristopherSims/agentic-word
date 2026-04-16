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
          if (d.type === 'same') return `<span>${d.text}</span>`
          if (d.type === 'delete') return `<span style="background:rgba(248,81,73,0.25);text-decoration:line-through;color:#f85149;">${d.text}</span>`
          return `<span style="background:rgba(63,185,80,0.25);color:#3fb950;">${d.text}</span>`
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
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Tooltip title="Back to editor">
          <IconButton size="small" onClick={() => { setInlineDiffOpen(false); setInlineDiffFromCommitId(null) }}>
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" fontWeight={600}>Inline Diff</Typography>
        {inlineDiffFromCommitId && <Chip label={inlineDiffFromCommitId.slice(0, 7)} size="small" variant="outlined" sx={{ fontSize: 9, height: 16, fontFamily: 'monospace' }} />}
        <Chip label="Deleted" size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'rgba(248,81,73,0.25)', color: '#f85149' }} />
        <Chip label="Added" size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'rgba(63,185,80,0.25)', color: '#3fb950' }} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => { setInlineDiffOpen(false); setInlineDiffFromCommitId(null) }}>Close</Button>
      </Box>

      {/* Diff content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: 'background.default', lineHeight: 1.8 }}>
        {loading ? (
          <Typography variant="caption" color="text.secondary">Loading diff...</Typography>
        ) : (
          <div style={{ fontSize: 14, fontFamily: 'inherit' }} dangerouslySetInnerHTML={{ __html: diffHtml || '<p style="color:#999">No differences found.</p>' }} />
        )}
      </Box>
    </Paper>
  )
}
