import React, { type FC } from 'react'
import { IconButton, Menu, MenuItem, ListItemIcon, Typography, Divider } from '@mui/material'
import HelpIcon from '@mui/icons-material/Help'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import InfoIcon from '@mui/icons-material/Info'
import ArticleIcon from '@mui/icons-material/Article'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import { useAppStore } from '../store/app-store'

export const HelpMenu: FC = () => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
  const {
    setHelpPanelOpen,
    setHelpPanelView,
    setTutorialMode,
    setShortcutCheatSheetOpen,
    addToast
  } = useAppStore()

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleStartTutorial = () => {
    setHelpPanelOpen(false)
    setTutorialMode(true)
    addToast('info', 'Tutorial mode started. Follow the steps to learn WordApp basics.')
    handleClose()
  }

  const handleOpenFAQ = () => {
    setHelpPanelOpen(true)
    setHelpPanelView('faq')
    handleClose()
  }

  const handleOpenResources = () => {
    setHelpPanelOpen(true)
    setHelpPanelView('resources')
    handleClose()
  }

  const handleOpenKeyboardShortcuts = () => {
    setShortcutCheatSheetOpen(true)
    handleClose()
  }

  const handleOpenHelp = () => {
    setHelpPanelOpen(true)
    setHelpPanelView('tutorials')
    handleClose()
  }

  return (
    <>
      <IconButton
        onClick={handleClick}
        title="Help & Documentation"
        size="small"
        sx={{ fontSize: 14 }}
      >
        <HelpIcon sx={{ fontSize: 18 }} />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleOpenHelp}>
          <ListItemIcon>
            <InfoIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <Typography variant="caption" sx={{ fontSize: 12 }}>
            Help & Documentation
          </Typography>
        </MenuItem>

        <MenuItem onClick={handleStartTutorial}>
          <ListItemIcon>
            <PlayArrowIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <Typography variant="caption" sx={{ fontSize: 12 }}>
            Start Tutorial
          </Typography>
        </MenuItem>

        <MenuItem onClick={handleOpenFAQ}>
          <ListItemIcon>
            <HelpIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <Typography variant="caption" sx={{ fontSize: 12 }}>
            FAQ
          </Typography>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        <MenuItem onClick={handleOpenKeyboardShortcuts}>
          <ListItemIcon>
            <KeyboardIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <Typography variant="caption" sx={{ fontSize: 12 }}>
            Keyboard Shortcuts
          </Typography>
        </MenuItem>

        <MenuItem onClick={handleOpenResources}>
          <ListItemIcon>
            <ArticleIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <Typography variant="caption" sx={{ fontSize: 12 }}>
            Developer Resources
          </Typography>
        </MenuItem>
      </Menu>
    </>
  )
}
