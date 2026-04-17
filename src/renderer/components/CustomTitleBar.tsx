import React from 'react'
import { Box, Stack, IconButton } from '@mui/material'
import { Minimize as MinimizeIcon, CropSquare as MaximizeIcon, Close as CloseIcon } from '@mui/icons-material'

interface CustomTitleBarProps {
  title?: string
  showControls?: boolean
}

declare global {
  interface Window {
    wordapp: {
      window: {
        minimize: () => Promise<{ success: boolean }>
        maximize: () => Promise<{ maximized: boolean }>
        close: () => Promise<{ success: boolean }>
      }
    }
  }
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({ title = 'WordApp', showControls = true }) => {
  const handleMinimize = async () => {
    try {
      await window.wordapp?.window?.minimize()
    } catch (err) {
      console.error('Failed to minimize window:', err)
    }
  }

  const handleMaximize = async () => {
    try {
      await window.wordapp?.window?.maximize()
    } catch (err) {
      console.error('Failed to maximize window:', err)
    }
  }

  const handleClose = async () => {
    try {
      await window.wordapp?.window?.close()
    } catch (err) {
      console.error('Failed to close window:', err)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        height: '32px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        userSelect: 'none',
        WebkitAppRegion: 'drag' as any,
        WebkitUserSelect: 'none',
      }}
    >
      {/* Title */}
      <Box
        sx={{
          flex: 1,
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}
      >
        {title}
      </Box>

      {/* Window Controls */}
      {showControls && (
        <Stack
          direction="row"
          spacing={0}
          sx={{
            WebkitAppRegion: 'no-drag' as any,
          }}
        >
          <IconButton
            size="small"
            onClick={handleMinimize}
            sx={{
              width: '32px',
              height: '32px',
              borderRadius: 0,
              color: 'var(--text-secondary)',
              '&:hover': {
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              },
            }}
          >
            <MinimizeIcon sx={{ fontSize: '16px' }} />
          </IconButton>

          <IconButton
            size="small"
            onClick={handleMaximize}
            sx={{
              width: '32px',
              height: '32px',
              borderRadius: 0,
              color: 'var(--text-secondary)',
              '&:hover': {
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              },
            }}
          >
            <MaximizeIcon sx={{ fontSize: '16px' }} />
          </IconButton>

          <IconButton
            size="small"
            onClick={handleClose}
            sx={{
              width: '32px',
              height: '32px',
              borderRadius: 0,
              color: 'var(--text-secondary)',
              '&:hover': {
                backgroundColor: 'var(--danger)',
                color: '#ffffff',
              },
            }}
          >
            <CloseIcon sx={{ fontSize: '16px' }} />
          </IconButton>
        </Stack>
      )}
    </Box>
  )
}
