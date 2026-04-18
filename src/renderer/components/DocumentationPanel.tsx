import React, { type FC, useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogContent, List, ListItem, ListItemButton, ListItemText, Box, CircularProgress, Alert, TextField, InputAdornment, Divider } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { MarkdownRenderer } from './MarkdownRenderer'

interface Doc {
  id: string
  title: string
  filename: string
}

interface DocumentationPanelProps {
  open: boolean
  onClose: () => void
}

export const DocumentationPanel: FC<DocumentationPanelProps> = ({ open, onClose }) => {
  const [docs, setDocs] = useState<Doc[]>([])
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Force close if user presses Escape or clicks backdrop
  const handleClose = () => {
    setLoading(false)
    setError(null)
    setContent('')
    setSelectedDoc(null)
    setDocs([])
    onClose()
  }

  // Load list of documentation files
  useEffect(() => {
    if (!open) return

    let isMounted = true

    const loadDocs = async () => {
      try {
        const result = await window.wordapp.docs.list()
        
        if (!isMounted) return
        
        if (result.success) {
          setDocs(result.docs)
          setError(null)
          // Auto-select first doc
          if (result.docs.length > 0) {
            setSelectedDoc(result.docs[0])
          } else {
            setError('No documentation files found')
            setSelectedDoc(null)
          }
        } else {
          setError(result.error || 'Failed to load documentation')
          setSelectedDoc(null)
        }
      } catch (err) {
        if (isMounted) {
          const errMsg = (err as Error).message
          setError(`Error loading documentation: ${errMsg}`)
          setSelectedDoc(null)
        }
      }
    }

    loadDocs()
    return () => {
      isMounted = false
    }
  }, [open])

  // Load selected document content
  useEffect(() => {
    if (!selectedDoc) return

    let isMounted = true

    const loadContent = async () => {
      setLoading(true)
      setError(null)
      setContent('')
      
      try {
        if (!window.wordapp || !window.wordapp.docs || !window.wordapp.docs.read) {
          throw new Error('Documentation API is not available')
        }

        const result = await Promise.race([
          window.wordapp.docs.read(selectedDoc.filename),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Documentation load timeout')), 10000)
          )
        ])
        
        if (!isMounted) return
        
        if (result && result.success) {
          setContent(result.content || '')
        } else {
          const errorMsg = result?.error || 'Failed to load document'
          setError(errorMsg)
          setContent('')
        }
      } catch (err) {
        if (isMounted) {
          const errMsg = (err as Error).message
          console.error('[DocumentationPanel] Error loading doc:', errMsg)
          setError(`Error loading document: ${errMsg}`)
          setContent('')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadContent()
    return () => {
      isMounted = false
    }
  }, [selectedDoc])

  const filteredDocs = docs.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="lg" 
      fullWidth 
      disableEscapeKeyDown={false}
      sx={{ '& .MuiDialog-paper': { minHeight: '80vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <span>Documentation</span>
        <CloseIcon
          sx={{ cursor: 'pointer', fontSize: 20, '&:hover': { opacity: 0.7 } }}
          onClick={handleClose}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClose() }}
        />
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ p: 0, display: 'flex', height: 'calc(80vh - 64px)' }}>
        {/* Left sidebar with doc list */}
        <Box sx={{ width: 280, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ p: 2, flexShrink: 0 }}>
            <TextField
              size="small"
              placeholder="Search docs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  </InputAdornment>
                )
              }}
              variant="outlined"
            />
          </Box>

          {error && !selectedDoc && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error" sx={{ fontSize: 11 }}>
                {error}
              </Alert>
            </Box>
          )}

          <List sx={{ flex: 1, overflow: 'auto' }}>
            {filteredDocs.map((doc) => (
              <ListItem key={doc.id} disablePadding>
                <ListItemButton
                  selected={selectedDoc?.id === doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  sx={{ py: 1, px: 2 }}
                >
                  <ListItemText
                    primary={doc.title}
                    primaryTypographyProps={{ variant: 'caption', sx: { fontSize: 12, fontWeight: selectedDoc?.id === doc.id ? 600 : 400 } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Right content area */}
        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <CircularProgress size={40} />
            </Box>
          )}

          {error && selectedDoc && (
            <Box sx={{ p: 3 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}

          {!loading && !error && selectedDoc && (
            <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
              <MarkdownRenderer content={content} />
            </Box>
          )}

          {!loading && !error && !selectedDoc && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'text.secondary' }}>
              Select a documentation topic to view
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
