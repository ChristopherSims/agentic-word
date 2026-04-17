import React, { FC } from 'react'
import { Box, Paper, Typography, Grid, Button, Divider, Chip, Stack } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import type { VcsMergeConflict } from '../types'

interface ThreeWayMergeViewerProps {
  base: string
  ours: string
  theirs: string
  conflicts: VcsMergeConflict[]
  onResolve?: (choice: 'ours' | 'theirs') => void
}

export const ThreeWayMergeViewer: FC<ThreeWayMergeViewerProps> = ({
  base,
  ours,
  theirs,
  conflicts,
  onResolve
}) => {
  const baseLines = base.split('\n')
  const oursLines = ours.split('\n')
  const theirsLines = theirs.split('\n')
  const maxLines = Math.max(baseLines.length, oursLines.length, theirsLines.length)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Summary */}
      <Paper sx={{ p: 2, bgcolor: conflicts.length > 0 ? 'warning.lighter' : 'success.lighter' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {conflicts.length > 0 ? (
            <>
              <WarningIcon color="warning" />
              <Typography variant="body2" color="text.secondary">
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected
              </Typography>
            </>
          ) : (
            <>
              <CheckCircleIcon color="success" />
              <Typography variant="body2" color="text.secondary">
                No conflicts detected
              </Typography>
            </>
          )}
        </Stack>
      </Paper>

      {/* Three-Way View */}
      <Grid container spacing={2}>
        {/* Base */}
        <Grid item xs={4}>
          <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Base Version
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <Box
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                maxHeight: 400,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                color: 'text.secondary',
                bgcolor: 'background.default',
                p: 1,
                borderRadius: 1
              }}
            >
              {baseLines.map((line, i) => (
                <div key={i}>
                  <span sx={{ color: 'text.disabled' }}>{String(i + 1).padStart(3, ' ')} </span>
                  {line}
                </div>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Ours */}
        <Grid item xs={4}>
          <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Your Changes
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <Box
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                maxHeight: 400,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                bgcolor: 'background.default',
                p: 1,
                borderRadius: 1
              }}
            >
              {oursLines.map((line, i) => (
                <div key={i} style={{ backgroundColor: line !== baseLines[i] ? 'rgba(76, 175, 80, 0.1)' : 'transparent' }}>
                  <span style={{ color: '#666' }}>{String(i + 1).padStart(3, ' ')} </span>
                  {line}
                </div>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Theirs */}
        <Grid item xs={4}>
          <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Their Changes
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <Box
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                maxHeight: 400,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                bgcolor: 'background.default',
                p: 1,
                borderRadius: 1
              }}
            >
              {theirsLines.map((line, i) => (
                <div key={i} style={{ backgroundColor: line !== baseLines[i] ? 'rgba(33, 150, 243, 0.1)' : 'transparent' }}>
                  <span style={{ color: '#666' }}>{String(i + 1).padStart(3, ' ')} </span>
                  {line}
                </div>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Conflicts Details */}
      {conflicts.length > 0 && (
        <Paper sx={{ p: 2, bgcolor: 'error.lighter' }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Conflict Details
          </Typography>
          <Divider sx={{ mb: 1 }} />
          {conflicts.map((conflict, idx) => (
            <Box key={idx} sx={{ mb: 2, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
              <Chip label={conflict.path} size="small" variant="outlined" sx={{ mb: 1 }} />
              <Grid container spacing={1}>
                <Grid item xs={4}>
                  <Typography variant="caption" fontWeight={600}>Your Version</Typography>
                  <Typography variant="body2" component="div" sx={{ fontFamily: 'monospace', fontSize: 10, p: 0.5, bgcolor: 'background.paper', borderRadius: 0.5 }}>
                    {conflict.ours}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" fontWeight={600}>Base Version</Typography>
                  <Typography variant="body2" component="div" sx={{ fontFamily: 'monospace', fontSize: 10, p: 0.5, bgcolor: 'background.paper', borderRadius: 0.5 }}>
                    {conflict.base}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" fontWeight={600}>Their Version</Typography>
                  <Typography variant="body2" component="div" sx={{ fontFamily: 'monospace', fontSize: 10, p: 0.5, bgcolor: 'background.paper', borderRadius: 0.5 }}>
                    {conflict.theirs}
                  </Typography>
                </Grid>
              </Grid>
              {onResolve && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" variant="contained" color="success" onClick={() => onResolve('ours')}>
                    Accept Ours
                  </Button>
                  <Button size="small" variant="contained" color="info" onClick={() => onResolve('theirs')}>
                    Accept Theirs
                  </Button>
                </Stack>
              )}
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  )
}
