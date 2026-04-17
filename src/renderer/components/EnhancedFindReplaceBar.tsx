import React, { useState, useEffect, type FC } from 'react'
import { Box, TextField, IconButton, Tooltip, ToggleButton, ToggleButtonGroup, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, List, ListItem, ListItemText } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ClearIcon from '@mui/icons-material/Clear'

interface FindReplaceOptions {
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
}

interface SearchMatch {
  index: number
  text: string
  length: number
}

export const EnhancedFindReplaceBar: FC = () => {
  const [open, setOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [options, setOptions] = useState<FindReplaceOptions>({
    caseSensitive: false,
    regex: false,
    wholeWord: false
  })
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)

  // Find matches based on current options
  const updateMatches = (text: string, searchText: string) => {
    if (!searchText) {
      setMatches([])
      setCurrentMatchIndex(0)
      return
    }

    try {
      let regex: RegExp
      let flags = options.caseSensitive ? 'g' : 'gi'

      if (options.regex) {
        regex = new RegExp(searchText, flags)
      } else {
        let escapedText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (options.wholeWord) {
          escapedText = `\\b${escapedText}\\b`
        }
        regex = new RegExp(escapedText, flags)
      }

      const matches: SearchMatch[] = []
      let match

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          index: match.index,
          text: match[0],
          length: match[0].length
        })
      }

      setMatches(matches)
      setCurrentMatchIndex(0)
    } catch (e) {
      // Invalid regex
      setMatches([])
    }
  }

  const handleFind = (text: string) => {
    setFindText(text)
    if (text && !searchHistory.includes(text)) {
      setSearchHistory([text, ...searchHistory.slice(0, 9)])
    }
    updateMatches('', text) // Would need editor content
  }

  const handlePrevious = () => {
    if (matches.length === 0) return
    setCurrentMatchIndex(Math.max(0, currentMatchIndex - 1))
  }

  const handleNext = () => {
    if (matches.length === 0) return
    setCurrentMatchIndex(Math.min(matches.length - 1, currentMatchIndex + 1))
  }

  const handleReplace = (text: string) => {
    // Single replace at current match
    if (matches.length > 0 && currentMatchIndex < matches.length) {
      const match = matches[currentMatchIndex]
      // Would emit event to editor
    }
  }

  const handleReplaceAll = () => {
    setShowReplaceConfirm(true)
  }

  const confirmReplaceAll = () => {
    // Would replace all matches in editor
    setShowReplaceConfirm(false)
  }

  const handleClearHistory = () => {
    setSearchHistory([])
  }

  const matchCount = matches.length
  const matchPositionText = matches.length > 0 ? `${currentMatchIndex + 1} of ${matchCount}` : 'No matches'

  return (
    <>
      {/* Toolbar button to open find/replace */}
      <Tooltip title="Find & Replace (Ctrl+H)">
        <IconButton 
          size="small" 
          onClick={() => setOpen(!open)}
          sx={{ 
            transition: 'all 150ms ease-out',
            '&:hover': { transform: 'scale(1.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }
          }}
        >
          <FindReplaceIcon sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>

      {/* Find & Replace Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Find & Replace</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 2 }}>
          {/* Find input */}
          <Box>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Find"
              value={findText}
              onChange={(e) => handleFind(e.target.value)}
              onFocus={() => setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 200)}
              placeholder="Search text or regex pattern..."
              sx={{ mb: 0.5 }}
            />
            {showHistory && searchHistory.length > 0 && (
              <List dense sx={{ border: '1px solid', borderColor: 'divider', maxHeight: 150, overflow: 'auto', borderRadius: 1 }}>
                {searchHistory.map((item, idx) => (
                  <ListItem key={idx} onClick={() => { handleFind(item); setShowHistory(false) }} sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}>
                    <ListItemText primary={item} />
                  </ListItem>
                ))}
                <ListItem onClick={handleClearHistory} sx={{ cursor: 'pointer', color: 'error.main', '&:hover': { backgroundColor: 'action.hover' } }}>
                  <ListItemText primary="Clear history" />
                </ListItem>
              </List>
            )}
            <Typography variant="caption" sx={{ color: matchCount === 0 && findText ? 'error.main' : 'text.secondary' }}>
              {matchPositionText}
            </Typography>
          </Box>

          {/* Replace input */}
          <Box>
            <TextField
              fullWidth
              size="small"
              label="Replace"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replacement text"
            />
          </Box>

          {/* Options */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>Options:</Typography>
            <ToggleButtonGroup
              size="small"
              value={Object.keys(options).filter(key => options[key as keyof FindReplaceOptions])}
              onChange={(_, newOptions) => {
                setOptions({
                  caseSensitive: newOptions.includes('caseSensitive'),
                  regex: newOptions.includes('regex'),
                  wholeWord: newOptions.includes('wholeWord')
                })
              }}
              sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 0.75, fontSize: '11px' } }}
            >
              <ToggleButton value="caseSensitive" title="Case Sensitive">
                <Typography variant="caption" sx={{ fontWeight: 600 }}>Aa</Typography>
              </ToggleButton>
              <ToggleButton value="wholeWord" title="Whole Word">
                <Typography variant="caption" sx={{ fontWeight: 600 }}>ab</Typography>
              </ToggleButton>
              <ToggleButton value="regex" title="Regular Expression">
                <Typography variant="caption" sx={{ fontWeight: 600 }}>.*</Typography>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Navigation */}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Previous match">
                <span>
                  <IconButton size="small" onClick={handlePrevious} disabled={matches.length === 0}>
                    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Next match">
                <span>
                  <IconButton size="small" onClick={handleNext} disabled={matches.length === 0}>
                    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <Tooltip title="Clear all highlights">
              <span>
                <IconButton size="small" onClick={() => { setFindText(''); setMatches([]) }} disabled={matches.length === 0}>
                  <ClearIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 1.5, gap: 1 }}>
          <Button onClick={() => handleReplace(replaceText)} disabled={matches.length === 0} variant="outlined" size="small">
            Replace
          </Button>
          <Button onClick={handleReplaceAll} disabled={matches.length === 0} variant="outlined" size="small" color="warning">
            Replace All
          </Button>
          <Button onClick={() => setOpen(false)} variant="contained" size="small">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Replace All Confirmation */}
      <Dialog open={showReplaceConfirm} onClose={() => setShowReplaceConfirm(false)}>
        <DialogTitle>Replace All Matches?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Replace all {matchCount} occurrences of <strong>"{findText}"</strong> with <strong>"{replaceText}"</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowReplaceConfirm(false)} variant="outlined">Cancel</Button>
          <Button onClick={confirmReplaceAll} variant="contained" color="warning">Replace All</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
