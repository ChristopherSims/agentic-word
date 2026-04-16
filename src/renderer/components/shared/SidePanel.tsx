import React, { type FC, type ReactNode } from 'react'
import { Box, Paper, Typography, IconButton, type SxProps, type Theme } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

interface SidePanelProps {
  /** Panel title shown in the header */
  title: string
  /** Called when the close button is clicked */
  onClose: () => void
  /** Panel width in pixels (default 380) */
  width?: number
  /** z-index (default 100) */
  zIndex?: number
  /** Right offset in pixels (default 0) */
  right?: number
  /** Optional header content rendered after the title */
  headerContent?: ReactNode
  /** Panel body content */
  children: ReactNode
  /** If true, renders nothing (convenience for open/close gating) */
  open?: boolean
  /** Additional sx overrides for the Paper root */
  sx?: SxProps<Theme>
}

/**
 * Shared side-panel wrapper used by VcsPanel, SettingsPanel, CommentPanel, etc.
 * Provides the common fixed-right Paper layout with a header bar containing
 * a title and close button, plus optional extra header content (e.g. tabs).
 */
export const SidePanel: FC<SidePanelProps> = ({
  title,
  onClose,
  width = 380,
  zIndex = 100,
  right = 0,
  headerContent,
  children,
  open = true,
  sx
}) => {
  if (!open) return null

  return (
    <Paper
      sx={{
        position: 'fixed',
        right,
        top: 0,
        bottom: 0,
        width,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid',
        borderColor: 'divider',
        background: 'linear-gradient(to bottom, rgba(24, 24, 37, 0.95), rgba(18, 18, 28, 0.98))',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        transform: right === undefined ? 'translateX(0)' : 'translateX(0)',
        ...sx
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1.5,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper'
        }}
      >
        {headerContent ?? (
          <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: '0.5px' }}>{title}</Typography>
        )}
        <IconButton size="small" onClick={onClose} sx={{ transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
      {children}
    </Paper>
  )
}
