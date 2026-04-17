import React, { type FC } from 'react'
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Chip, TextField, RadioGroup, FormControlLabel, Radio, Divider } from '@mui/material'
import { useAppStore } from '../store/app-store'
import type { ConflictResolution } from '../../shared/types'

export const ConflictResolutionPanel: FC = () => {
  const { conflictResolutionOpen, setConflictResolutionOpen, pendingConflicts, resolvePendingConflict, removePendingConflict } = useAppStore()
  const [selectedResolution, setSelectedResolution] = React.useState<'theirs' | 'ours' | 'custom'>('ours')
  const [customText, setCustomText] = React.useState('')
  const [activeConflictId, setActiveConflictId] = React.useState<string | null>(null)

  const activeConflict = activeConflictId ? pendingConflicts.find((c) => c.id === activeConflictId) : pendingConflicts[0]

  const handleResolve = () => {
    if (!activeConflict) return
    resolvePendingConflict(activeConflict.id, selectedResolution, selectedResolution === 'custom' ? customText : undefined)
    
    const nextUnresolved = pendingConflicts.find((c) => !c.resolved && c.id !== activeConflict.id)
    if (nextUnresolved) {
      setActiveConflictId(nextUnresolved.id)
      setSelectedResolution('ours')
      setCustomText('')
    } else {
      setConflictResolutionOpen(false)
    }
  }

  const handleSkip = () => {
    const nextUnresolved = pendingConflicts.find((c) => !c.resolved && c.id !== activeConflict?.id)
    if (nextUnresolved) {
      setActiveConflictId(nextUnresolved.id)
      setSelectedResolution('ours')
      setCustomText('')
    } else {
      setConflictResolutionOpen(false)
    }
  }

  const unresolved = pendingConflicts.filter((c) => !c.resolved)
  const hasConflicts = unresolved.length > 0

  return (
    <Dialog open={conflictResolutionOpen && hasConflicts} onClose={() => setConflictResolutionOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>
        Resolve Edit Conflict
        {pendingConflicts.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 400 }}>
            {unresolved.length} of {pendingConflicts.length} conflicts
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {activeConflict && (
          <>
            <Box>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                Conflict Type
              </Typography>
              <Chip label={activeConflict.type === 'edit-edit' ? 'Both users edited' : 'One user edited, one deleted'} size="small" color="error" variant="outlined" />
            </Box>

            <Box>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                Position: Line {activeConflict.position}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                Your Version
              </Typography>
              <Box
                sx={{
                  p: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'success.main',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  maxHeight: 80,
                  overflow: 'auto'
                }}
              >
                <Typography variant="caption" sx={{ fontSize: 10, color: 'success.main', fontWeight: 600 }}>
                  {activeConflict.userA.name}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', mt: 0.5 }}>
                  {activeConflict.userA.version}
                </Typography>
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                Their Version
              </Typography>
              <Box
                sx={{
                  p: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'warning.main',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  maxHeight: 80,
                  overflow: 'auto'
                }}
              >
                <Typography variant="caption" sx={{ fontSize: 10, color: 'warning.main', fontWeight: 600 }}>
                  {activeConflict.userB.name}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', mt: 0.5 }}>
                  {activeConflict.userB.version}
                </Typography>
              </Box>
            </Box>

            <Divider />

            <Box>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                Resolution
              </Typography>
              <RadioGroup value={selectedResolution} onChange={(e) => setSelectedResolution(e.target.value as any)}>
                <FormControlLabel
                  value="ours"
                  control={<Radio size="small" />}
                  label={<Typography variant="caption" sx={{ fontSize: 11 }}>Keep your version</Typography>}
                />
                <FormControlLabel
                  value="theirs"
                  control={<Radio size="small" />}
                  label={<Typography variant="caption" sx={{ fontSize: 11 }}>Accept their version</Typography>}
                />
                <FormControlLabel
                  value="custom"
                  control={<Radio size="small" />}
                  label={<Typography variant="caption" sx={{ fontSize: 11 }}>Custom merge</Typography>}
                />
              </RadioGroup>
            </Box>

            {selectedResolution === 'custom' && (
              <TextField
                multiline
                rows={3}
                size="small"
                placeholder="Enter merged version..."
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                sx={{ fontSize: 11 }}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSkip} size="small">
          Skip
        </Button>
        <Button onClick={() => setConflictResolutionOpen(false)} size="small">
          Cancel
        </Button>
        <Button onClick={handleResolve} variant="contained" size="small">
          Resolve
        </Button>
      </DialogActions>
    </Dialog>
  )
}
