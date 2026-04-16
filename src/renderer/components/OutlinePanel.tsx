import React, { type FC } from 'react'
import { Box, Paper, Typography, IconButton, List, ListItemButton, ListItemText, Chip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useAppStore } from '../store/app-store'
import { useHeadingNavigation } from '../hooks/useHeadingNavigation'

export const OutlinePanel: FC = () => {
  const { outlineOpen, outlineHeadings, setOutlineOpen } = useAppStore()
  const { navigateToHeading } = useHeadingNavigation()

  if (!outlineOpen) return null

  const handleClick = (position: number) => {
    navigateToHeading(position, outlineHeadings)
  }

  return (
    <Paper sx={{ width: 220, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2">Outline</Typography>
        <IconButton size="small" onClick={() => setOutlineOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>
      <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {outlineHeadings.length === 0 ? (
          <ListItemButton disabled><ListItemText primary="No headings found" primaryTypographyProps={{ fontSize: 11, color: 'text.secondary' }} /></ListItemButton>
        ) : (
          outlineHeadings.map((h, i) => (
            <ListItemButton key={i} onClick={() => handleClick(h.position)} sx={{ pl: (h.level - 1) * 2 + 1.5 }}>
              <Chip label={`H${h.level}`} size="small" color="primary" variant="outlined" sx={{ fontSize: 9, height: 16, mr: 1, minWidth: 28 }} />
              <ListItemText primary={h.text} primaryTypographyProps={{ fontSize: 11, noWrap: true }} />
            </ListItemButton>
          ))
        )}
      </List>
    </Paper>
  )
}
