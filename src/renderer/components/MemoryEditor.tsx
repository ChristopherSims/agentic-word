import { Dialog, DialogTitle, DialogContent, IconButton, Box, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useAppStore } from '../store/app-store'
import { MemoryPanel } from './MemoryPanel'

export function MemoryEditor() {
  const memoryOpen = useAppStore(s => s.memoryOpen)
  const memoryFilePath = useAppStore(s => s.memoryFilePath)
  const closeMemoryPopup = useAppStore(s => s.closeMemoryPopup)

  if (!memoryOpen) return null

  const fileName = memoryFilePath ? memoryFilePath.split(/[\\/]/).pop() : 'Untitled'
  const displayName = fileName.replace(/\.\w+$/, '')

  return (
    <Dialog
      open={memoryOpen}
      onClose={closeMemoryPopup}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      sx={{
        '& .MuiDialog-container': { height: '100%', alignItems: 'flex-start' },
        '& .MuiDialog-paper': {
          height: '80vh',
          maxHeight: '95vh',
          mx: 2, mt: 2,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mr: 'auto' }}>
          <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'var(--accent-muted)', color: 'var(--accent)', border: 1, borderColor: 'var(--accent)', fontSize: '0.8rem', mr: 1 }}>Memory</Box>
          {displayName}
        </Typography>
        <IconButton onClick={closeMemoryPopup} sx={{ p: 1 }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ flex: 1, overflow: 'auto', p: 2, minHeight: 0 }}>
        <MemoryPanel />
      </DialogContent>
    </Dialog>
  )
}