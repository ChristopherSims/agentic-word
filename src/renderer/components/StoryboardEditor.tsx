import React, { useState, useEffect, useCallback, useRef, type FC } from 'react'
import { Box, TextField, IconButton, Tooltip, Typography, Tabs, Tab, Dialog, DialogTitle, DialogContent, IconButton as MuiIconButton } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import CloseIcon from '@mui/icons-material/Close'
import { useAppStore } from '../store/app-store'

/** Simple markdown to HTML renderer */
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
  const { storyboardOpen, storyboardFilePath, closeStoryboardPopup, addToast } = useAppStore()

  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const loadedRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const contentRef = useRef(content)

  // Track latest content for cleanup (auto-save on unmount)
  contentRef.current = content

  const filePath = storyboardFilePath || 'Untitled'
  const displayName = storyboardFilePath ? storyboardFilePath.split(/[\\/]/).pop() || 'Untitled' : 'Untitled'

  // Load storyboard content when popup opens
  useEffect(() => {
    if (!storyboardOpen) return
    if (loadedRef.current === filePath) return

    if (storyboardFilePath) {
      window.wordapp?.storyboard.read(storyboardFilePath).then((result: any) => {
        if (!mountedRef.current) return
        const sbContent = result?.content || ''
        setContent(sbContent)
        loadedRef.current = filePath
      }).catch(() => {
        if (!mountedRef.current) return
        setContent('')
        loadedRef.current = filePath
      })
    } else {
      setContent('')
      loadedRef.current = filePath
    }
  }, [storyboardOpen, filePath])

  const save = useCallback(async () => {
    if (!storyboardFilePath) {
      addToast('warning', 'Save the document first to persist the storyboard')
      return
    }
    try {
      await window.wordapp?.storyboard.write(storyboardFilePath, contentRef.current)
      if (mountedRef.current) {
        addToast('success', 'Storyboard saved')
      }
    } catch (err) {
      if (mountedRef.current) {
        addToast('error', `Failed to save storyboard: ${(err as Error).message}`)
      }
    }
  }, [storyboardFilePath, addToast])

  // Auto-save on change with 2s debounce
  const handleChange = useCallback((value: string) => {
    setContent(value)
    if (!storyboardFilePath) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      try {
        await window.wordapp?.storyboard.write(storyboardFilePath, value)
      } catch { /* silent */ }
    }, 2000)
  }, [storyboardFilePath])

  // Cleanup on unmount: flush pending auto-save, clear timer
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        // Flush any pending content before unmount
        if (storyboardFilePath && contentRef.current) {
          window.wordapp?.storyboard.write(storyboardFilePath, contentRef.current).catch(() => {})
        }
      }
    }
  }, [storyboardFilePath])

  // Ctrl+S to save — stable reference, no re-registration
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!storyboardOpen) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [storyboardOpen])

  // Esc to close — stable reference
  const closeRef = useRef(closeStoryboardPopup)
  closeRef.current = closeStoryboardPopup

  useEffect(() => {
    if (!storyboardOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [storyboardOpen])

  if (!storyboardOpen) return null

  const isSplit = viewMode === 'split'

  return (
    <Dialog
      open={storyboardOpen}
      onClose={closeStoryboardPopup}
      maxWidth={false}
      fullWidth
      scroll="paper"
      sx={{
        '& .MuiDialog-container': { height: '100%', alignItems: 'flex-start' },
        '& .MuiDialog-paper': {
          height: '92vh',
          maxHeight: '95vh',
          mx: 2,
          mt: 2,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mr: 'auto' }}>
          <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'var(--accent-muted)', color: 'var(--accent)', border: 1, borderColor: 'var(--accent)', fontSize: '0.8rem', mr: 1 }}>Storyboard</Box>
          {displayName}
        </Typography>

        <Tabs value={viewMode} onChange={(_, v) => setViewMode(v)}
          sx={{ minHeight: 0, '& .MuiTab-root': { minHeight: 28, py: 0, fontSize: 11, textTransform: 'none' } }}
        >
          <Tab label="Edit" value="edit" />
          <Tab label="Preview" value="preview" />
          <Tab label="Split" value="split" />
        </Tabs>

        <Tooltip title="Save (Ctrl+S)">
          <IconButton onClick={save} sx={{ p: 1 }}>
            <SaveIcon />
          </IconButton>
        </Tooltip>
        <MuiIconButton onClick={closeStoryboardPopup} sx={{ p: 1 }}>
          <CloseIcon />
        </MuiIconButton>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, display: 'flex', overflow: 'hidden', p: 0, minHeight: 0 }}>
        {(viewMode === 'edit' || isSplit) && (
          <Box sx={{ flex: isSplit ? 1 : undefined, width: isSplit ? '50%' : '100%', height: '100%' }}>
            <TextField
              multiline fullWidth
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={`# Storyboard\n\n## Arc\n- Genre:\n- Tone:\n\n## Chapters\n\n### Chapter 1\n- Status: outline\n`}
              sx={{
                height: '100%',
                '& .MuiInputBase-root': { height: '100%', fontFamily: '"Cascadia Code", monospace', fontSize: 13, lineHeight: 1.6, bgcolor: 'var(--bg-primary)' },
                '& .MuiInputBase-input': { height: '100% !important', overflow: 'auto !important' },
                '& fieldset': { border: 'none' },
              }}
            />
          </Box>
        )}

        {(viewMode === 'preview' || isSplit) && (
          <Box sx={{
            flex: isSplit ? 1 : undefined, width: isSplit ? '50%' : '100%', height: '100%',
            overflow: 'auto', px: 3, py: 2,
            ...(isSplit ? { borderLeft: 1, borderColor: 'divider' } : {}),
          }}>
            {content ? (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                style={{ fontFamily: 'var(--font-editor)', fontSize: 14, lineHeight: 1.7 }} />
            ) : (
              <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic', mt: 2 }}>
                Start writing your storyboard in the Edit tab...
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}