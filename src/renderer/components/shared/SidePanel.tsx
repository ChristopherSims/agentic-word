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
  /** Render flush inside a docked inspector instead of as a fixed overlay. */
  embedded?: boolean
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
  embedded = false,
  sx
}) => {
  if (!open) return null

  return (
    <Paper
      sx={{
        position: embedded ? 'relative' : 'fixed',
        right: embedded ? 'auto' : right,
        top: embedded ? 'auto' : 0,
        bottom: embedded ? 'auto' : 0,
        width: embedded ? '100%' : width,
        height: embedded ? '100%' : 'auto',
        minWidth: 0,
        zIndex: embedded ? 'auto' : zIndex,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: embedded ? 'none' : '1px solid',
        borderColor: 'divider',
        background: 'var(--ui-surface)',
        boxShadow: embedded ? 'none' : 'var(--ui-shadow-overlay)',
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
        <IconButton size="small" onClick={onClose} sx={{ transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
      {children}
    </Paper>
  )
}
