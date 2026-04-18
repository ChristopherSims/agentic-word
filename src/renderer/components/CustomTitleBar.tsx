import React, { useState, useEffect, useRef } from 'react'
import { Box, Stack, IconButton, Menu, MenuItem } from '@mui/material'
import { Minimize as MinimizeIcon, CropSquare as MaximizeIcon, Close as CloseIcon } from '@mui/icons-material'
import { useAppStore } from '../store/app-store'

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
      file: {
        openDialog: () => Promise<string | null>
        saveDialog: () => Promise<string | null>
        importDocx: (filePath: string) => Promise<{ content: string } | null>
        saveFile: (filePath: string, content: string) => Promise<void>
      }
      recent: {
        list: () => Promise<string[]>
        clear: () => Promise<void>
      }
    }
  }
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({ title = 'Lexicon', showControls = true }) => {
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null)
  const [editMenuAnchor, setEditMenuAnchor] = useState<null | HTMLElement>(null)
  const [viewMenuAnchor, setViewMenuAnchor] = useState<null | HTMLElement>(null)
  const [vcsMenuAnchor, setVcsMenuAnchor] = useState<null | HTMLElement>(null)
  const [recentFilesMenuAnchor, setRecentFilesMenuAnchor] = useState<null | HTMLElement>(null)
  const [recentFiles, setRecentFiles] = useState<string[]>([])

  // Timeout refs for menu auto-close
  const fileMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vcsMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentFilesMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Helper to close menu after timeout
  const createMenuTimeout = (
    timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    closeCallback: () => void,
    delayMs: number = 3000
  ) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(closeCallback, delayMs)
  }

  // Helper to clear menu timeout
  const clearMenuTimeout = (timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  // Load recent files on mount
  useEffect(() => {
    window.wordapp?.recent.list().then((files) => {
      setRecentFiles(files)
    }).catch((err) => {
      console.error('Failed to load recent files:', err)
    })
  }, [])

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

  // File menu actions
  const handleFileNew = () => {
    useAppStore.getState().setDocumentContent('')
    useAppStore.getState().setDocumentTitle('Untitled')
    useAppStore.getState().setCurrentFilePath(null)
    useAppStore.getState().setDirty(false)
    setFileMenuAnchor(null)
  }

  const handleFileOpen = () => {
    window.wordapp?.file.openDialog().then((filePath) => {
      if (filePath) {
        window.wordapp?.file.importDocx(filePath).then((result) => {
          if (result) {
            useAppStore.getState().setDocumentContent(result.content)
            useAppStore.getState().setDocumentTitle(filePath.split(/[\\/]/).pop() || 'Untitled')
            useAppStore.getState().setCurrentFilePath(filePath)
          }
        })
      }
    })
    setFileMenuAnchor(null)
  }

  const handleFileSave = () => {
    const state = useAppStore.getState()
    if (state.currentFilePath) {
      window.wordapp?.file.saveFile(state.currentFilePath, state.documentContent)
    } else {
      window.wordapp?.file.saveDialog().then((filePath) => {
        if (filePath) {
          window.wordapp?.file.saveFile(filePath, state.documentContent)
          useAppStore.getState().setCurrentFilePath(filePath)
        }
      })
    }
    setFileMenuAnchor(null)
  }

  const handleFileExportPdf = () => {
    useAppStore.getState().setExportDialogOpen(true)
    setFileMenuAnchor(null)
  }

  const handleOpenRecentFile = (filePath: string) => {
    window.wordapp?.file.importDocx(filePath).then((result) => {
      if (result) {
        useAppStore.getState().setDocumentContent(result.content)
        useAppStore.getState().setDocumentTitle(filePath.split(/[\\/]/).pop() || 'Untitled')
        useAppStore.getState().setCurrentFilePath(filePath)
        useAppStore.getState().setDirty(false)
      } else {
        useAppStore.getState().addToast('error', 'Failed to open file')
      }
    }).catch((err) => {
      useAppStore.getState().addToast('error', `Failed to open file: ${(err as Error).message}`)
    })
    setFileMenuAnchor(null)
    setRecentFilesMenuAnchor(null)
  }

  // Edit menu actions
  const handleFindReplace = () => {
    useAppStore.getState().setFindReplaceOpen(true)
    setEditMenuAnchor(null)
  }

  const handleCommandPalette = () => {
    useAppStore.getState().setCommandPaletteOpen(true)
    setEditMenuAnchor(null)
  }

  // View menu actions
  const handleToggleSplitView = () => {
    useAppStore.getState().setSplitViewOpen(!useAppStore.getState().splitViewOpen)
    setViewMenuAnchor(null)
  }

  const handleToggleSettings = () => {
    useAppStore.getState().setSettingsPanelOpen(!useAppStore.getState().settingsPanelOpen)
    setViewMenuAnchor(null)
  }

  // VCS menu actions
  const handleVcsCommit = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('commit')
    setVcsMenuAnchor(null)
  }

  const handleVcsLog = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('log')
    setVcsMenuAnchor(null)
  }

  const handleVcsBranch = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('branches')
    setVcsMenuAnchor(null)
  }

  const toggleFileMenu = (event: React.MouseEvent<HTMLElement>) => {
    setFileMenuAnchor(fileMenuAnchor ? null : event.currentTarget)
  }

  const handleMenuHover = (
    menuSetter: React.Dispatch<React.SetStateAction<HTMLElement | null>>,
    event: React.MouseEvent<HTMLElement>
  ) => {
    // If any menu is open, switch to this menu
    if (fileMenuAnchor || editMenuAnchor || viewMenuAnchor || vcsMenuAnchor) {
      setFileMenuAnchor(null)
      setEditMenuAnchor(null)
      setViewMenuAnchor(null)
      setVcsMenuAnchor(null)
      // Use setTimeout to ensure state clears before opening new menu
      setTimeout(() => menuSetter(event.currentTarget), 0)
    }
  }

  const toggleEditMenu = (event: React.MouseEvent<HTMLElement>) => {
    setEditMenuAnchor(editMenuAnchor ? null : event.currentTarget)
  }

  const toggleViewMenu = (event: React.MouseEvent<HTMLElement>) => {
    setViewMenuAnchor(viewMenuAnchor ? null : event.currentTarget)
  }

  const toggleVcsMenu = (event: React.MouseEvent<HTMLElement>) => {
    setVcsMenuAnchor(vcsMenuAnchor ? null : event.currentTarget)
  }

  const handleOpenRecentFilesMenu = (event: React.MouseEvent<HTMLElement>) => {
    setRecentFilesMenuAnchor(event.currentTarget)
  }

  const handleCloseRecentFilesMenu = () => {
    setRecentFilesMenuAnchor(null)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        height: '32px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        gap: '24px',
        fontSize: '13px',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitAppRegion: 'drag' as any,
      }}
    >
      {/* File Menu */}
      <Box
        onClick={toggleFileMenu}
        onMouseEnter={(e) => handleMenuHover(setFileMenuAnchor, e)}
        onMouseLeave={() => {
          if (editMenuAnchor || viewMenuAnchor || vcsMenuAnchor) {
            setFileMenuAnchor(null)
          }
        }}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
          WebkitAppRegion: 'no-drag' as any,
        }}
      >
        File
      </Box>
      <Menu
        anchorEl={fileMenuAnchor}
        open={Boolean(fileMenuAnchor)}
        onClose={() => setFileMenuAnchor(null)}
        MenuListProps={{ autoFocusItem: false }}
        autoFocus={false}
        onMouseEnter={() => clearMenuTimeout(fileMenuTimeoutRef)}
        onMouseLeave={() => createMenuTimeout(fileMenuTimeoutRef, () => setFileMenuAnchor(null))}
      >
        <MenuItem onClick={handleFileNew}>New</MenuItem>
        <MenuItem>New Tab</MenuItem>
        <MenuItem>New from Template</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleFileOpen}>Open... <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+O</span></MenuItem>
        <MenuItem onClick={handleOpenRecentFilesMenu}>Recent Files</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleFileSave}>Save <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+S</span></MenuItem>
        <MenuItem>Save As <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+Shift+S</span></MenuItem>
        <MenuItem>Save as Template</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleFileExportPdf}>Export PDF <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+Shift+E</span></MenuItem>
        <MenuItem>Export Markdown</MenuItem>
        <MenuItem>Export EPUB</MenuItem>
        <MenuItem divider />
        <MenuItem>Print <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+P</span></MenuItem>
        <MenuItem divider />
        <MenuItem>Quit</MenuItem>
      </Menu>

      {/* Recent Files Submenu */}
      <Menu
        anchorEl={recentFilesMenuAnchor}
        open={Boolean(recentFilesMenuAnchor)}
        onClose={handleCloseRecentFilesMenu}
        MenuListProps={{ autoFocusItem: false }}
        autoFocus={false}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        onMouseEnter={() => clearMenuTimeout(recentFilesMenuTimeoutRef)}
        onMouseLeave={() => createMenuTimeout(recentFilesMenuTimeoutRef, () => setRecentFilesMenuAnchor(null))}
      >
        {recentFiles.length > 0 ? (
          recentFiles.map((filePath) => (
            <MenuItem key={filePath} onClick={() => handleOpenRecentFile(filePath)}>
              {filePath.split(/[\\/]/).pop()}
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>(No recent files)</MenuItem>
        )}
      </Menu>

      {/* Edit Menu */}
      <Box
        onClick={toggleEditMenu}
        onMouseEnter={(e) => handleMenuHover(setEditMenuAnchor, e)}
        onMouseLeave={() => {
          if (fileMenuAnchor || viewMenuAnchor || vcsMenuAnchor) {
            setEditMenuAnchor(null)
          }
        }}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
          WebkitAppRegion: 'no-drag' as any,
        }}
      >
        Edit
      </Box>
      <Menu
        anchorEl={editMenuAnchor}
        open={Boolean(editMenuAnchor)}
        onClose={() => setEditMenuAnchor(null)}
        MenuListProps={{ autoFocusItem: false }}
        autoFocus={false}
        onMouseEnter={() => clearMenuTimeout(editMenuTimeoutRef)}
        onMouseLeave={() => createMenuTimeout(editMenuTimeoutRef, () => setEditMenuAnchor(null))}
      >
        <MenuItem>Undo</MenuItem>
        <MenuItem>Redo</MenuItem>
        <MenuItem divider />
        <MenuItem>Cut</MenuItem>
        <MenuItem>Copy</MenuItem>
        <MenuItem>Paste</MenuItem>
        <MenuItem>Select All</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleFindReplace}>Find & Replace <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+H</span></MenuItem>
        <MenuItem>Find <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+F</span></MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleCommandPalette}>Command Palette <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+Shift+P</span></MenuItem>
      </Menu>

      {/* View Menu */}
      <Box
        onClick={toggleViewMenu}
        onMouseEnter={(e) => handleMenuHover(setViewMenuAnchor, e)}
        onMouseLeave={() => {
          if (fileMenuAnchor || editMenuAnchor || vcsMenuAnchor) {
            setViewMenuAnchor(null)
          }
        }}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
          WebkitAppRegion: 'no-drag' as any,
        }}
      >
        View
      </Box>
      <Menu
        anchorEl={viewMenuAnchor}
        open={Boolean(viewMenuAnchor)}
        onClose={() => setViewMenuAnchor(null)}
        MenuListProps={{ autoFocusItem: false }}
        autoFocus={false}
        onMouseEnter={() => clearMenuTimeout(viewMenuTimeoutRef)}
        onMouseLeave={() => createMenuTimeout(viewMenuTimeoutRef, () => setViewMenuAnchor(null))}
      >
        <MenuItem onClick={handleToggleSplitView}>Toggle Split View <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+\</span></MenuItem>
        <MenuItem onClick={handleToggleSettings}>Toggle Spell Check</MenuItem>
        <MenuItem divider />
        <MenuItem>Reload</MenuItem>
        <MenuItem>Force Reload</MenuItem>
        <MenuItem>Dev Tools</MenuItem>
        <MenuItem divider />
        <MenuItem>Zoom In</MenuItem>
        <MenuItem>Zoom Out</MenuItem>
        <MenuItem>Reset Zoom</MenuItem>
        <MenuItem divider />
        <MenuItem>Fullscreen</MenuItem>
      </Menu>

      {/* Version Control Menu */}
      <Box
        onClick={toggleVcsMenu}
        onMouseEnter={(e) => handleMenuHover(setVcsMenuAnchor, e)}
        onMouseLeave={() => {
          if (fileMenuAnchor || editMenuAnchor || viewMenuAnchor) {
            setVcsMenuAnchor(null)
          }
        }}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
          WebkitAppRegion: 'no-drag' as any,
        }}
      >
        Version Control
      </Box>
      <Menu
        anchorEl={vcsMenuAnchor}
        open={Boolean(vcsMenuAnchor)}
        onClose={() => setVcsMenuAnchor(null)}
        MenuListProps={{ autoFocusItem: false }}
        autoFocus={false}
        onMouseEnter={() => clearMenuTimeout(vcsMenuTimeoutRef)}
        onMouseLeave={() => createMenuTimeout(vcsMenuTimeoutRef, () => setVcsMenuAnchor(null))}
      >
        <MenuItem onClick={handleVcsCommit}>Commit <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+Shift+G</span></MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleVcsLog}>Show Log</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleVcsBranch}>Create Branch</MenuItem>
        <MenuItem>Switch Branch</MenuItem>
        <MenuItem divider />
        <MenuItem>Diff Current</MenuItem>
        <MenuItem>Revert to</MenuItem>
      </Menu>

      {/* Spacer - Draggable Area with buffer */}
      <Box sx={{ flex: 1, px: 1 }} />

      {/* Window Title */}
      <Box
        sx={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textAlign: 'center',
        }}
      >
        {title}
      </Box>

      {/* Spacer - Draggable Area with buffer */}
      <Box sx={{ flex: 1, px: 1 }} />

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
                backgroundColor: '#ff4444',
                color: '#fff',
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
