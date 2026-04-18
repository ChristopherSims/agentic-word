import React, { type FC } from 'react'
import { Snackbar, Alert } from '@mui/material'
import { useAppStore } from '../store/app-store'

export const ToastContainer: FC = () => {
  const { toasts, removeToast } = useAppStore()

  if (toasts.length === 0) return null

  return (
    <>
      {toasts.map((t, i) => (
        <Snackbar
          key={t.id}
          open
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ bottom: 24 + i * 52, right: 16 }}
          onClose={() => removeToast(t.id)}
        >
          <Alert
            onClose={() => removeToast(t.id)}
            severity={t.type === 'success' ? 'success' : t.type === 'error' ? 'error' : t.type === 'warning' ? 'warning' : 'info'}
            variant="filled"
            sx={{ 
              fontSize: 12, 
              minWidth: 200,
              '& .MuiAlert-message': { color: '#fff', fontWeight: 500 },
              '& .MuiSvgIcon-root': { color: '#fff' }
            }}
          >
            {t.message}
          </Alert>
        </Snackbar>
      ))}
    </>
  )
}
