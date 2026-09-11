import React, { type FC, useState } from 'react'
import { Box, IconButton, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { useAppStore } from '../store/app-store'

type CloseMode = 'single' | 'others' | 'right' | 'all'

export const TabBar: FC = () => {
  const { docTabs, activeTabId, switchDocTab, closeDocTab, addDocTab, reorderDocTabs } = useAppStore()
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const [confirmClose, setConfirmClose] = useState<{ mode: CloseMode; tabId: string; dirty: string[] } | null>(null)

  const tabsForMode = (mode: CloseMode, tabId: string) => {
    switch (mode) {
      case 'single': return docTabs.filter((t) => t.id === tabId)
      case 'others': return docTabs.filter((t) => t.id !== tabId)
      case 'right': {
        const idx = docTabs.findIndex((t) => t.id === tabId)
        return idx === -1 ? [] : docTabs.slice(idx + 1)
      }
      case 'all':
      default:
        return [...docTabs]
    }
  }

  const performClose = (mode: CloseMode, tabId: string) => {
    tabsForMode(mode, tabId).forEach((t) => closeDocTab(t.id))
  }

  const requestClose = (mode: CloseMode, tabId: string) => {
    const dirty = tabsForMode(mode, tabId).filter((t) => t.isDirty).map((t) => t.title)
    if (dirty.length === 0) {
      performClose(mode, tabId)
      return
    }
    setConfirmClose({ mode, tabId, dirty })
  }

  const focusTab = (tabId: string) => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-tab-id="${tabId}"]`)?.focus()
    })
  }

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = docTabs.findIndex((t) => t.id === activeTabId)
    if (idx === -1) return

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const dir = e.key === 'ArrowRight' ? 1 : -1
      if (e.altKey) {
        const target = idx + dir
        if (target >= 0 && target < docTabs.length) reorderDocTabs(idx, target)
        return
      }
      const next = (idx + dir + docTabs.length) % docTabs.length
      switchDocTab(docTabs[next].id)
      focusTab(docTabs[next].id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      switchDocTab(docTabs[0].id)
      focusTab(docTabs[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = docTabs[docTabs.length - 1]
      switchDocTab(last.id)
      focusTab(last.id)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      requestClose('single', activeTabId)
    }
  }


  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (tabId: string) => {
    setDragOverTabId(tabId)
  }

  const handleDragLeave = () => {
    setDragOverTabId(null)
  }

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    if (draggedTabId && draggedTabId !== targetTabId) {
      const draggedIndex = docTabs.findIndex(t => t.id === draggedTabId)
      const targetIndex = docTabs.findIndex(t => t.id === targetTabId)
      reorderDocTabs(draggedIndex, targetIndex)
    }
    setDraggedTabId(null)
    setDragOverTabId(null)
  }

  const handleDragEnd = () => {
    setDraggedTabId(null)
    setDragOverTabId(null)
  }

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  const handleCloseOthers = () => {
    if (!contextMenu) return
    requestClose('others', contextMenu.tabId)
    setContextMenu(null)
  }

  const handleCloseAll = () => {
    requestClose('all', activeTabId)
    setContextMenu(null)
  }

  const handleCloseToRight = () => {
    if (!contextMenu) return
    requestClose('right', contextMenu.tabId)
    setContextMenu(null)
  }

  const handleRevealInExplorer = async () => {
    if (!contextMenu) return
    const tab = docTabs.find(t => t.id === contextMenu.tabId)
    if (tab?.filePath) {
      try {
        await window.wordapp?.file.revealInExplorer?.(tab.filePath)
      } catch {
        // fallback: not all platforms support this
      }
    }
    setContextMenu(null)
  }

  return (
    <>
      <Box 
        role="tablist"
        aria-label="Open documents"
        onKeyDown={handleTabKeyDown}
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          bgcolor: 'var(--ui-surface)',
          minHeight: 40,
          px: 0.5,
          pt: 0.5,
          pb: 0,
          flexShrink: 0, 
          gap: 0,
          overflow: 'auto',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            height: '6px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'var(--border)',
            borderRadius: 0.5,
            '&:hover': {
              background: 'var(--text-secondary)',
            },
          },
        }}
      >
        {docTabs.map((tab) => (
          <Box
            key={tab.id}
            data-tab-id={tab.id}
            role="tab"
            aria-selected={activeTabId === tab.id}
            tabIndex={activeTabId === tab.id ? 0 : -1}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(tab.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, tab.id)}
            onDragEnd={handleDragEnd}
            onMouseEnter={() => setHoveredTabId(tab.id)}
            onMouseLeave={() => setHoveredTabId(null)}
            onClick={() => switchDocTab(tab.id)}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); requestClose('single', tab.id) } }}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            aria-label={tab.isDirty ? `${tab.title}, unsaved changes` : tab.title}
            title={tab.isDirty ? `${tab.title} — unsaved changes` : tab.title}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 1,
              minHeight: 32,
              bgcolor: activeTabId === tab.id ? 'var(--ui-accent-soft)' : 'transparent',
              borderTop: '2px solid transparent',
              borderLeft: '1px solid transparent',
              borderRight: '1px solid transparent',
              borderRadius: activeTabId === tab.id ? '4px 4px 0 0' : '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease, transform 0.15s ease',
              flexShrink: 0,
              fontSize: '0.85rem',
              fontWeight: activeTabId === tab.id ? 500 : 400,
              color: activeTabId === tab.id ? 'var(--ui-accent)' : 'var(--ui-text-secondary)',
              position: 'relative',
              opacity: draggedTabId === tab.id ? 0.5 : 1,
              transform: dragOverTabId === tab.id && draggedTabId ? 'scale(1.02)' : 'scale(1)',
              '&:hover': {
                bgcolor: activeTabId === tab.id ? 'var(--ui-accent-soft)' : 'color-mix(in oklab, var(--ui-text) 6%, transparent)',
                color: activeTabId === tab.id ? 'var(--ui-accent)' : 'var(--ui-text)',
              },
              userSelect: 'none',
              WebkitUserDrag: 'element',
            }}
          >
            {tab.isDirty && (
              <FiberManualRecordIcon 
                aria-hidden="true"
                sx={{ 
                  fontSize: '0.5rem', 
                  color: 'warning.main',
                  flexShrink: 0,
                }} 
              />
            )}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
              {tab.title}
            </span>
            {docTabs.length > 1 && (
              <IconButton
                size="small"
                onClick={(e) => { 
                  e.stopPropagation()
                  requestClose('single', tab.id)
                }}
                sx={{ 
                  ml: 'auto',
                  p: 0.25, 
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  opacity: hoveredTabId === tab.id || activeTabId === tab.id ? 1 : 0,
                  visibility: hoveredTabId === tab.id || activeTabId === tab.id ? 'visible' : 'hidden',
                  transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease, transform 0.15s ease',
                  flexShrink: 0,
                  '&:hover': { 
                    color: 'var(--ui-danger)',
                    bgcolor: 'color-mix(in oklab, var(--ui-danger) 14%, transparent)',
                  },
                }}
              >
                <CloseIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            )}
          </Box>
        ))}

        <Tooltip title="New Tab (Ctrl+T)">
          <IconButton 
            size="small" 
            onClick={() => addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })} 
            sx={{ 
              p: 0.75,
              ml: 0.5,
              color: 'var(--text-secondary)',
              flexShrink: 0,
              '&:hover': {
                bgcolor: 'var(--bg-surface)',
                color: 'var(--accent)',
              },
              transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, transform 0.2s ease',
            }}
          >
            <AddIcon sx={{ fontSize: '1.2rem' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Right-click context menu */}
      <Menu
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
      >
        <MenuItem onClick={() => { if (contextMenu) requestClose('single', contextMenu.tabId); setContextMenu(null) }}>
          <ListItemIcon><CloseIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Close</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleCloseOthers}>
          <ListItemText>Close Others</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleCloseToRight}>
          <ListItemText>Close to the Right</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleCloseAll}>
          <ListItemText>Close All</ListItemText>
        </MenuItem>
        {contextMenu && docTabs.find(t => t.id === contextMenu.tabId)?.filePath && (
          <MenuItem onClick={handleRevealInExplorer}>
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Reveal in File Explorer</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Dialog open={!!confirmClose} onClose={() => setConfirmClose(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            These documents have unsaved changes and will be closed without saving:
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0 }}>
            {confirmClose?.dirty.map((title, i) => (
              <li key={i}><Typography variant="body2">{title}</Typography></li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClose(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const pending = confirmClose
              setConfirmClose(null)
              if (pending) performClose(pending.mode, pending.tabId)
            }}
          >
            Discard &amp; Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
