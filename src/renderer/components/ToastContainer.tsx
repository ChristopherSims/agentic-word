import React, { type FC } from 'react'
import { Snackbar, Alert, Slide, Stack, Box } from '@mui/material'
import type { TransitionProps } from '@mui/material/transitions'
import { useAppStore } from '../store/app-store'

function SlideTransition(props: TransitionProps) {
  return <Slide {...props} direction="left" />
}

export const ToastContainer: FC = () => {
  const { toasts, removeToast } = useAppStore()

  if (toasts.length === 0) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 16,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 1,
        maxHeight: '80vh',
        overflow: 'hidden',
        pointerEvents: 'none',
        '& > *': { pointerEvents: 'auto' },
      }}
    >
      {toasts.map((t) => (
        <Snackbar
          key={t.id}
          open
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ position: 'static' }}
          TransitionComponent={SlideTransition}
          onClose={() => removeToast(t.id)}
        >
          <Alert
            onClose={() => removeToast(t.id)}
            severity={t.type === 'success' ? 'success' : t.type === 'error' ? 'error' : t.type === 'warning' ? 'warning' : 'info'}
            variant="filled"
            sx={{
              fontSize: 12,
              minWidth: 280,
              maxWidth: 400,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              '& .MuiAlert-message': { color: '#fff', fontWeight: 500, flex: 1 },
              '& .MuiSvgIcon-root': { color: '#fff' },
            }}
          >
            {t.message}
          </Alert>
        </Snackbar>
      ))}
    </Box>
  )
}
