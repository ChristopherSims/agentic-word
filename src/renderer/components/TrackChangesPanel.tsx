import React, { type FC } from 'react'
import { Box, Paper, Typography, IconButton, Button, Chip, List, ListItem, ListItemText, Divider, ToggleButton, Tooltip, Stack } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import RemoveCircleOutlinedIcon from '@mui/icons-material/RemoveCircleOutlined'
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined'
import { useAppStore } from '../store/app-store'

export const TrackChangesPanel: FC = () => {
  const {
    trackChangesOn, trackedChanges,
    setTrackChangesOn, acceptTrackedChange, rejectTrackedChange,
    acceptAllTrackedChanges, rejectAllTrackedChanges
  } = useAppStore()

  const pending = trackedChanges.filter((c) => !c.accepted && !c.rejected)
  const accepted = trackedChanges.filter((c) => c.accepted)
  const rejected = trackedChanges.filter((c) => c.rejected)

  return (
    <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
      {/* Toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" fontWeight={600}>Track Changes</Typography>
          <Chip
            label={trackChangesOn ? 'ON' : 'OFF'}
            size="small"
            color={trackChangesOn ? 'success' : 'default'}
            variant={trackChangesOn ? 'filled' : 'outlined'}
            sx={{ fontSize: 9, height: 18, cursor: 'pointer' }}
            onClick={() => setTrackChangesOn(!trackChangesOn)}
          />
        </Box>
        {pending.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            <Tooltip title="Accept All"><IconButton size="small" color="success" onClick={acceptAllTrackedChanges}><DoneAllIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
            <Tooltip title="Reject All"><IconButton size="small" color="error" onClick={rejectAllTrackedChanges}><CancelIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
          </Box>
        )}
      </Box>

      {/* Pending changes list */}
      {pending.length > 0 ? (
        <List dense sx={{ py: 0, maxHeight: 200, overflow: 'auto' }}>
          {pending.map((c) => (
            <ListItem key={c.id} sx={{ py: 0.25, px: 0.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {c.type === 'insert' ? (
                <AddCircleOutlinedIcon sx={{ fontSize: 14, color: 'success.main' }} />
              ) : (
                <RemoveCircleOutlinedIcon sx={{ fontSize: 14, color: 'error.main' }} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ fontSize: 10, color: c.type === 'insert' ? 'success.main' : 'error.main', fontWeight: 600 }}>
                  {c.type === 'insert' ? 'Insert' : 'Delete'}
                </Typography>
                <Typography variant="caption" noWrap display="block" sx={{ fontSize: 10 }}>
                  {c.text.slice(0, 50)}{c.text.length > 50 ? '...' : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 8 }}>
                  by {c.author} · {new Date(c.timestamp).toLocaleTimeString().slice(0, 5)}
                </Typography>
              </Box>
              <IconButton size="small" color="success" onClick={() => acceptTrackedChange(c.id)}><CheckCircleIcon sx={{ fontSize: 12 }} /></IconButton>
              <IconButton size="small" color="error" onClick={() => rejectTrackedChange(c.id)}><CancelIcon sx={{ fontSize: 12 }} /></IconButton>
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 1, fontSize: 10 }}>
          {trackChangesOn ? 'No tracked changes yet. Edits will be tracked.' : 'Enable tracking to record changes.'}
        </Typography>
      )}

      {/* Summary */}
      {(accepted.length > 0 || rejected.length > 0) && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <Stack direction="row" spacing={1} justifyContent="center">
            <Chip label={`${accepted.length} accepted`} size="small" color="success" variant="outlined" sx={{ fontSize: 9, height: 16 }} />
            <Chip label={`${rejected.length} rejected`} size="small" color="error" variant="outlined" sx={{ fontSize: 9, height: 16 }} />
          </Stack>
        </>
      )}
    </Box>
  )
}
