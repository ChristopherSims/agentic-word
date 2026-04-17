import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  Divider,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress
} from '@mui/material'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import GoogleIcon from '@mui/icons-material/Public'
import InfoIcon from '@mui/icons-material/Info'
import {
  importFromGoogleDocs,
  importFromNotion,
  importFromPDF,
  importFromWebPage,
  importFromMarkdown,
  getImportSourceInfo,
  type ImportResult
} from '../utils/multi-format-import'

export type ImportSource = 'google-docs' | 'notion' | 'pdf' | 'webpage' | 'markdown'

export interface ImportDialogProps {
  open: boolean
  onClose: () => void
  onImport: (content: string, title?: string) => Promise<void>
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ open, onClose, onImport }) => {
  const [source, setSource] = useState<ImportSource>('markdown')
  const [isImporting, setIsImporting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  // Input fields for different sources
  const [googleDocsUrl, setGoogleDocsUrl] = useState('')
  const [notionUrl, setNotionUrl] = useState('')
  const [webUrl, setWebUrl] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [markdownFile, setMarkdownFile] = useState<File | null>(null)

  const sourceInfo = getImportSourceInfo(source)

  const handleSourceChange = (newSource: ImportSource) => {
    setSource(newSource)
    setErrors([])
    setWarnings([])
  }

  const handleFileSelect = (files: FileList | null, fileType: 'pdf' | 'markdown') => {
    if (!files || files.length === 0) return

    const file = files[0]

    if (fileType === 'pdf' && !file.name.endsWith('.pdf')) {
      setErrors(['Please select a valid PDF file'])
      return
    }

    if (fileType === 'markdown' && !file.name.match(/\.(md|markdown|txt)$/)) {
      setErrors(['Please select a valid Markdown or text file'])
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrors(['File size must be less than 50MB'])
      return
    }

    if (fileType === 'pdf') {
      setPdfFile(file)
    } else {
      setMarkdownFile(file)
    }

    setErrors([])
  }

  const handleImport = async () => {
    setErrors([])
    setWarnings([])
    setIsImporting(true)

    let result: ImportResult | null = null

    try {
      switch (source) {
        case 'google-docs':
          if (!googleDocsUrl.trim()) {
            setErrors(['Please enter a Google Docs URL'])
            setIsImporting(false)
            return
          }
          result = await importFromGoogleDocs(googleDocsUrl)
          break

        case 'notion':
          if (!notionUrl.trim()) {
            setErrors(['Please enter a Notion URL'])
            setIsImporting(false)
            return
          }
          result = await importFromNotion(notionUrl)
          break

        case 'pdf':
          if (!pdfFile) {
            setErrors(['Please select a PDF file'])
            setIsImporting(false)
            return
          }
          const pdfBuffer = await pdfFile.arrayBuffer()
          result = await importFromPDF(pdfBuffer)
          break

        case 'webpage':
          if (!webUrl.trim()) {
            setErrors(['Please enter a webpage URL'])
            setIsImporting(false)
            return
          }
          result = await importFromWebPage(webUrl)
          break

        case 'markdown':
          if (!markdownFile) {
            setErrors(['Please select a Markdown file'])
            setIsImporting(false)
            return
          }
          const markdownContent = await markdownFile.text()
          result = importFromMarkdown(markdownContent)
          break
      }

      if (result && !result.success) {
        setErrors([result.error || 'Import failed'])
      } else if (result) {
        setWarnings(result.warnings)
        await onImport(result.content, result.title)
        onClose()
      }
    } catch (err) {
      setErrors([`Import error: ${(err as Error).message}`])
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Document</DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {errors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </Alert>
        )}

        {warnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* Source Selection */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <FormLabel component="legend">Import From</FormLabel>
          <RadioGroup value={source} onChange={(e) => handleSourceChange(e.target.value as ImportSource)}>
            <FormControlLabel value="markdown" control={<Radio />} label="Markdown File" />
            <FormControlLabel value="pdf" control={<Radio />} label="PDF File" />
            <FormControlLabel value="google-docs" control={<Radio />} label="Google Docs" />
            <FormControlLabel value="notion" control={<Radio />} label="Notion" />
            <FormControlLabel value="webpage" control={<Radio />} label="Web Page" />
          </RadioGroup>
        </FormControl>

        <Divider sx={{ my: 2 }} />

        {/* Source-Specific Content */}
        <Stack spacing={2}>
          {source === 'markdown' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Select Markdown File
              </Typography>
              <Box sx={{ border: '2px dashed #ccc', borderRadius: 1, p: 2, textAlign: 'center' }}>
                <input
                  type="file"
                  accept=".md,.markdown,.txt"
                  onChange={(e) => handleFileSelect(e.target.files, 'markdown')}
                  style={{ display: 'none' }}
                  id="markdown-input"
                />
                <label htmlFor="markdown-input" style={{ cursor: 'pointer', display: 'block' }}>
                  <FileUploadIcon sx={{ fontSize: 40, color: '#999', mb: 1 }} />
                  <Typography variant="body2" color="textSecondary">
                    {markdownFile ? `Selected: ${markdownFile.name}` : 'Click to select Markdown file'}
                  </Typography>
                </label>
              </Box>
            </>
          )}

          {source === 'pdf' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Select PDF File
              </Typography>
              <Box sx={{ border: '2px dashed #ccc', borderRadius: 1, p: 2, textAlign: 'center' }}>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => handleFileSelect(e.target.files, 'pdf')}
                  style={{ display: 'none' }}
                  id="pdf-input"
                />
                <label htmlFor="pdf-input" style={{ cursor: 'pointer', display: 'block' }}>
                  <FileUploadIcon sx={{ fontSize: 40, color: '#999', mb: 1 }} />
                  <Typography variant="body2" color="textSecondary">
                    {pdfFile ? `Selected: ${pdfFile.name}` : 'Click to select PDF file'}
                  </Typography>
                </label>
              </Box>
            </>
          )}

          {source === 'google-docs' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Google Docs URL
              </Typography>
              <TextField
                fullWidth
                placeholder="https://docs.google.com/document/d/..."
                value={googleDocsUrl}
                onChange={(e) => setGoogleDocsUrl(e.target.value)}
              />
              <Box sx={{ border: '1px solid #f0f0f0', borderRadius: 1, p: 2, bgcolor: '#fafafa' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Setup Instructions:
                </Typography>
                <List sx={{ py: 0 }}>
                  {sourceInfo.instructions.map((instruction, i) => (
                    <ListItem key={i} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {i + 1}.
                        </Typography>
                      </ListItemIcon>
                      <ListItemText
                        primary={instruction}
                        primaryTypographyProps={{ variant: 'body2' }}
                        sx={{ m: 0 }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          )}

          {source === 'notion' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Notion Page URL
              </Typography>
              <TextField
                fullWidth
                placeholder="https://www.notion.so/..."
                value={notionUrl}
                onChange={(e) => setNotionUrl(e.target.value)}
              />
              <Alert severity="info" icon={<InfoIcon />}>
                Notion integration requires API key setup. For now, please copy and paste content from Notion manually.
              </Alert>
            </>
          )}

          {source === 'webpage' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Webpage URL
              </Typography>
              <TextField
                fullWidth
                placeholder="https://example.com"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
              />
            </>
          )}

          {/* Limitations */}
          {sourceInfo.limitations.length > 0 && (
            <Box sx={{ border: '1px solid #fff3cd', borderRadius: 1, p: 2, bgcolor: '#fffbf0' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#856404', mb: 1 }}>
                ⚠ Limitations:
              </Typography>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#856404' }}>
                {sourceInfo.limitations.map((limitation, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {limitation}
                  </li>
                ))}
              </ul>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={isImporting}>
          Cancel
        </Button>
        <Button onClick={handleImport} variant="contained" color="primary" disabled={isImporting}>
          {isImporting ? <CircularProgress size={24} sx={{ mr: 1 }} /> : null}
          {isImporting ? 'Importing...' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
