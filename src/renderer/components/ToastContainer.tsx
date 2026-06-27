import React, { type FC } from 'react'
import { Box, Slide, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import type { TransitionProps } from '@mui/material/transitions'
import { useAppStore } from '../store/app-store'

const iconMap = {
  success: CheckCircleOutlinedIcon,
  error: ErrorOutlinedIcon,
  warning: WarningAmberIcon,
  info: InfoOutlinedIcon,
} as const

const colorMap = {
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
} as const

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
      {toasts.map((t) => {
        const Icon = iconMap[t.type] || iconMap.info
        const accentColor = colorMap[t.type] || colorMap.info

        return (
          <Slide key={t.id} direction="left" in mountOnEnter unmountOnExit>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                minWidth: 300,
                maxWidth: 420,
                px: 1.75,
                py: 1.5,
                borderRadius: 1.5,
                bgcolor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${accentColor}`,
                boxShadow: 'var(--shadow-lg)',
                backdropFilter: 'blur(12px)',
                '@supports not (backdrop-filter: blur(12px))': {
                  bgcolor: 'rgba(49, 50, 68, 0.95)',
                },
                animation: 'toast-slide-in 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                '@keyframes toast-slide-in': {
                  from: { opacity: 0, transform: 'translateX(24px)' },
                  to: { opacity: 1, transform: 'translateX(0)' },
                },
              }}
            >
              <Icon sx={{ fontSize: 18, color: accentColor, mt: 0.15, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}
                >
                  {t.message}
                </Box>
              </Box>
              <IconButton
                size="small"
                onClick={() => removeToast(t.id)}
                sx={{
                  p: 0.25,
                  mt: -0.25,
                  mr: -0.5,
                  color: 'var(--text-muted)',
                  '&:hover': {
                    color: 'var(--text-primary)',
                    bgcolor: 'rgba(255,255,255,0.06)',
                  },
                }}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </Slide>
        )
      })}
    </Box>
  )
}
