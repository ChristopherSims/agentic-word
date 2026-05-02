import React from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Alert, Stack } from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'

export interface TauriMigrationDialogProps {
  open: boolean
  onClose: () => void
}

export const TauriMigrationDialog: React.FC<TauriMigrationDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <InfoIcon sx={{ color: 'warning.main' }} />
        Upcoming Migration to Tauri
      </DialogTitle>
      <DialogContent sx={{ minHeight: '200px' }}>
        <Stack spacing={2} sx={{ marginTop: 1 }}>
          <Typography variant="body1">
            Lexicon will be migrating from Electron to Tauri in the next major release (0.7.0).
          </Typography>

          <Alert severity="warning">
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              You will need to <strong>manually download the new binaries</strong> when the update is available.
            </Typography>
          </Alert>

          <Typography variant="body2" color="textSecondary">
            This migration will bring:
          </Typography>

          <Box component="ul" sx={{ marginLeft: 2, marginTop: 0.5 }}>
            <Typography component="li" variant="body2" color="textSecondary" sx={{ marginBottom: 0.5 }}>
              Improved performance and reduced memory usage
            </Typography>
            <Typography component="li" variant="body2" color="textSecondary" sx={{ marginBottom: 0.5 }}>
              Smaller application size
            </Typography>
            <Typography component="li" variant="body2" color="textSecondary">
              Better system integration across platforms
            </Typography>
          </Box>

          <Typography variant="body2" color="textSecondary">
            For more information, check <strong> https://github.com/ChristopherSims/agentic-word </strong>.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  )
}
