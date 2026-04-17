import React, { useState, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  TextField,
  Button,
  Stack,
  Paper,
  Typography,
  Chip,
  IconButton,
  Divider,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Tabs,
  Tab
} from '@mui/material'
import {
  Search as SearchIcon,
  Close as CloseIcon,
  Bookmark as BookmarkIcon,
  BookmarkBorder as BookmarkBorderIcon,
  History as HistoryIcon,
  Delete as DeleteIcon,
  SavedSearch as SavedSearchIcon
} from '@mui/icons-material'
import { useAppStore } from '../store/app-store'
import { fuzzyScore, searchContent, highlightMatches, updateSearchHistory, getContextPreview } from '../utils/search-utils'

export const GlobalSearchPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const {
    globalSearchQuery,
    globalSearchResults,
    globalSearchHistory,
    globalSearchSavedSearches,
    globalSearchAllTabs,
    docTabs,
    documentContent,
    documentTitle,
    setGlobalSearchQuery,
    setGlobalSearchResults,
    addToSearchHistory,
    clearSearchHistory,
    addSavedSearch,
    removeSavedSearch,
    setGlobalSearchAllTabs,
    setGlobalSearchOpen
  } = useAppStore()

  const [tabIndex, setTabIndex] = useState(0)
  const [searchName, setSearchName] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)

  const performSearch = useCallback(() => {
    if (!globalSearchQuery.trim()) {
      setGlobalSearchResults([])
      return
    }

    let allResults: any[] = []

    const searchDocuments = globalSearchAllTabs ? docTabs : [{ id: 'current', content: documentContent, title: documentTitle }]

    for (const doc of searchDocuments) {
      const content = 'content' in doc ? doc.content : documentContent
      const title = 'title' in doc ? doc.title : documentTitle

      let results: any[] = []

      if (useRegex) {
        try {
          const regex = new RegExp(globalSearchQuery, caseSensitive ? 'g' : 'gi')
          let match

          while ((match = regex.exec(content)) !== null) {
            results.push({
              id: `${title}-${match.index}`,
              documentId: doc.id || 'current',
              documentTitle: title,
              content: match[0],
              context: getContextPreview(content, match.index, match[0].length),
              timestamp: Date.now(),
              lineNumber: content.substring(0, match.index).split('\n').length
            })
          }
        } catch {
          // Invalid regex
        }
      } else {
        const lines = content.split('\n')
        let charOffset = 0

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum]
          const query = caseSensitive ? globalSearchQuery : globalSearchQuery.toLowerCase()
          const searchLine = caseSensitive ? line : line.toLowerCase()
          const score = fuzzyScore(query, line)

          if (wholeWord) {
            const words = line.split(/\W+/)
            if (words.some((w) => (caseSensitive ? w === query : w.toLowerCase() === query))) {
              results.push({
                id: `${title}-${lineNum}`,
                documentId: doc.id || 'current',
                documentTitle: title,
                content: line,
                context: line.substring(0, 80),
                timestamp: charOffset,
                lineNumber: lineNum + 1
              })
            }
          } else if (score > 0.3) {
            results.push({
              id: `${title}-${lineNum}`,
              documentId: doc.id || 'current',
              documentTitle: title,
              content: line,
              context: line.substring(0, 80),
              timestamp: Date.now(),
              lineNumber: lineNum + 1
            })
          }

          charOffset += line.length + 1
        }
      }

      allResults = [...allResults, ...results]
    }

    setGlobalSearchResults(allResults)
    addToSearchHistory(globalSearchQuery, allResults.length)
  }, [globalSearchQuery, globalSearchAllTabs, caseSensitive, wholeWord, useRegex, docTabs, documentContent, documentTitle, setGlobalSearchResults, addToSearchHistory])

  const handleSearch = useCallback(() => {
    performSearch()
  }, [performSearch])

  const handleSaveSearch = useCallback(() => {
    if (searchName.trim()) {
      addSavedSearch(searchName, globalSearchQuery)
      setSearchName('')
    }
  }, [searchName, globalSearchQuery, addSavedSearch])

  const loadSavedSearch = useCallback((query: string) => {
    setGlobalSearchQuery(query)
  }, [setGlobalSearchQuery])

  const resultsByDocument = useMemo(() => {
    const grouped = new Map<string, any[]>()
    for (const result of globalSearchResults) {
      if (!grouped.has(result.documentTitle)) {
        grouped.set(result.documentTitle, [])
      }
      grouped.get(result.documentTitle)!.push(result)
    }
    return Array.from(grouped.entries())
  }, [globalSearchResults])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth sx={{ '& .MuiDialog-paper': { maxHeight: '80vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon />
          Global Search
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ backgroundColor: 'var(--bg-primary)', padding: 2 }}>
        <Tabs value={tabIndex} onChange={(_, idx) => setTabIndex(idx)} sx={{ marginBottom: 2, borderBottom: '1px solid var(--border)' }}>
          <Tab label="Search" />
          <Tab label="History" />
          <Tab label="Saved Searches" />
        </Tabs>

        {tabIndex === 0 && (
          <Stack spacing={2}>
            {/* Search Input */}
            <TextField
              fullWidth
              placeholder="Search across all documents..."
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleSearch()
              }}
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  '& fieldset': { borderColor: 'var(--border)' }
                }
              }}
              InputProps={{
                endAdornment: (
                  <Button size="small" onClick={handleSearch} sx={{ color: 'var(--accent)' }}>
                    Search
                  </Button>
                )
              }}
            />

            {/* Search Options */}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip
                icon={caseSensitive ? undefined : undefined}
                label="Case Sensitive"
                onClick={() => setCaseSensitive(!caseSensitive)}
                variant={caseSensitive ? 'filled' : 'outlined'}
                size="small"
                sx={{
                  backgroundColor: caseSensitive ? 'var(--accent)' : 'transparent',
                  borderColor: caseSensitive ? 'var(--accent)' : 'var(--border)',
                  color: caseSensitive ? '#000' : 'var(--text-primary)'
                }}
              />
              <Chip
                label="Whole Word"
                onClick={() => setWholeWord(!wholeWord)}
                variant={wholeWord ? 'filled' : 'outlined'}
                size="small"
                sx={{
                  backgroundColor: wholeWord ? 'var(--accent)' : 'transparent',
                  borderColor: wholeWord ? 'var(--accent)' : 'var(--border)',
                  color: wholeWord ? '#000' : 'var(--text-primary)'
                }}
              />
              <Chip
                label="Regular Expression"
                onClick={() => setUseRegex(!useRegex)}
                variant={useRegex ? 'filled' : 'outlined'}
                size="small"
                sx={{
                  backgroundColor: useRegex ? 'var(--accent)' : 'transparent',
                  borderColor: useRegex ? 'var(--accent)' : 'var(--border)',
                  color: useRegex ? '#000' : 'var(--text-primary)'
                }}
              />
              <Chip
                label={`${globalSearchAllTabs ? 'All Tabs' : 'Current'}`}
                onClick={() => setGlobalSearchAllTabs(!globalSearchAllTabs)}
                variant={globalSearchAllTabs ? 'filled' : 'outlined'}
                size="small"
                sx={{
                  backgroundColor: globalSearchAllTabs ? 'var(--success)' : 'transparent',
                  borderColor: globalSearchAllTabs ? 'var(--success)' : 'var(--border)',
                  color: globalSearchAllTabs ? '#000' : 'var(--text-primary)'
                }}
              />
            </Stack>

            <Divider />

            {/* Save Search */}
            <Stack direction="row" spacing={1}>
              <TextField
                placeholder="Save search as..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                size="small"
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    '& fieldset': { borderColor: 'var(--border)' }
                  }
                }}
              />
              <Button variant="outlined" onClick={handleSaveSearch} startIcon={<SavedSearchIcon />} size="small">
                Save
              </Button>
            </Stack>

            <Divider />

            {/* Results */}
            <Box>
              <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
                {globalSearchResults.length} result{globalSearchResults.length !== 1 ? 's' : ''}
              </Typography>

              <List sx={{ maxHeight: '400px', overflow: 'auto', backgroundColor: 'var(--bg-surface)', borderRadius: 1, marginTop: 1 }}>
                {resultsByDocument.length === 0 && globalSearchResults.length > 0 && (
                  <ListItem>
                    <ListItemText primary="No results" secondary="Try a different search" />
                  </ListItem>
                )}

                {resultsByDocument.map(([docTitle, results]) => (
                  <div key={docTitle}>
                    <ListItem sx={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 600, padding: 1 }}>
                      <Typography variant="subtitle2" sx={{ color: 'var(--accent)' }}>
                        {docTitle} ({results.length})
                      </Typography>
                    </ListItem>
                    {results.map((result) => (
                      <ListItemButton key={result.id} sx={{ paddingLeft: 3, paddingY: 0.5 }}>
                        <ListItemText
                          primary={
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              Line {result.lineNumber}: {result.content.substring(0, 60)}
                              {result.content.length > 60 ? '...' : ''}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
                              {result.context}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    ))}
                  </div>
                ))}
              </List>
            </Box>
          </Stack>
        )}

        {tabIndex === 1 && (
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2">Recent Searches</Typography>
              {globalSearchHistory.length > 0 && <Button size="small" onClick={clearSearchHistory}>Clear</Button>}
            </Box>
            <List>
              {globalSearchHistory.map((item) => (
                <ListItemButton key={item.query} onClick={() => loadSavedSearch(item.query)}>
                  <ListItemText
                    primary={item.query}
                    secondary={`${item.resultCount} results • ${new Date(item.timestamp).toLocaleDateString()}`}
                  />
                </ListItemButton>
              ))}
            </List>
            {globalSearchHistory.length === 0 && <Alert severity="info">No search history yet</Alert>}
          </Stack>
        )}

        {tabIndex === 2 && (
          <Stack spacing={1}>
            <Box>
              <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
                Saved Searches
              </Typography>
              <List>
                {globalSearchSavedSearches.map((saved) => (
                  <ListItem
                    key={saved.id}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => removeSavedSearch(saved.id)}>
                        <DeleteIcon />
                      </IconButton>
                    }
                  >
                    <ListItemButton onClick={() => loadSavedSearch(saved.query)} sx={{ flex: 1 }}>
                      <ListItemText primary={saved.name} secondary={saved.query} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
              {globalSearchSavedSearches.length === 0 && (
                <Alert severity="info">No saved searches. Save your first search above!</Alert>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
