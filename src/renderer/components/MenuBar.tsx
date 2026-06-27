import React, { useState, useEffect, useRef } from 'react'
import { Box, Stack, Menu, MenuItem, IconButton } from '@mui/material'
import { Minimize as MinimizeIcon, CropSquare as MaximizeIcon, Close as CloseIcon } from '@mui/icons-material'
import { useAppStore } from '../store/app-store'

// Menu timing configuration
const MENU_MIN_OPEN_MS = 300  // Minimum time menu stays open (debounce for immediate close)
const MENU_MOUSELEAVE_DELAY_MS = 300  // Delay before closing menu on mouse leave
const MENU_BAR_MOUSELEAVE_DELAY_MS = 200  // Delay before closing menu bar item on mouse leave

export const MenuBar: React.FC = () => {
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null)
  const [editMenuAnchor, setEditMenuAnchor] = useState<null | HTMLElement>(null)
  const [viewMenuAnchor, setViewMenuAnchor] = useState<null | HTMLElement>(null)
  const [vcsMenuAnchor, setVcsMenuAnchor] = useState<null | HTMLElement>(null)
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<null | HTMLElement>(null)
  const [helpMenuAnchor, setHelpMenuAnchor] = useState<null | HTMLElement>(null)
  const [recentFilesMenuAnchor, setRecentFilesMenuAnchor] = useState<null | HTMLElement>(null)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  // Timeout refs for menu auto-close
  const fileMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vcsMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const helpMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentFilesMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs to track when menus were opened (to prevent immediate close)
  const fileMenuOpenTimeRef = useRef<number>(0)
  const editMenuOpenTimeRef = useRef<number>(0)
  const viewMenuOpenTimeRef = useRef<number>(0)
  const vcsMenuOpenTimeRef = useRef<number>(0)
  const settingsMenuOpenTimeRef = useRef<number>(0)
  const helpMenuOpenTimeRef = useRef<number>(0)
  const recentFilesMenuOpenTimeRef = useRef<number>(0)

  const createMenuTimeout = (
    timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    closeCallback: () => void,
    menuOpenTimeRef: React.MutableRefObject<number>,
    delayMs: number = 1000,
    minOpenMs: number = MENU_MIN_OPEN_MS
  ) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    // Check if menu has been open for at least minOpenMs before allowing close
    const timeSinceOpen = Date.now() - menuOpenTimeRef.current
    const delayBeforeClose = Math.max(0, minOpenMs - timeSinceOpen)
    timeoutRef.current = setTimeout(closeCallback, delayBeforeClose + delayMs)
  }

  const clearMenuTimeout = (timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(() => {
    window.wordapp?.recent.list().then((files) => {
      setRecentFiles(files)
    }).catch((err) => {
      console.error('Failed to load recent files:', err)
    })
  }, [])

  // File menu handlers
  const handleFileNew = () => {
    const state = useAppStore.getState()
    state.addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })
    setFileMenuAnchor(null)
  }

  const handleFileOpen = async () => {
    const filePath = await window.wordapp?.file.openDialog()
    if (filePath) {
      const result = await window.wordapp?.file.importDocx(filePath)
      if (result) {
        const name = result.filePath.split(/[\\/]/).pop() || 'Untitled'
        useAppStore.getState().addDocTab({ 
          title: name, 
          filePath: result.filePath, 
          content: result.content, 
          isDirty: false 
        })
      }
    }
    setFileMenuAnchor(null)
  }

  const handleFileSaveAs = async () => {
    const state = useAppStore.getState()
    const filePath = await window.wordapp?.file.saveDialog()
    if (filePath) {
      await window.wordapp?.file.saveFile(filePath, state.documentContent)
      state.setCurrentFilePath(filePath)
      state.setDirty(false)
      state.addToast('success', 'File saved')
    }
    setFileMenuAnchor(null)
  }

  const handleFilePrint = () => {
    useAppStore.getState().setPrintPreviewOpen(true)
    setFileMenuAnchor(null)
  }

  const handleFileExit = async () => {
    await window.wordapp?.window?.close()
    setFileMenuAnchor(null)
  }

  const handleRecentFileClick = async (filePath: string) => {
    const result = await window.wordapp?.file.importDocx(filePath)
    if (result) {
      const name = result.filePath.split(/[\\/]/).pop() || 'Untitled'
      useAppStore.getState().addDocTab({ 
        title: name, 
        filePath: result.filePath, 
        content: result.content, 
        isDirty: false 
      })
    }
    setRecentFilesMenuAnchor(null)
    setFileMenuAnchor(null)
  }

  // Edit menu handlers
  const handleUndo = () => {
    window.wordapp?.edit.undo()
    setEditMenuAnchor(null)
  }

  const handleRedo = () => {
    window.wordapp?.edit.redo()
    setEditMenuAnchor(null)
  }

  const handleCut = () => {
    document.execCommand('cut')
    setEditMenuAnchor(null)
  }

  const handleCopy = () => {
    document.execCommand('copy')
    setEditMenuAnchor(null)
  }

  const handlePaste = () => {
    document.execCommand('paste')
    setEditMenuAnchor(null)
  }

  const handleSelectAll = () => {
    document.execCommand('selectAll')
    setEditMenuAnchor(null)
  }

  const handleFind = () => {
    useAppStore.getState().setFindReplaceOpen(true)
    setEditMenuAnchor(null)
  }

  // View menu handlers
  const handleToggleSplitView = () => {
    useAppStore.getState().setSplitViewOpen(!useAppStore.getState().splitViewOpen)
    setViewMenuAnchor(null)
  }

  const handleToggleSettings = () => {
    useAppStore.getState().setSettingsPanelOpen(!useAppStore.getState().settingsPanelOpen)
    setViewMenuAnchor(null)
  }

  const handleDevTools = async () => {
    try {
      await window.wordapp?.dev.toggleDevTools()
    } catch (err) {
      console.error('Failed to toggle dev tools:', err)
    }
    setViewMenuAnchor(null)
  }

  const handleReload = async () => {
    window.location.reload()
    setViewMenuAnchor(null)
  }

  const handleForceReload = async () => {
    window.location.reload()
    setViewMenuAnchor(null)
  }

  const handleZoomIn = async () => {
    try {
      await window.wordapp?.window?.zoomIn?.()
    } catch (err) {
      console.error('Failed to zoom in:', err)
    }
    setViewMenuAnchor(null)
  }

  const handleZoomOut = async () => {
    try {
      await window.wordapp?.window?.zoomOut?.()
    } catch (err) {
      console.error('Failed to zoom out:', err)
    }
    setViewMenuAnchor(null)
  }

  const handleResetZoom = async () => {
    try {
      await window.wordapp?.window?.resetZoom?.()
    } catch (err) {
      console.error('Failed to reset zoom:', err)
    }
    setViewMenuAnchor(null)
  }

  const handleFullscreen = async () => {
    try {
      await window.wordapp?.window?.toggleFullscreen?.()
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err)
    }
    setViewMenuAnchor(null)
  }

  // VCS menu handlers
  const handleVcsCommit = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('commit')
    setVcsMenuAnchor(null)
  }

  const handleVcsBranch = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('branches')
    setVcsMenuAnchor(null)
  }

  const handleVcsLog = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('log')
    setVcsMenuAnchor(null)
  }

  const handleVcsDiff = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('diff')
    setVcsMenuAnchor(null)
  }

  const handleVcsSettings = () => {
    useAppStore.getState().setVcsPanelOpen(true)
    useAppStore.getState().setVcsPanelView('hooks')
    setVcsMenuAnchor(null)
  }

  // Settings menu handlers
  const handleOpenSettings = () => {
    useAppStore.getState().setSettingsPanelOpen(true)
    setSettingsMenuAnchor(null)
  }

  const handleOpenThemeCustomizer = () => {
    useAppStore.getState().setThemeCustomizerOpen(true)
    setSettingsMenuAnchor(null)
  }

  const handleOpenFontManager = () => {
    useAppStore.getState().setFontManagerOpen(true)
    setSettingsMenuAnchor(null)
  }

  const handleOpenKeyboardShortcuts = () => {
    useAppStore.getState().setShortcutCheatSheetOpen(true)
    setSettingsMenuAnchor(null)
  }

  const handleOpenAccessibility = () => {
    useAppStore.getState().setAccessibilityPanelOpen(true)
    setSettingsMenuAnchor(null)
  }

  // Help menu handlers
  const handleOpenHelp = () => {
    useAppStore.getState().setHelpPanelOpen(true)
    useAppStore.getState().setHelpPanelView('tutorials')
    setHelpMenuAnchor(null)
  }

  const handleOpenFAQ = () => {
    useAppStore.getState().setHelpPanelOpen(true)
    useAppStore.getState().setHelpPanelView('faq')
    setHelpMenuAnchor(null)
  }

  const handleStartTutorial = () => {
    useAppStore.getState().setTutorialMode(true)
    useAppStore.getState().addToast('info', 'Tutorial mode started. Follow the steps to learn WordApp basics.')
    setHelpMenuAnchor(null)
  }

  const handleOpenResources = () => {
    useAppStore.getState().setHelpPanelOpen(true)
    useAppStore.getState().setHelpPanelView('resources')
    setHelpMenuAnchor(null)
  }

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

  const toggleFileMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!fileMenuAnchor) {
      fileMenuOpenTimeRef.current = Date.now()
    }
    setFileMenuAnchor(fileMenuAnchor ? null : e.currentTarget)
  }

  const toggleEditMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!editMenuAnchor) {
      editMenuOpenTimeRef.current = Date.now()
    }
    setEditMenuAnchor(editMenuAnchor ? null : e.currentTarget)
  }

  const toggleViewMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!viewMenuAnchor) {
      viewMenuOpenTimeRef.current = Date.now()
    }
    setViewMenuAnchor(viewMenuAnchor ? null : e.currentTarget)
  }

  const toggleVcsMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!vcsMenuAnchor) {
      vcsMenuOpenTimeRef.current = Date.now()
    }
    setVcsMenuAnchor(vcsMenuAnchor ? null : e.currentTarget)
  }

  const toggleSettingsMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!settingsMenuAnchor) {
      settingsMenuOpenTimeRef.current = Date.now()
    }
    setSettingsMenuAnchor(settingsMenuAnchor ? null : e.currentTarget)
  }

  const toggleHelpMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!helpMenuAnchor) {
      helpMenuOpenTimeRef.current = Date.now()
    }
    setHelpMenuAnchor(helpMenuAnchor ? null : e.currentTarget)
  }

  const handleMenuHover = (
    setAnchor: React.Dispatch<React.SetStateAction<HTMLElement | null>>,
    e: React.MouseEvent<HTMLElement>
  ) => {
    if (fileMenuAnchor || editMenuAnchor || viewMenuAnchor || vcsMenuAnchor) {
      setAnchor(e.currentTarget)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        gap: '0px',
        padding: '4px 8px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
        WebkitAppRegion: 'drag' as any,
      }}
    >
      {/* File Menu */}
      <Box
        onClick={toggleFileMenu}
        onMouseEnter={(e) => {
          clearMenuTimeout(fileMenuTimeoutRef)
          handleMenuHover(setFileMenuAnchor, e)
        }}
        onMouseLeave={() => createMenuTimeout(fileMenuTimeoutRef, () => setFileMenuAnchor(null), fileMenuOpenTimeRef, MENU_BAR_MOUSELEAVE_DELAY_MS)}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          WebkitAppRegion: 'no-drag' as any,
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
        }}
      >
        File
      </Box>
      <Menu
        anchorEl={fileMenuAnchor}
        open={Boolean(fileMenuAnchor)}
        onClose={() => setFileMenuAnchor(null)}
        autoFocus={false}
        slotProps={{
          paper: {
            onMouseEnter: () => clearMenuTimeout(fileMenuTimeoutRef),
            onMouseLeave: () => createMenuTimeout(fileMenuTimeoutRef, () => setFileMenuAnchor(null), fileMenuOpenTimeRef, MENU_MOUSELEAVE_DELAY_MS),
          },
        }}
      >
        <MenuItem onClick={handleFileNew}>New <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+N</span></MenuItem>
        <MenuItem onClick={handleFileOpen}>Open <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+O</span></MenuItem>
        <MenuItem divider />
        <MenuItem 
          onClick={(e) => {
            if (fileMenuAnchor) {
              recentFilesMenuOpenTimeRef.current = Date.now()
              setRecentFilesMenuAnchor(e.currentTarget)
            }
          }}
          onMouseEnter={(e) => { clearMenuTimeout(recentFilesMenuTimeoutRef); recentFilesMenuOpenTimeRef.current = Date.now(); setRecentFilesMenuAnchor(e.currentTarget) }}
        >
          Recent Files →
        </MenuItem>
        <Menu
          anchorEl={recentFilesMenuAnchor}
          open={Boolean(recentFilesMenuAnchor)}
          onClose={() => setRecentFilesMenuAnchor(null)}
          autoFocus={false}
          slotProps={{
            paper: {
              onMouseEnter: () => clearMenuTimeout(recentFilesMenuTimeoutRef),
              onMouseLeave: () => createMenuTimeout(recentFilesMenuTimeoutRef, () => { setRecentFilesMenuAnchor(null); setFileMenuAnchor(null) }, recentFilesMenuOpenTimeRef, MENU_MOUSELEAVE_DELAY_MS),
            },
          }}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {recentFiles.length > 0 ? (
            recentFiles.map((file, idx) => (
              <MenuItem key={idx} onClick={() => handleRecentFileClick(file)}>
                {file.split(/[\\/]/).pop()}
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled>No recent files</MenuItem>
          )}
        </Menu>
        <MenuItem divider />
        <MenuItem onClick={handleFileSaveAs}>Save As <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+Shift+S</span></MenuItem>
        <MenuItem onClick={handleFilePrint}>Print <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+P</span></MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleFileExit}>Exit</MenuItem>
      </Menu>

      {/* Edit Menu */}
      <Box
        onClick={toggleEditMenu}
        onMouseEnter={(e) => {
          clearMenuTimeout(editMenuTimeoutRef)
          handleMenuHover(setEditMenuAnchor, e)
        }}
        onMouseLeave={() => createMenuTimeout(editMenuTimeoutRef, () => setEditMenuAnchor(null), editMenuOpenTimeRef, MENU_BAR_MOUSELEAVE_DELAY_MS)}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'all 0.2s ease',
          WebkitAppRegion: 'no-drag' as any,
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        Edit
      </Box>
      <Menu
        anchorEl={editMenuAnchor}
        open={Boolean(editMenuAnchor)}
        onClose={() => setEditMenuAnchor(null)}
        autoFocus={false}
        slotProps={{
          paper: {
            onMouseEnter: () => clearMenuTimeout(editMenuTimeoutRef),
            onMouseLeave: () => createMenuTimeout(editMenuTimeoutRef, () => setEditMenuAnchor(null), editMenuOpenTimeRef, MENU_MOUSELEAVE_DELAY_MS),
          },
        }}
      >
        <MenuItem onClick={handleUndo}>Undo <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+Z</span></MenuItem>
        <MenuItem onClick={handleRedo}>Redo <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+Y</span></MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleCut}>Cut <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+X</span></MenuItem>
        <MenuItem onClick={handleCopy}>Copy <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+C</span></MenuItem>
        <MenuItem onClick={handlePaste}>Paste <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+V</span></MenuItem>
        <MenuItem onClick={handleSelectAll}>Select All <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+A</span></MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleFind}>Find & Replace <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+H</span></MenuItem>
      </Menu>

      {/* View Menu */}
      <Box
        onClick={toggleViewMenu}
        onMouseEnter={(e) => {
          clearMenuTimeout(viewMenuTimeoutRef)
          handleMenuHover(setViewMenuAnchor, e)
        }}
        onMouseLeave={() => createMenuTimeout(viewMenuTimeoutRef, () => setViewMenuAnchor(null), viewMenuOpenTimeRef, MENU_BAR_MOUSELEAVE_DELAY_MS)}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'all 0.2s ease',
          WebkitAppRegion: 'no-drag' as any,
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        View
      </Box>
      <Menu
        anchorEl={viewMenuAnchor}
        open={Boolean(viewMenuAnchor)}
        onClose={() => setViewMenuAnchor(null)}
        autoFocus={false}
        slotProps={{
          paper: {
            onMouseEnter: () => clearMenuTimeout(viewMenuTimeoutRef),
            onMouseLeave: () => createMenuTimeout(viewMenuTimeoutRef, () => setViewMenuAnchor(null), viewMenuOpenTimeRef, MENU_MOUSELEAVE_DELAY_MS),
          },
        }}
      >
        <MenuItem onClick={handleToggleSplitView}>Toggle Split View <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+\</span></MenuItem>
        <MenuItem onClick={handleToggleSettings}>Toggle Settings</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleReload}>Reload</MenuItem>
        <MenuItem onClick={handleForceReload}>Force Reload</MenuItem>
        <MenuItem onClick={handleDevTools}>Dev Tools</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleZoomIn}>Zoom In</MenuItem>
        <MenuItem onClick={handleZoomOut}>Zoom Out</MenuItem>
        <MenuItem onClick={handleResetZoom}>Reset Zoom</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleFullscreen}>Fullscreen</MenuItem>
      </Menu>

      {/* VCS Menu */}
      <Box
        onClick={toggleVcsMenu}
        onMouseEnter={(e) => {
          clearMenuTimeout(vcsMenuTimeoutRef)
          handleMenuHover(setVcsMenuAnchor, e)
        }}
        onMouseLeave={() => createMenuTimeout(vcsMenuTimeoutRef, () => setVcsMenuAnchor(null), vcsMenuOpenTimeRef, MENU_BAR_MOUSELEAVE_DELAY_MS)}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          WebkitAppRegion: 'no-drag' as any,
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
        }}
      >
        VCS
      </Box>
      <Menu
        anchorEl={vcsMenuAnchor}
        open={Boolean(vcsMenuAnchor)}
        onClose={() => setVcsMenuAnchor(null)}
        autoFocus={false}
        slotProps={{
          paper: {
            onMouseEnter: () => clearMenuTimeout(vcsMenuTimeoutRef),
            onMouseLeave: () => createMenuTimeout(vcsMenuTimeoutRef, () => setVcsMenuAnchor(null), vcsMenuOpenTimeRef, MENU_MOUSELEAVE_DELAY_MS),
          },
        }}
      >
        <MenuItem onClick={handleVcsCommit}>Commit</MenuItem>
        <MenuItem onClick={handleVcsBranch}>Branches</MenuItem>
        <MenuItem onClick={handleVcsLog}>Log</MenuItem>
        <MenuItem onClick={handleVcsDiff}>Diff</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleVcsSettings}>Settings</MenuItem>
      </Menu>

      {/* Settings Menu */}
      <Box
        onClick={toggleSettingsMenu}
        onMouseEnter={(e) => {
          clearMenuTimeout(settingsMenuTimeoutRef)
          handleMenuHover(setSettingsMenuAnchor, e)
        }}
        onMouseLeave={() => createMenuTimeout(settingsMenuTimeoutRef, () => setSettingsMenuAnchor(null), settingsMenuOpenTimeRef, MENU_BAR_MOUSELEAVE_DELAY_MS)}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          WebkitAppRegion: 'no-drag' as any,
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
        }}
      >
        Settings
      </Box>
      <Menu
        anchorEl={settingsMenuAnchor}
        open={Boolean(settingsMenuAnchor)}
        onClose={() => setSettingsMenuAnchor(null)}
        autoFocus={false}
        slotProps={{
          paper: {
            onMouseEnter: () => clearMenuTimeout(settingsMenuTimeoutRef),
            onMouseLeave: () => createMenuTimeout(settingsMenuTimeoutRef, () => setSettingsMenuAnchor(null), settingsMenuOpenTimeRef, MENU_MOUSELEAVE_DELAY_MS),
          },
        }}
      >
        <MenuItem onClick={handleOpenSettings}>Open Settings <span style={{ marginLeft: 'auto', paddingLeft: '20px', color: '#999', fontSize: '0.85em' }}>Ctrl+,</span></MenuItem>
        <MenuItem onClick={handleOpenThemeCustomizer}>Theme Customizer</MenuItem>
        <MenuItem onClick={handleOpenFontManager}>Font Manager</MenuItem>
        <MenuItem onClick={handleOpenAccessibility}>Accessibility</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleOpenKeyboardShortcuts}>Keyboard Shortcuts</MenuItem>
      </Menu>

      {/* Help Menu */}
      <Box
        onClick={toggleHelpMenu}
        onMouseEnter={(e) => {
          clearMenuTimeout(helpMenuTimeoutRef)
          handleMenuHover(setHelpMenuAnchor, e)
        }}
        onMouseLeave={() => createMenuTimeout(helpMenuTimeoutRef, () => setHelpMenuAnchor(null), helpMenuOpenTimeRef, MENU_BAR_MOUSELEAVE_DELAY_MS)}
        sx={{
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
          WebkitAppRegion: 'no-drag' as any,
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          },
        }}
      >
        Help
      </Box>
      <Menu
        anchorEl={helpMenuAnchor}
        open={Boolean(helpMenuAnchor)}
        onClose={() => setHelpMenuAnchor(null)}
        autoFocus={false}
        slotProps={{
          paper: {
            onMouseEnter: () => clearMenuTimeout(helpMenuTimeoutRef),
            onMouseLeave: () => createMenuTimeout(helpMenuTimeoutRef, () => setHelpMenuAnchor(null), helpMenuOpenTimeRef, MENU_MOUSELEAVE_DELAY_MS),
          },
        }}
      >
        <MenuItem onClick={handleOpenHelp}>Help & Documentation</MenuItem>
        <MenuItem onClick={handleStartTutorial}>Start Tutorial</MenuItem>
        <MenuItem onClick={handleOpenFAQ}>FAQ</MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleOpenResources}>Developer Resources</MenuItem>
      </Menu>

      {/* Window Controls */}
      <Box
        sx={{
          display: 'flex',
          gap: '0px',
          marginLeft: 'auto',
          WebkitAppRegion: 'no-drag' as any,
        }}
      >
      <IconButton
        size="small"
        onClick={handleMinimize}
        sx={{
          color: 'var(--text-secondary)',
          padding: '4px',
          borderRadius: '2px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        <MinimizeIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={handleMaximize}
        sx={{
          color: 'var(--text-secondary)',
          padding: '4px',
          borderRadius: '2px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        <MaximizeIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={handleClose}
        sx={{
          color: 'var(--text-secondary)',
          padding: '4px',
          borderRadius: '2px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            color: '#ff4444',
            boxShadow: '0 2px 4px rgba(255, 0, 0, 0.2)',
          },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      </Box>
    </Box>
  )
}
