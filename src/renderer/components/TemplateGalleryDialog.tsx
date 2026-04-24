import React, { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Grid, Card, CardContent,
  IconButton, TextField, Divider, Chip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import ArticleIcon from '@mui/icons-material/Article'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import ContactPageIcon from '@mui/icons-material/ContactPage'
import AssessmentIcon from '@mui/icons-material/Assessment'
import NotesIcon from '@mui/icons-material/Notes'
import { useAppStore } from '../store/app-store'

const BUILT_IN_ICONS: Record<string, React.ReactNode> = {
  blank: <ArticleIcon fontSize="large" color="action" />,
  letter: <MailOutlineIcon fontSize="large" color="primary" />,
  resume: <ContactPageIcon fontSize="large" color="success" />,
  report: <AssessmentIcon fontSize="large" color="warning" />,
  memo: <NotesIcon fontSize="large" color="info" />,
}

interface TemplateItem {
  name: string
  description: string
  custom?: boolean
}

export default function TemplateGalleryDialog() {
  const open = useAppStore((s) => s.templateGalleryOpen)
  const setOpen = useAppStore((s) => s.setTemplateGalleryOpen)
  const documentContent = useAppStore((s) => s.documentContent)

  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveMode, setSaveMode] = useState(false)

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const list = (await window.wordapp?.template.list()) as TemplateItem[] || []
      setTemplates(list)
    } catch (e) {
      console.error('Failed to load templates', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadTemplates()
  }, [open])

  const handleSelect = async (name: string) => {
    const content = await window.wordapp?.template.get(name)
    if (content) {
      useAppStore.getState().setDocumentContent(content)
      useAppStore.getState().setDocumentTitle(name.charAt(0).toUpperCase() + name.slice(1))
      useAppStore.getState().setCurrentFilePath(null)
      useAppStore.getState().addToast('success', `Loaded template: ${name}`)
      setOpen(false)
    }
  }

  const handleSave = async () => {
    if (!saveName.trim()) return
    const result = await window.wordapp?.template.customSave(saveName.trim(), documentContent)
    if (result?.success) {
      useAppStore.getState().addToast('success', `Template "${saveName}" saved`)
      setSaveName('')
      setSaveMode(false)
      loadTemplates()
    }
  }

  const handleDelete = async (name: string) => {
    const ok = await window.wordapp?.template.customDelete(name)
    if (ok) {
      useAppStore.getState().addToast('success', `Template "${name}" deleted`)
      loadTemplates()
    }
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Template Gallery
        <IconButton onClick={() => setOpen(false)} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* Save-as-template section */}
        {saveMode ? (
          <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Template name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              sx={{ flex: 1 }}
              autoFocus
            />
            <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSave} disabled={!saveName.trim()}>
              Save
            </Button>
            <Button size="small" onClick={() => setSaveMode(false)}>Cancel</Button>
          </Box>
        ) : (
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" startIcon={<SaveIcon />} variant="outlined" onClick={() => setSaveMode(true)}>
              Save Current as Template
            </Button>
          </Box>
        )}

        <Divider sx={{ mb: 2 }} />

        {loading && <Typography variant="body2" color="text.secondary">Loading templates...</Typography>}

        <Grid container spacing={2}>
          {templates.map((t) => {
            const isBuiltIn = !t.custom && Object.keys(BUILT_IN_ICONS).includes(t.name)
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={t.name}>
                <Card
                  variant="outlined"
                  sx={{
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s',
                    '&:hover': { boxShadow: 2 },
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => handleSelect(t.name)}
                >
                  <CardContent sx={{ textAlign: 'center', flexGrow: 1 }}>
                    <Box sx={{ mb: 1 }}>
                      {isBuiltIn ? BUILT_IN_ICONS[t.name] : <ArticleIcon fontSize="large" color="disabled" />}
                    </Box>
                    <Typography variant="subtitle1" sx={{ textTransform: 'capitalize' }}>
                      {t.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t.description}
                    </Typography>
                    {t.custom && <Chip size="small" label="Custom" sx={{ mt: 1 }} />}
                  </CardContent>
                  {t.custom && (
                    <Box sx={{ textAlign: 'right', px: 1, pb: 1 }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => { e.stopPropagation(); handleDelete(t.name) }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Card>
              </Grid>
            )
          })}
        </Grid>

        {templates.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No templates available.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
