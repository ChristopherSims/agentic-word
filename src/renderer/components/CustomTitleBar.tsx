import React from 'react'
import { Box, IconButton } from '@mui/material'
import { Minimize as MinimizeIcon, CropSquare as MaximizeIcon, Close as CloseIcon } from '@mui/icons-material'

interface CustomTitleBarProps {
  title?: string
  showControls?: boolean
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({ title = 'Lexicon', showControls = true }) => {
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
        justifyContent: 'center',
        alignItems: 'center',
        padding: '8px 16px',
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
        WebkitAppRegion: 'drag' as any,
        height: '36px',
        minHeight: '36px',
        maxHeight: '36px',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        {title}
      </Box>

      {showControls && (
        <Box
          sx={{
            display: 'flex',
            gap: '0px',
            WebkitAppRegion: 'no-drag' as any,
            position: 'absolute',
            right: '8px',
          }}
        >
          <IconButton
            size="small"
            onClick={handleMinimize}
            sx={{
              color: 'var(--text-secondary)',
              '&:hover': { backgroundColor: 'var(--bg-secondary)' },
              padding: '4px',
              borderRadius: '2px',
            }}
          >
            <MinimizeIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleMaximize}
            sx={{
              color: 'var(--text-secondary)',
              '&:hover': { backgroundColor: 'var(--bg-secondary)' },
              padding: '4px',
              borderRadius: '2px',
            }}
          >
            <MaximizeIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleClose}
            sx={{
              color: 'var(--text-secondary)',
              '&:hover': { backgroundColor: 'rgba(255, 0, 0, 0.1)', color: '#ff4444' },
              padding: '4px',
              borderRadius: '2px',
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  )
}
