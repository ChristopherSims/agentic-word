import React, { useEffect, useRef, useState, type FC } from 'react'
import { Box, Paper, Typography, IconButton, Button, Dialog, DialogContent, DialogTitle, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Tooltip, Chip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PrintIcon from '@mui/icons-material/Print'
import SettingsIcon from '@mui/icons-material/Settings'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { useAppStore } from '../store/app-store'

const PAGE_WIDTH = 816  // 8.5" at 96dpi
const PAGE_HEIGHT = 1056 // 11" at 96dpi
const MARGIN_TOP = 96    // 1"
const MARGIN_BOTTOM = 96
const MARGIN_LEFT = 96
const MARGIN_RIGHT = 96

export const PrintPreview: FC = () => {
  const { printPreviewOpen, setPrintPreviewOpen, documentContent, documentTitle, pageHeaderFooter } = useAppStore()
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hfDialogOpen, setHfDialogOpen] = useState(false)
  const [localHF, setLocalHF] = useState(pageHeaderFooter)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (printPreviewOpen) {
      // Paginate content into pages
      paginate()
    }
  }, [printPreviewOpen, documentContent])

  useEffect(() => {
    setLocalHF(pageHeaderFooter)
  }, [pageHeaderFooter])

  const paginate = () => {
    const contentHeight = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM
    // Estimate pages from content (rough: ~30 lines per page at 16px line height + 1.15 spacing ≈ 18px)
    const textContent = documentContent.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').trim()
    const lines = textContent.split('\n').filter((l) => l.trim()).length
    const linesPerPage = Math.floor(contentHeight / 20)
    const pages = Math.max(1, Math.ceil(lines / linesPerPage))
    // Also count page breaks
    const pageBreaks = (documentContent.match(/data-page-break/g) || []).length
    setTotalPages(pages + pageBreaks)
  }

  const formatPageNum = (page: number) => {
    return pageHeaderFooter.footerCenter
      .replace('{n}', String(page))
      .replace('{N}', String(totalPages))
  }

  const formatDate = () => new Date().toLocaleDateString()

  const renderHeader = () => {
    const { headerLeft, headerCenter, headerRight, showTitle, showDate } = pageHeaderFooter
    const left = headerLeft || (showTitle ? documentTitle : '')
    const center = headerCenter || (showDate ? formatDate() : '')
    const right = headerRight
    if (!left && !center && !right) return null
    return (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, fontSize: 9, color: '#666', borderBottom: '1px solid #ddd', pb: 0.25, mb: 0.5 }}>
        <span>{left}</span>
        <span>{center}</span>
        <span>{right}</span>
      </Box>
    )
  }

  const renderFooter = (page: number) => {
    const { footerLeft, footerCenter, footerRight, showPageNumbers } = pageHeaderFooter
    const center = showPageNumbers ? formatPageNum(page) : footerCenter
    if (!footerLeft && !center && !footerRight) return null
    return (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, fontSize: 9, color: '#666', borderTop: '1px solid #ddd', pt: 0.25, mt: 'auto' }}>
        <span>{footerLeft}</span>
        <span>{center}</span>
        <span>{footerRight}</span>
      </Box>
    )
  }

  const handlePrint = () => {
    // Create a print-optimized window
    const printWin = window.open('', '_blank')
    if (!printWin) return
    printWin.document.write(`
      <html><head><title>${documentTitle}</title>
      <style>
        @page { size: letter; margin: 1in; }
        body { font-family: 'Georgia', serif; font-size: 12pt; line-height: 1.5; color: #000; }
        h1 { font-size: 20pt; margin: 0.5em 0 0.3em; }
        h2 { font-size: 16pt; margin: 0.4em 0 0.2em; }
        h3 { font-size: 13pt; margin: 0.3em 0 0.2em; }
        p { margin: 0 0 0.5em; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #999; padding: 4px 8px; font-size: 11pt; }
        [data-page-break] { page-break-after: always; }
        .no-print { display: none; }
      </style></head><body>
      ${documentContent}
      </body></html>
    `)
    printWin.document.close()
    printWin.print()
  }

  const handleSaveHF = () => {
    useAppStore.getState().setPageHeaderFooter(localHF)
    setHfDialogOpen(false)
  }

  if (!printPreviewOpen) return null

  // Render all pages
  const pages = []
  for (let p = 1; p <= totalPages; p++) {
    pages.push(
      <Box key={p} sx={{
        width: PAGE_WIDTH, height: PAGE_HEIGHT, bgcolor: 'white', color: '#111',
        mx: 'auto', mb: 2, display: 'flex', flexDirection: 'column',
        boxShadow: 2, overflow: 'hidden', position: 'relative',
        '@media print': { boxShadow: 'none', margin: 0 }
      }}>
        {renderHeader()}
        <Box sx={{ flex: 1, overflow: 'hidden', px: `${MARGIN_LEFT / PAGE_WIDTH * 100}%`, py: 1, fontSize: 11, lineHeight: 1.5, fontFamily: 'Georgia, serif' }}>
          {p === 1 && <div className="tiptap" dangerouslySetInnerHTML={{ __html: documentContent || '<p></p>' }} style={{ fontSize: 11 }} />}
          {p > 1 && <Typography variant="caption" color="text.secondary">[Page {p} content continues]</Typography>}
        </Box>
        {renderFooter(p)}
      </Box>
    )
  }

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 200, bgcolor: 'grey.300', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Paper sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1, zIndex: 201, background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', boxShadow: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '0.5px', color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <PrintIcon sx={{ fontSize: 22 }} />
          Print Preview
        </Typography>
        <Chip label={`${currentPage} / ${totalPages}`} size="small" sx={{ fontSize: 10, height: 24, fontWeight: 600, bgcolor: 'primary.main', color: 'white' }} />
        <IconButton size="small" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
          <NavigateBeforeIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <IconButton size="small" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
          <NavigateNextIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Header / Footer Settings">
          <IconButton size="small" onClick={() => setHfDialogOpen(true)} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}><SettingsIcon sx={{ fontSize: 20 }} /></IconButton>
        </Tooltip>
        <Button size="small" variant="contained" startIcon={<PrintIcon />} onClick={handlePrint} sx={{ fontWeight: 600, bgcolor: '#4CAF50', '&:hover': { bgcolor: '#45a049' } }}>Print</Button>
        <Tooltip title="Close (Esc)">
          <IconButton size="small" onClick={() => setPrintPreviewOpen(false)} sx={{ color: '#ff6b6b', fontSize: 24, '&:hover': { bgcolor: 'rgba(255,107,107,0.2)' } }}><CloseIcon sx={{ fontSize: 22 }} /></IconButton>
        </Tooltip>
      </Paper>

      {/* Page(s) */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 3, px: 2 }} ref={previewRef}>
        {pages}
      </Box>

      <Dialog open={hfDialogOpen} onClose={() => setHfDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Header &amp; Footer Settings</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 2 }}>
          <Typography variant="caption" color="text.secondary">Use {`{n}`} for page number, {`{N}`} for total pages, {`{date}`} for today's date</Typography>
          <TextField label="Header Left" size="small" value={localHF.headerLeft} onChange={(e) => setLocalHF({ ...localHF, headerLeft: e.target.value })} />
          <TextField label="Header Center" size="small" value={localHF.headerCenter} onChange={(e) => setLocalHF({ ...localHF, headerCenter: e.target.value })} />
          <TextField label="Header Right" size="small" value={localHF.headerRight} onChange={(e) => setLocalHF({ ...localHF, headerRight: e.target.value })} />
          <TextField label="Footer Left" size="small" value={localHF.footerLeft} onChange={(e) => setLocalHF({ ...localHF, footerLeft: e.target.value })} />
          <TextField label="Footer Center" size="small" value={localHF.footerCenter} onChange={(e) => setLocalHF({ ...localHF, footerCenter: e.target.value })} placeholder="Page {n} of {N}" />
          <TextField label="Footer Right" size="small" value={localHF.footerRight} onChange={(e) => setLocalHF({ ...localHF, footerRight: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHfDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveHF}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
