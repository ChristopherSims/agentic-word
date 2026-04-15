import React, { useEffect, type FC } from 'react'
import { Box, Paper, Typography, IconButton, Divider, Table, TableBody, TableCell, TableRow, Chip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useAppStore } from '../store/app-store'

export const DocStatsPanel: FC = () => {
  const { docStatsPanelOpen, setDocStatsPanelOpen, docStats, setDocStats, documentContent, wordCount, charCount } = useAppStore()

  useEffect(() => {
    if (docStatsPanelOpen && documentContent) {
      window.wordapp?.docStats.compute(documentContent).then((stats) => { if (stats) setDocStats(stats as typeof docStats) }).catch(() => {})
    }
  }, [docStatsPanelOpen, documentContent])

  if (!docStatsPanelOpen) return null

  const gradeColor = docStats.fleschKincaid <= 8 ? 'success' : docStats.fleschKincaid <= 12 ? 'warning' : 'error'
  const gradeLabel = docStats.fleschKincaid <= 5 ? 'Very Easy' : docStats.fleschKincaid <= 8 ? 'Easy' : docStats.fleschKincaid <= 10 ? 'Standard' : docStats.fleschKincaid <= 12 ? 'Fairly Difficult' : docStats.fleschKincaid <= 14 ? 'Difficult' : 'Very Difficult'

  const rows = [
    ['Words', wordCount], ['Characters', charCount], ['Paragraphs', docStats.paragraphCount],
    ['Sentences', docStats.sentenceCount], ['Syllables', docStats.syllableCount],
    ['Avg Sentence Length', `${docStats.avgSentenceLen} words`], ['Reading Time', `${docStats.readingTimeMin} min`]
  ]

  return (
    <Paper sx={{ width: 250, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2">Document Statistics</Typography>
        <IconButton size="small" onClick={() => setDocStatsPanelOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>
      <Box sx={{ p: 1.5, overflow: 'auto' }}>
        <Table size="small">
          <TableBody>
            {rows.map(([label, value]) => (
              <TableRow key={label} sx={{ '& td': { py: 0.3, borderBottom: 'none' } }}>
                <TableCell sx={{ color: 'text.secondary', fontSize: 11 }}>{label}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: 11 }}>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">Flesch-Kincaid Grade</Typography>
          <Box sx={{ mt: 0.5 }}>
            <Chip label={docStats.fleschKincaid} color={gradeColor} sx={{ fontSize: 18, fontWeight: 700, height: 36, minWidth: 60 }} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{gradeLabel}</Typography>
        </Box>
      </Box>
    </Paper>
  )
}
