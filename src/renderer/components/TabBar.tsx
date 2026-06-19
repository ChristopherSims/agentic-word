import React, { type FC, useState } from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import ArticleIcon from '@mui/icons-material/Article'
import { useAppStore } from '../store/app-store'

export const TabBar: FC = () => {
  const { docTabs, activeTabId, switchDocTab, closeDocTab, addDocTab, reorderDocTabs, openStoryboardPopup, currentFilePath } = useAppStore()
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null)

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

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        bgcolor: 'var(--bg-secondary)',
        minHeight: 40,
        px: 0.5,
        pt: 0.5,
        pb: 0,
        flexShrink: 0, 
        gap: 0.5,
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
          borderRadius: '3px',
          '&:hover': {
            background: 'var(--text-secondary)',
          },
        },
      }}
    >
      {docTabs.map((tab, index) => (
        <Box
          key={tab.id}
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
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            minHeight: 32,
            bgcolor: activeTabId === tab.id ? 'var(--bg-primary)' : 'transparent',
            border: activeTabId === tab.id ? 'none' : '1px solid transparent',
            borderRadius: activeTabId === tab.id ? '6px 6px 0 0' : '6px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            flexShrink: 0,
            fontSize: '0.9rem',
            fontWeight: activeTabId === tab.id ? 500 : 400,
            color: activeTabId === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            position: 'relative',
            opacity: draggedTabId === tab.id ? 0.5 : 1,
            transform: dragOverTabId === tab.id && draggedTabId ? 'scale(1.02)' : 'scale(1)',
            background: dragOverTabId === tab.id && draggedTabId ? 'var(--accent)' : undefined,
            '&:hover': {
              bgcolor: activeTabId === tab.id ? 'var(--bg-primary)' : 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxShadow: activeTabId !== tab.id ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
            },
            userSelect: 'none',
            WebkitUserDrag: 'element',
          }}
        >
          {tab.isDirty && (
            <FiberManualRecordIcon 
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
                closeDocTab(tab.id) 
              }}
              sx={{ 
                ml: 'auto',
                p: 0.25, 
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                opacity: hoveredTabId === tab.id || activeTabId === tab.id ? 1 : 0,
                visibility: hoveredTabId === tab.id || activeTabId === tab.id ? 'visible' : 'hidden',
                transition: 'all 0.15s ease',
                flexShrink: 0,
                '&:hover': { 
                  color: 'error.main',
                  bgcolor: 'rgba(255, 0, 0, 0.1)',
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
            ml: 'auto',
            color: 'var(--text-secondary)',
            flexShrink: 0,
            '&:hover': {
              bgcolor: 'var(--bg-surface)',
              color: 'var(--accent)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <AddIcon sx={{ fontSize: '1.2rem' }} />
        </IconButton>
      </Tooltip>
      {currentFilePath && (
        <Tooltip title="Storyboard (📋)">
          <IconButton
            size="small"
            onClick={() => openStoryboardPopup(currentFilePath)}
            sx={{
              p: 0.75,
              color: docTabs.some(t => t.type === 'storyboard' && t.parentFilePath === currentFilePath)
                ? 'var(--accent)'
                : 'var(--text-secondary)',
              flexShrink: 0,
              '&:hover': {
                bgcolor: 'var(--bg-surface)',
                color: 'var(--accent)',
              },
              transition: 'all 0.2s ease',
            }}
          >
            <ArticleIcon sx={{ fontSize: '1.2rem' }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
