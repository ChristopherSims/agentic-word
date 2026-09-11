import React, { type FC } from 'react'
import { Box, Slide, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useAppStore } from '../store/app-store'

const iconMap = {
  success: CheckCircleOutlinedIcon,
  error: ErrorOutlinedIcon,
  warning: WarningAmberIcon,
  info: InfoOutlinedIcon,
} as const

const colorMap = {
  success: 'var(--ui-success)',
  error: 'var(--ui-danger)',
  warning: 'var(--ui-warning)',
  info: 'var(--ui-accent)',
} as const

export const ToastContainer: FC = () => {
  const { toasts, removeToast } = useAppStore()

  if (toasts.length === 0) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 16,
        zIndex: 'var(--z-toast, 1600)',
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
                py: 1.25,
                borderRadius: 0.75,
                bgcolor: 'var(--ui-elevated)',
                border: '1px solid var(--ui-border-subtle)',
                borderLeft: `3px solid ${accentColor}`,
                boxShadow: 'var(--ui-shadow-overlay)',
                animation: 'toast-slide-in 0.2s cubic-bezier(0.2, 0, 0, 1)',
                '@keyframes toast-slide-in': {
                  from: { opacity: 0, transform: 'translateX(16px)' },
                  to: { opacity: 1, transform: 'translateX(0)' },
                },
              }}
            >
              <Icon sx={{ fontSize: 18, color: accentColor, mt: 0.15, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--ui-text)',
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
                  color: 'var(--ui-text-muted)',
                  '&:hover': {
                    color: 'var(--ui-text)',
                    bgcolor: 'color-mix(in oklab, var(--ui-text) 6%, transparent)',
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
