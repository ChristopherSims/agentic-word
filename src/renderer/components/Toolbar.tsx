import React, { useMemo, type FC } from 'react'
import { type Editor } from '@tiptap/react'
import { Box, IconButton, Tooltip, Divider, Select, MenuItem, ToggleButton, ToggleButtonGroup, Chip, FormControl } from '@mui/material'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SaveIcon from '@mui/icons-material/Save'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight'
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify'
import TableChartIcon from '@mui/icons-material/GridOn'
import AddBoxIcon from '@mui/icons-material/AddBox'
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox'
import DeleteIcon from '@mui/icons-material/Delete'
import ImageIcon from '@mui/icons-material/Image'
import LinkIcon from '@mui/icons-material/Link'
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule'
import CommitIcon from '@mui/icons-material/SaveAs'
import SearchIcon from '@mui/icons-material/Search'
import ViewListIcon from '@mui/icons-material/ViewList'
import BarChartIcon from '@mui/icons-material/BarChart'
import SettingsIcon from '@mui/icons-material/Settings'
import ChatIcon from '@mui/icons-material/Chat'
import SuperscriptIcon from '@mui/icons-material/Superscript'
import GroupIcon from '@mui/icons-material/Group'
import CommentIcon from '@mui/icons-material/Comment'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import PageBreakIcon from '@mui/icons-material/InsertPageBreak'
import TocIcon from '@mui/icons-material/Toc'
import PrintIcon from '@mui/icons-material/Print'
import DifferenceIcon from '@mui/icons-material/Difference'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { useAppStore } from '../store/app-store'

interface ToolbarProps {
  editor: Editor | null
  onOpen: () => void
  onNew: () => void
  onSave: () => void
}

const FONT_FAMILIES = ['Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Segoe UI', 'Times New Roman', 'Verdana']
const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72']

const TTip = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Tooltip title={title} arrow placement="bottom">{children}</Tooltip>
)

export const Toolbar: FC<ToolbarProps> = ({ editor, onOpen, onNew, onSave }) => {
  const { toggleChatSidebar, setVcsPanelOpen, setVcsPanelView,
    pendingChanges, setFindBarOpen, findBarOpen } = useAppStore()
  const pendingCount = pendingChanges.filter((c) => c.status === 'pending').length

  // P1-P5: Memoize editor.getAttributes() reads — recompute only when selection changes
  const editorSelection = editor?.state.selection
  const { currentFontFamily, currentFontSize, currentColor, currentHighlight, headingFmt } = useMemo(() => {
    if (!editor) {
      return { currentFontFamily: '', currentFontSize: '', currentColor: '#cdd6f4', currentHighlight: '#f9e2af', headingFmt: '' }
    }
    const currentFontFamily = editor.getAttributes('textStyle').fontFamily || ''
    const currentFontSize = editor.getAttributes('textStyle').fontSize || ''
    const currentColor = editor.getAttributes('textStyle').color || '#cdd6f4'
    const currentHighlight = editor.getAttributes('highlight').color || '#f9e2af'
    const headingFmt = editor.isActive('heading') ? `H${editor.getAttributes('heading').level}` : ''
    return { currentFontFamily, currentFontSize, currentColor, currentHighlight, headingFmt }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editorSelection])

  if (!editor) return <Box sx={{ height: 42, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }} />

  const handleCommit = () => { setVcsPanelOpen(true); setVcsPanelView('commit') }

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 0.5, 
      height: 42, 
      px: 1.5, 
      bgcolor: 'background.paper', 
      borderBottom: '1px solid', 
      borderColor: 'divider',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      flexShrink: 0, 
      overflow: 'hidden',
      transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      background: `linear-gradient(to bottom, ${({ theme }) => theme.palette.background.paper}, rgba(24, 24, 37, 0.8))`
    }}>
      {/* File */}
      <TTip title="New Document"><IconButton size="small" onClick={onNew} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><NoteAddIcon sx={{ fontSize: 18 }} /></IconButton></TTip>
      <TTip title="Open Document"><IconButton size="small" onClick={onOpen} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><FolderOpenIcon sx={{ fontSize: 18 }} /></IconButton></TTip>
      <TTip title="Save (Ctrl+S)"><IconButton size="small" onClick={onSave} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><SaveIcon sx={{ fontSize: 18 }} /></IconButton></TTip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Undo/Redo */}
      <TTip title="Undo"><span><IconButton size="small" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} sx={{ transition: '150ms ease-out', '&:hover:not(:disabled)': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active:not(:disabled)': { transform: 'scale(0.96)' } }}><UndoIcon sx={{ fontSize: 18 }} /></IconButton></span></TTip>
      <TTip title="Redo"><span><IconButton size="small" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} sx={{ transition: '150ms ease-out', '&:hover:not(:disabled)': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active:not(:disabled)': { transform: 'scale(0.96)' } }}><RedoIcon sx={{ fontSize: 18 }} /></IconButton></span></TTip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Font family */}
      <FormControl size="small" sx={{ minWidth: 90 }}>
        <Select
          value={currentFontFamily}
          displayEmpty
          onChange={(e) => { if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run(); else editor.chain().focus().unsetFontFamily().run() }}
          sx={{ height: 28, fontSize: 11, '& .MuiSelect-select': { py: 0.5, px: 1 }, transition: '200ms ease-out', '&:hover': { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)' } }}
        >
          <MenuItem value="" sx={{ fontSize: 11 }}>Font</MenuItem>
          {FONT_FAMILIES.map((f) => <MenuItem key={f} value={f} sx={{ fontSize: 11, fontFamily: f }}>{f}</MenuItem>)}
        </Select>
      </FormControl>

      {/* Font size */}
      <FormControl size="small" sx={{ minWidth: 60, ml: 0.25 }}>
        <Select
          value={currentFontSize}
          displayEmpty
          onChange={(e) => { if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run(); else editor.chain().focus().unsetFontSize().run() }}
          sx={{ height: 28, fontSize: 11, '& .MuiSelect-select': { py: 0.5, px: 1 }, transition: '200ms ease-out', '&:hover': { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)' } }}
        >
          <MenuItem value="" sx={{ fontSize: 11 }}>Size</MenuItem>
          {FONT_SIZES.map((s) => <MenuItem key={s} value={`${s}px`} sx={{ fontSize: 11 }}>{s}</MenuItem>)}
        </Select>
      </FormControl>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Text formatting */}
      <ToggleButtonGroup size="small" sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, border: 'none', fontSize: 14, transition: '150ms ease-out', '&:hover': { backgroundColor: 'action.hover', transform: 'scale(1.05)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }, '&.Mui-selected': { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', backgroundColor: 'action.selected' } } }}>
        <ToggleButton value="bold" selected={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><FormatBoldIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="italic" selected={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><FormatItalicIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="underline" selected={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><FormatUnderlinedIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="strike" selected={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughSIcon sx={{ fontSize: 17 }} /></ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Colors */}
      <TTip title="Text Color">
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', transition: '150ms ease-out' }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'; e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)' }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = 'transparent' }}>
          <span style={{ color: currentColor, fontWeight: 700, fontFamily: 'serif', fontSize: 14, margin: '0 2px' }}>A</span>
          <input type="color" value={currentColor} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} />
        </label>
      </TTip>
      <TTip title="Highlight Color">
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', transition: '150ms ease-out' }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'; e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)' }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = 'transparent' }}>
          <span style={{ background: currentHighlight, color: '#1e1e2e', fontWeight: 700, fontFamily: 'serif', fontSize: 13, borderRadius: 3, padding: '1px 3px', margin: '0 2px' }}>A</span>
          <input type="color" value={currentHighlight} onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} />
        </label>
      </TTip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Headings */}
      <ToggleButtonGroup size="small" sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, border: 'none', fontSize: 12, fontWeight: 600, transition: '150ms ease-out', '&:hover': { backgroundColor: 'action.hover', transform: 'scale(1.05)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }, '&.Mui-selected': { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', backgroundColor: 'action.selected' } } }}>
        <ToggleButton value="h1" selected={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToggleButton>
        <ToggleButton value="h2" selected={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToggleButton>
        <ToggleButton value="h3" selected={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Lists */}
      <ToggleButtonGroup size="small" sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, border: 'none', transition: '150ms ease-out', '&:hover': { backgroundColor: 'action.hover', transform: 'scale(1.05)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }, '&.Mui-selected': { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', backgroundColor: 'action.selected' } } }}>
        <ToggleButton value="bullet" selected={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><FormatListBulletedIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="ordered" selected={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><FormatListNumberedIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="quote" selected={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><FormatQuoteIcon sx={{ fontSize: 17 }} /></ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Alignment */}
      <ToggleButtonGroup size="small" sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, border: 'none', transition: '150ms ease-out', '&:hover': { backgroundColor: 'action.hover', transform: 'scale(1.05)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }, '&.Mui-selected': { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', backgroundColor: 'action.selected' } } }}>
        <ToggleButton value="left" selected={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><FormatAlignLeftIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="center" selected={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><FormatAlignCenterIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="right" selected={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><FormatAlignRightIcon sx={{ fontSize: 17 }} /></ToggleButton>
        <ToggleButton value="justify" selected={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><FormatAlignJustifyIcon sx={{ fontSize: 17 }} /></ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* Insert */}
      <TTip title="Insert Table"><IconButton size="small" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><TableChartIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      {editor.isActive('table') && (
        <>
          <TTip title="Add Row"><IconButton size="small" onClick={() => editor.chain().focus().addRowBefore().run()} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><AddBoxIcon sx={{ fontSize: 15 }} /></IconButton></TTip>
          <TTip title="Add Column"><IconButton size="small" onClick={() => editor.chain().focus().addColumnAfter().run()} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><AddBoxIcon sx={{ fontSize: 15, transform: 'rotate(90deg)' }} /></IconButton></TTip>
          <TTip title="Delete Row"><IconButton size="small" onClick={() => editor.chain().focus().deleteRow().run()} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><IndeterminateCheckBoxIcon sx={{ fontSize: 15 }} /></IconButton></TTip>
          <TTip title="Delete Column"><IconButton size="small" onClick={() => editor.chain().focus().deleteColumn().run()} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><IndeterminateCheckBoxIcon sx={{ fontSize: 15, transform: 'rotate(90deg)' }} /></IconButton></TTip>
          <TTip title="Delete Table"><IconButton size="small" onClick={() => editor.chain().focus().deleteTable().run()} color="error" sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton></TTip>
        </>
      )}
      <TTip title="Insert Image from Disk"><IconButton size="small" onClick={async () => { const dataUri = await window.wordapp?.file.openImageDialog(); if (dataUri) editor.chain().focus().setImage({ src: dataUri }).run() }} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><ImageIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Insert Link"><IconButton size="small" onClick={() => { const url = window.prompt('Link URL:'); if (url) editor.chain().focus().setLink({ href: url }).run() }} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><LinkIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Horizontal Rule"><IconButton size="small" onClick={() => editor.chain().focus().setHorizontalRule().run()} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><HorizontalRuleIcon sx={{ fontSize: 17 }} /></IconButton></TTip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* VCS */}
      <TTip title="Commit"><IconButton size="small" onClick={handleCommit} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><CommitIcon sx={{ fontSize: 17 }} /></IconButton></TTip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5, transition: '200ms ease-out', height: '60%' }} />

      {/* v0.3.3 features */}
      <TTip title="Page Break (Ctrl+Enter)"><IconButton size="small" onClick={() => editor?.commands.insertPageBreak()} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><PageBreakIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Track Changes"><IconButton size="small" color={useAppStore.getState().trackChangesOn ? 'success' : 'default'} onClick={() => useAppStore.getState().setTrackChangesOn(!useAppStore.getState().trackChangesOn)} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><TrackChangesIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Comment (Ctrl+Shift+M)"><IconButton size="small" onClick={() => {
        const sel = window.getSelection()?.toString() || ''
        if (sel && editor) {
          const { from, to } = editor.state.selection
          useAppStore.getState().setCommentSelection(from, to, sel)
          useAppStore.getState().setCommentInputOpen(true)
          useAppStore.getState().setCommentPanelOpen(true)
        } else {
          useAppStore.getState().setCommentPanelOpen(!useAppStore.getState().commentPanelOpen)
        }
      }} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><CommentIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Inline Diff"><IconButton size="small" onClick={async () => {
        const state = useAppStore.getState()
        const log = await window.wordapp?.vcs.log()
        if (log && log.length >= 2) {
          state.setInlineDiffFromCommitId(log[1].id)
          state.setInlineDiffOpen(true)
        } else {
          state.addToast('info', 'Need at least 2 commits to show diff')
        }
      }} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><DifferenceIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Table of Contents"><IconButton size="small" onClick={() => useAppStore.getState().setTocOpen(!useAppStore.getState().tocOpen)} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><TocIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Print Preview"><IconButton size="small" onClick={() => useAppStore.getState().setPrintPreviewOpen(true)} sx={{ transition: '150ms ease-out', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }, '&:active': { transform: 'scale(0.96)' } }}><PrintIcon sx={{ fontSize: 17 }} /></IconButton></TTip>

      <Box sx={{ flex: 1 }} />

      {/* Find */}
      <TTip title="Find & Replace (Ctrl+F)"><IconButton size="small" color={findBarOpen ? 'primary' : 'default'} onClick={() => setFindBarOpen(!findBarOpen)}><SearchIcon sx={{ fontSize: 17 }} /></IconButton></TTip>

      {pendingCount > 0 && <Chip label={`${pendingCount} pending`} size="small" color="primary" variant="outlined" sx={{ fontSize: 10, height: 20, animation: 'pending-pulse 2s ease-in-out infinite' }} />}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <TTip title="Outline"><IconButton size="small" onClick={() => useAppStore.getState().setOutlineOpen(!useAppStore.getState().outlineOpen)}><ViewListIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Statistics"><IconButton size="small" onClick={() => useAppStore.getState().setDocStatsPanelOpen(!useAppStore.getState().docStatsPanelOpen)}><BarChartIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Footnote (Ctrl+Shift+F)"><IconButton size="small" onClick={() => editor?.commands.insertFootnote()}><SuperscriptIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="Collaboration"><IconButton size="small" onClick={() => {
        if (!useAppStore.getState().collabMcpPort) {
          useAppStore.getState().addToast('info', 'Please configure collab server endpoint first (Settings → Collab)')
          return
        }
        useAppStore.getState().setCollabPanelOpen(!useAppStore.getState().collabPanelOpen)
      }}><GroupIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
      <TTip title="AI Writing Assistant (Ctrl+K)"><IconButton size="small" onClick={() => useAppStore.getState().setAIAssistantOpen(!useAppStore.getState().aiAssistantOpen)}><AutoAwesomeIcon sx={{ fontSize: 17, color: '#FFB300' }} /></IconButton></TTip>
      <TTip title="Toggle Chat"><IconButton size="small" onClick={toggleChatSidebar}><ChatIcon sx={{ fontSize: 17 }} /></IconButton></TTip>
    </Box>
  )
}
