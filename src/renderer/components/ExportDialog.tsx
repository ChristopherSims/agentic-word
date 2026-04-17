import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  TextField,
  RadioGroup,
  Radio,
  Select,
  MenuItem,
  Button,
  Box,
  Typography,
  Alert,
  Divider,
  Stack,
  Grid
} from '@mui/material'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { type PdfExportOptions, PAGE_SIZES, validatePdfOptions } from '../utils/pdf-export'
import { validateExportFormat } from '../utils/multi-format-export'

export type ExportFormat = 'pdf' | 'epub' | 'latex' | 'rtf' | 'csv'

export interface ExportDialogProps {
  open: boolean
  onClose: () => void
  onExport: (format: ExportFormat, options: Record<string, unknown>) => Promise<void>
  documentTitle?: string
  contentLength?: number
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  onExport,
  documentTitle = 'Document',
  contentLength = 0
}) => {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [isExporting, setIsExporting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  // PDF-specific options
  const [pdfPageSize, setPdfPageSize] = useState<keyof typeof PAGE_SIZES>('A4')
  const [pdfIncludeHeader, setPdfIncludeHeader] = useState(false)
  const [pdfHeaderText, setPdfHeaderText] = useState('')
  const [pdfIncludeFooter, setPdfIncludeFooter] = useState(false)
  const [pdfFooterText, setPdfFooterText] = useState('')
  const [pdfIncludeToc, setPdfIncludeToc] = useState(false)
  const [pdfPreservePageBreaks, setPdfPreservePageBreaks] = useState(true)
  const [pdfImageQuality, setPdfImageQuality] = useState<'low' | 'medium' | 'high'>('high')
  const [pdfEmbedImages, setPdfEmbedImages] = useState(true)
  const [pdfMarginTop, setPdfMarginTop] = useState(20)
  const [pdfMarginBottom, setPdfMarginBottom] = useState(20)
  const [pdfMarginLeft, setPdfMarginLeft] = useState(20)
  const [pdfMarginRight, setPdfMarginRight] = useState(20)

  const handleFormatChange = (newFormat: ExportFormat) => {
    setFormat(newFormat)
    setErrors([])
    setWarnings([])

    // Validate format with content
    const validation = validateExportFormat(newFormat, 'sample content')
    setWarnings(validation.warnings)
  }

  const validateAndCollectOptions = (): Record<string, unknown> | null => {
    setErrors([])

    if (format === 'pdf') {
      const pdfOptions: PdfExportOptions = {
        pageSize: pdfPageSize,
        includeHeader: pdfIncludeHeader,
        headerText: pdfHeaderText,
        includeFooter: pdfIncludeFooter,
        footerText: pdfFooterText,
        includeTableOfContents: pdfIncludeToc,
        preservePageBreaks: pdfPreservePageBreaks,
        imageQuality: pdfImageQuality,
        embedImages: pdfEmbedImages,
        margins: {
          top: pdfMarginTop,
          bottom: pdfMarginBottom,
          left: pdfMarginLeft,
          right: pdfMarginRight
        }
      }

      const validationErrors = validatePdfOptions(pdfOptions)
      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        return null
      }

      return pdfOptions
    }

    return {}
  }

  const handleExport = async () => {
    const options = validateAndCollectOptions()
    if (!options) return

    setIsExporting(true)
    try {
      await onExport(format, options)
      onClose()
    } catch (err) {
      setErrors([`Export failed: ${(err as Error).message}`])
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export Document</DialogTitle>

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

        {/* Format Selection */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <FormLabel component="legend">Export Format</FormLabel>
          <RadioGroup value={format} onChange={(e) => handleFormatChange(e.target.value as ExportFormat)}>
            <FormControlLabel value="pdf" control={<Radio />} label="PDF (Recommended)" />
            <FormControlLabel value="epub" control={<Radio />} label="EPUB (E-books)" />
            <FormControlLabel value="latex" control={<Radio />} label="LaTeX (Academic)" />
            <FormControlLabel value="rtf" control={<Radio />} label="RTF (Documents)" />
            <FormControlLabel value="csv" control={<Radio />} label="CSV (Tables)" />
          </RadioGroup>
        </FormControl>

        <Divider sx={{ my: 2 }} />

        {/* PDF Options */}
        {format === 'pdf' && (
          <Stack spacing={2}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              PDF Options
            </Typography>

            {/* Page Size */}
            <FormControl fullWidth size="small">
              <FormLabel sx={{ mb: 1 }}>Page Size</FormLabel>
              <Select value={pdfPageSize} onChange={(e) => setPdfPageSize(e.target.value as keyof typeof PAGE_SIZES)}>
                {Object.keys(PAGE_SIZES).map((size) => (
                  <MenuItem key={size} value={size}>
                    {size}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Image Quality */}
            <FormControl fullWidth size="small">
              <FormLabel sx={{ mb: 1 }}>Image Quality</FormLabel>
              <Select value={pdfImageQuality} onChange={(e) => setPdfImageQuality(e.target.value as 'low' | 'medium' | 'high')}>
                <MenuItem value="low">Low (smaller file size)</MenuItem>
                <MenuItem value="medium">Medium (balanced)</MenuItem>
                <MenuItem value="high">High (best quality)</MenuItem>
              </Select>
            </FormControl>

            {/* Margins */}
            <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                Margins (mm)
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <TextField
                    type="number"
                    label="Top"
                    size="small"
                    fullWidth
                    value={pdfMarginTop}
                    onChange={(e) => setPdfMarginTop(parseInt(e.target.value) || 0)}
                    inputProps={{ min: 0, max: 50 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    type="number"
                    label="Bottom"
                    size="small"
                    fullWidth
                    value={pdfMarginBottom}
                    onChange={(e) => setPdfMarginBottom(parseInt(e.target.value) || 0)}
                    inputProps={{ min: 0, max: 50 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    type="number"
                    label="Left"
                    size="small"
                    fullWidth
                    value={pdfMarginLeft}
                    onChange={(e) => setPdfMarginLeft(parseInt(e.target.value) || 0)}
                    inputProps={{ min: 0, max: 50 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    type="number"
                    label="Right"
                    size="small"
                    fullWidth
                    value={pdfMarginRight}
                    onChange={(e) => setPdfMarginRight(parseInt(e.target.value) || 0)}
                    inputProps={{ min: 0, max: 50 }}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Header/Footer */}
            <FormGroup>
              <FormControlLabel
                control={<Checkbox checked={pdfIncludeHeader} onChange={(e) => setPdfIncludeHeader(e.target.checked)} />}
                label="Include Header"
              />
              {pdfIncludeHeader && (
                <TextField
                  label="Header Text"
                  size="small"
                  fullWidth
                  value={pdfHeaderText}
                  onChange={(e) => setPdfHeaderText(e.target.value)}
                  placeholder="e.g., Document Title"
                  sx={{ ml: 2, mb: 1 }}
                />
              )}

              <FormControlLabel
                control={<Checkbox checked={pdfIncludeFooter} onChange={(e) => setPdfIncludeFooter(e.target.checked)} />}
                label="Include Footer"
              />
              {pdfIncludeFooter && (
                <TextField
                  label="Footer Text"
                  size="small"
                  fullWidth
                  value={pdfFooterText}
                  onChange={(e) => setPdfFooterText(e.target.value)}
                  placeholder="e.g., Page {pageNumber}"
                  sx={{ ml: 2, mb: 1 }}
                />
              )}

              <FormControlLabel
                control={<Checkbox checked={pdfIncludeToc} onChange={(e) => setPdfIncludeToc(e.target.checked)} />}
                label="Include Table of Contents"
              />

              <FormControlLabel
                control={<Checkbox checked={pdfPreservePageBreaks} onChange={(e) => setPdfPreservePageBreaks(e.target.checked)} />}
                label="Preserve Page Breaks"
              />

              <FormControlLabel
                control={<Checkbox checked={pdfEmbedImages} onChange={(e) => setPdfEmbedImages(e.target.checked)} />}
                label="Embed Images"
              />
            </FormGroup>
          </Stack>
        )}

        {/* EPUB Options */}
        {format === 'epub' && (
          <Alert severity="info">EPUB export creates an e-book compatible with all major e-readers. Formatting is simplified for compatibility.</Alert>
        )}

        {/* LaTeX Options */}
        {format === 'latex' && (
          <Alert severity="info">
            LaTeX export is suitable for academic and technical documents. You can compile the output with pdflatex or other LaTeX tools.
          </Alert>
        )}

        {/* RTF Options */}
        {format === 'rtf' && (
          <Alert severity="info">
            RTF (Rich Text Format) is compatible with Microsoft Word and other text editors. Formatting may vary depending on the application.
          </Alert>
        )}

        {/* CSV Options */}
        {format === 'csv' && (
          <Alert severity="info">CSV export extracts tables from your document. If no tables are found, content will be converted to single-column CSV.</Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={isExporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          color="primary"
          startIcon={<FileDownloadIcon />}
          disabled={isExporting || contentLength === 0}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
