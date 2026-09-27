import React, { useState, useEffect, useCallback, useRef, type FC } from 'react'
import { Box, TextField, IconButton, Tooltip, Typography, Tabs, Tab, Dialog, DialogTitle, DialogContent, IconButton as MuiIconButton } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import RefreshIcon from '@mui/icons-material/Refresh'
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
  const saveTimerRef = useRef<number | undefined>(undefined)
  // Content as last loaded (or saved) from disk. Autosave refuses to write
  // when this no longer matches disk (the agent rewrote it behind the editor)
  // so stale editor state can never clobber an agent storyboard_update.
  const baselineRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  // True when the agent rewrote the file while unsaved edits were pending:
  // autosave is blocked and a reload affordance is shown.
  const [diverged, setDiverged] = useState(false)

  const filePath = storyboardFilePath || 'Untitled'
  const displayName = storyboardFilePath ? storyboardFilePath.split(/[\\/]/).pop() || 'Untitled' : 'Untitled'

  // Read the storyboard from disk into the editor state.
  const loadFromDisk = useCallback(async (showToast: boolean) => {
    if (!storyboardFilePath) return
    try {
      const result = await window.wordapp?.storyboard.read(storyboardFilePath)
      const sbContent = result?.content || ''
      setContent(sbContent)
      baselineRef.current = sbContent
      dirtyRef.current = false
      loadedRef.current = filePath
      setDiverged(false)
      if (showToast) addToast('success', 'Storyboard updated by agent — reloaded')
    } catch {
      if (showToast) addToast('warning', 'Storyboard changed on disk but could not be reloaded')
    }
  }, [storyboardFilePath, filePath, addToast])

  // Load storyboard content when popup opens
  useEffect(() => {
    if (!storyboardOpen) return
    if (loadedRef.current === filePath) return

    if (storyboardFilePath) {
      void loadFromDisk(false)
    } else {
      setContent('')
      loadedRef.current = filePath
    }
  }, [storyboardOpen, filePath, loadFromDisk])

  // The agent's storyboard_update tool rewrites the file behind the editor.
  // Reload automatically when there are no unsaved user edits; otherwise the
  // agent's version stays on disk and the editor flags the divergence instead
  // of silently overwriting it via autosave.
  useEffect(() => {
    const unsub = window.wordapp?.on('storyboard-updated', (data: { path: string }) => {
      if (!storyboardOpen || !storyboardFilePath) return
      // The event carries the storyboard path (doc.storyboard.md); the editor
      // holds the document path — derive the companion path for comparison.
      const sbPath = storyboardFilePath.replace(/\.\w+$/, '.storyboard.md')
      // Windows paths: same file can arrive with different casing/separators.
      if (data.path.toLowerCase().replace(/\//g, '\\') !== sbPath.toLowerCase().replace(/\//g, '\\')) return
      if (dirtyRef.current) {
        addToast('warning', 'Storyboard updated by agent while you had unsaved edits — reload to take theirs, or save to keep yours')
        baselineRef.current = null // autosave is blocked until resolved
        setDiverged(true)
        return
      }
      void loadFromDisk(true)
    })
    return () => unsub?.()
  }, [storyboardOpen, storyboardFilePath, loadFromDisk, addToast])

  const save = useCallback(async () => {
    if (!storyboardFilePath) {
      addToast('warning', 'Save the document first to persist the storyboard')
      return
    }
    if (baselineRef.current === null) {
      // Explicit save while diverged is a deliberate choice: keep the user's
      // version and discard the agent's on-disk update.
      baselineRef.current = content
    }
    try {
      await window.wordapp?.storyboard.write(storyboardFilePath, content)
      baselineRef.current = content
      dirtyRef.current = false
      setDiverged(false)
      addToast('success', 'Storyboard saved')
    } catch (err) {
      addToast('error', `Failed to save storyboard: ${(err as Error).message}`)
    }
  }, [content, storyboardFilePath])

  // Auto-save on change with 2s debounce. Blocked while the disk baseline is
  // unresolved (agent wrote behind us with user edits pending) so the stale
  // editor copy cannot clobber the agent's file.
  const handleChange = useCallback((value: string) => {
    setContent(value)
    dirtyRef.current = value !== baselineRef.current
    if (!storyboardFilePath || baselineRef.current === null) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      if (baselineRef.current === null) return
      window.wordapp?.storyboard.write(storyboardFilePath, value)
        .then(() => { baselineRef.current = value; dirtyRef.current = false; setDiverged(false) })
        .catch(() => {})
    }, 2000)
  }, [storyboardFilePath])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // Ctrl+S to save
  useEffect(() => {
    if (!storyboardOpen) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save, storyboardOpen])

  // Esc to close
  useEffect(() => {
    if (!storyboardOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeStoryboardPopup()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [storyboardOpen, closeStoryboardPopup])

  if (!storyboardOpen) return null

  const isSplit = viewMode === 'split'

  return (
    <Dialog
      open={storyboardOpen}
      onClose={closeStoryboardPopup}
      fullWidth
      maxWidth={false}
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
          <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 0.75, bgcolor: 'var(--accent-muted)', color: 'var(--accent)', border: 1, borderColor: 'var(--accent)', fontSize: '0.8rem', mr: 1 }}>Storyboard</Box>
          {displayName}
        </Typography>

        <Tabs value={viewMode} onChange={(_, v) => setViewMode(v)}
          sx={{ minHeight: 0, '& .MuiTab-root': { minHeight: 28, py: 0, fontSize: 12, textTransform: 'none' } }}
        >
          <Tab label="Edit" value="edit" />
          <Tab label="Preview" value="preview" />
          <Tab label="Split" value="split" />
        </Tabs>

        {diverged && (
          <Tooltip title="Reload the agent's version from disk (discards your unsaved edits)">
            <IconButton onClick={() => void loadFromDisk(true)} sx={{ p: 1 }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        )}
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
