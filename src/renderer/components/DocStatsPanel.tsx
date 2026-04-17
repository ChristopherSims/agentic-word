import React, { type FC } from 'react'
import { Box, Paper, Typography, IconButton, Divider, Table, TableBody, TableCell, TableRow, Chip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useAppStore } from '../store/app-store'
import { getReadabilityLabel } from '../utils/text-stats'

export const DocStatsPanel: FC = () => {
  const { docStatsPanelOpen, setDocStatsPanelOpen, textStats } = useAppStore()

  if (!docStatsPanelOpen) return null

  const gradeColor = textStats.readabilityScore <= 8 ? 'success' : textStats.readabilityScore <= 12 ? 'warning' : 'error'
  const gradeLabel = getReadabilityLabel(textStats.readabilityScore)

  const rows = [
    ['Words', textStats.words],
    ['Characters', textStats.characters],
    ['Characters (no spaces)', textStats.charactersWithoutSpaces],
    ['Paragraphs', textStats.paragraphs],
    ['Sentences', textStats.sentences],
    ['Avg Word Length', `${textStats.averageWordLength.toFixed(1)} chars`],
    ['Reading Time', `${textStats.readingTimeMinutes}m ${textStats.readingTimeSeconds}s`]
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
            <Chip label={textStats.readabilityScore.toFixed(1)} color={gradeColor} sx={{ fontSize: 18, fontWeight: 700, height: 36, minWidth: 60 }} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{gradeLabel}</Typography>
        </Box>
      </Box>
    </Paper>
  )
}
