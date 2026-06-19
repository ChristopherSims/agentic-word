import React, { useState, useEffect, useCallback, useRef, type FC } from 'react'
import { Box, TextField, IconButton, Tooltip, Typography, Tabs, Tab } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { useAppStore } from '../store/app-store'

/** Simple markdown to HTML renderer */
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // escape HTML
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (line) => line.startsWith('<') ? line : `<p>${line}</p>`)
}

export const StoryboardEditor: FC = () => {
  const { docTabs, activeTabId, updateDocTab, addToast } = useAppStore()
  const activeTab = docTabs.find((t) => t.id === activeTabId)

  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const loadedRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Only render if active tab is a storyboard tab
  if (!activeTab || activeTab.type !== 'storyboard' || !activeTab.parentFilePath) {
    return null
  }

  // Load storyboard content from file on mount / when tab changes
  useEffect(() => {
    const parentPath = activeTab.parentFilePath!
    if (loadedRef.current === parentPath) return // Already loaded for this file

    window.wordapp?.storyboard.read(parentPath).then((result: any) => {
      const sbContent = result?.content || ''
      setContent(sbContent)
      loadedRef.current = parentPath
      // Update tab content in store so it persists across tab switches
      updateDocTab(activeTab.id, { content: sbContent })
    }).catch(() => {
      setContent('')
      loadedRef.current = parentPath
    })
  }, [activeTab.id, activeTab.parentFilePath])

  // Sync content from store when switching back to this tab
  useEffect(() => {
    if (activeTab.content && loadedRef.current === activeTab.parentFilePath) {
      setContent(activeTab.content)
    }
  }, [activeTab.content])

  const save = useCallback(async () => {
    const parentPath = activeTab.parentFilePath!
    try {
      await window.wordapp?.storyboard.write(parentPath, content)
      updateDocTab(activeTab.id, { isDirty: false, content })
      addToast('success', 'Storyboard saved')
    } catch (err) {
      addToast('error', `Failed to save storyboard: ${(err as Error).message}`)
    }
  }, [content, activeTab.id, activeTab.parentFilePath])

  // Auto-save on change with 2s debounce
  const handleChange = useCallback((value: string) => {
    setContent(value)
    updateDocTab(activeTab.id, { isDirty: true, content: value })

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const parentPath = activeTab.parentFilePath!
      window.wordapp?.storyboard.write(parentPath, value).catch(() => {})
      updateDocTab(activeTab.id, { isDirty: false, content: value })
    }, 2000)
  }, [activeTab.id, activeTab.parentFilePath])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  const isSplit = viewMode === 'split'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5,
        borderBottom: 1, borderColor: 'divider', bgcolor: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        <Typography variant="caption" sx={{ fontWeight: 600, mr: 'auto' }}>
          📋 Storyboard
        </Typography>

        <Tabs
          value={viewMode}
          onChange={(_, v) => setViewMode(v)}
          sx={{ minHeight: 0, '& .MuiTab-root': { minHeight: 28, py: 0, fontSize: 11, textTransform: 'none' } }}
        >
          <Tab label="Edit" value="edit" />
          <Tab label="Preview" value="preview" />
          <Tab label="Split" value="split" />
        </Tabs>

        <Tooltip title="Save (Ctrl+S)">
          <IconButton size="small" onClick={save}>
            <SaveIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Editor / Preview */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {(viewMode === 'edit' || isSplit) && (
          <Box sx={{ flex: isSplit ? 1 : undefined, width: isSplit ? '50%' : '100%', height: '100%' }}>
            <TextField
              multiline
              fullWidth
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={`# Storyboard\n\n## Arc\n- Genre:\n- Tone:\n\n## Chapters\n\n### Chapter 1\n- Status: outline\n- Summary:\n`}
              sx={{
                height: '100%',
                '& .MuiInputBase-root': {
                  height: '100%',
                  fontFamily: '"Cascadia Code", "Fira Code", monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                  bgcolor: 'var(--bg-primary)',
                },
                '& .MuiInputBase-input': {
                  height: '100% !important',
                  overflow: 'auto !important',
                },
                '& fieldset': { border: 'none' },
              }}
            />
          </Box>
        )}

        {(viewMode === 'preview' || isSplit) && (
          <Box sx={{
            flex: isSplit ? 1 : undefined,
            width: isSplit ? '50%' : '100%',
            height: '100%',
            overflow: 'auto',
            px: 3,
            py: 2,
            ...(isSplit ? { borderLeft: 1, borderColor: 'divider' } : {}),
          }}>
            {content ? (
              <div
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                style={{ fontFamily: 'var(--font-editor)', fontSize: 14, lineHeight: 1.7 }}
              />
            ) : (
              <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic', mt: 2 }}>
                Start writing your storyboard in the Edit tab...
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
