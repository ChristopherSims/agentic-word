/**
 * Search utilities for v0.4.1 — Global Search & Navigation
 * Includes fuzzy search, search history, filtering, and previews
 */

export interface SearchResult {
  id: string
  documentId: string
  documentTitle: string
  content: string
  lineNumber?: number
  charOffset: number
  matchLength: number
  context: string // surrounding text for preview
  timestamp: number
  contentType: 'markdown' | 'text'
}

export interface SearchFilter {
  dateFrom?: number
  dateTo?: number
  minSize?: number
  maxSize?: number
  contentType?: 'markdown' | 'text'
}

export interface SavedSearch {
  id: string
  name: string
  query: string
  filters: SearchFilter
  createdAt: number
}

/**
 * Fuzzy search algorithm - levenshtein-inspired with fast matching
 * Returns score 0-1 where 1 is perfect match
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  if (q === t) return 1
  if (!q || !t) return 0

  let score = 0
  let queryIdx = 0
  let textIdx = 0
  let consecutiveMatches = 0

  while (textIdx < t.length && queryIdx < q.length) {
    if (q[queryIdx] === t[textIdx]) {
      consecutiveMatches++
      queryIdx++
      // Bonus for consecutive matches (word boundaries)
      if (textIdx === 0 || t[textIdx - 1] === ' ' || t[textIdx - 1] === '-') {
        score += 0.5
      } else {
        score += 0.1
      }
    } else {
      consecutiveMatches = 0
      score += 0.01 // penalty for non-match
    }
    textIdx++
  }

  // Deduct for unmatched query chars
  score -= (q.length - queryIdx) * 0.5

  // Normalize to 0-1
  return Math.max(0, Math.min(1, score / q.length))
}

/**
 * Search content with fuzzy matching
 */
export function searchContent(
  content: string,
  query: string,
  filters?: SearchFilter
): SearchResult[] {
  if (!query.trim()) return []

  const q = query.toLowerCase()
  const lines = content.split('\n')
  const results: SearchResult[] = []
  let charOffset = 0

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    const score = fuzzyScore(q, line)

    if (score > 0.3) {
      // Find all match positions in line for highlighting
      const matchIdx = line.toLowerCase().indexOf(q)
      if (matchIdx !== -1) {
        const context = line.substring(Math.max(0, matchIdx - 30), Math.min(line.length, matchIdx + query.length + 30))

        results.push({
          id: `${lineNum}-${matchIdx}`,
          documentId: '',
          documentTitle: '',
          content: line,
          lineNumber: lineNum + 1,
          charOffset,
          matchLength: query.length,
          context,
          timestamp: Date.now(),
          contentType: 'markdown'
        })
      }
    }

    charOffset += line.length + 1 // +1 for newline
  }

  return results
}

/**
 * Highlight search matches in text
 */
export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return text

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * Get context preview around match
 */
export function getContextPreview(content: string, offset: number, matchLength: number, contextChars: number = 50): string {
  const start = Math.max(0, offset - contextChars)
  const end = Math.min(content.length, offset + matchLength + contextChars)
  const preview = content.substring(start, end)

  // Add ellipsis if truncated
  const prefix = start > 0 ? '...' : ''
  const suffix = end < content.length ? '...' : ''

  return prefix + preview + suffix
}

/**
 * Search history management
 */
export interface SearchHistory {
  query: string
  timestamp: number
  resultCount: number
}

export const MAX_SEARCH_HISTORY = 50

export function updateSearchHistory(query: string, history: SearchHistory[], resultCount: number): SearchHistory[] {
  if (!query.trim()) return history

  // Remove duplicate if exists
  const filtered = history.filter((h) => h.query.toLowerCase() !== query.toLowerCase())

  // Add to beginning
  const updated = [
    {
      query,
      timestamp: Date.now(),
      resultCount
    },
    ...filtered
  ]

  // Limit size
  return updated.slice(0, MAX_SEARCH_HISTORY)
}

/**
 * Document metadata for filtering
 */
export interface DocumentMetadata {
  id: string
  title: string
  size: number // bytes
  createdAt: number
  modifiedAt: number
  contentType: 'markdown' | 'text'
}

/**
 * Filter search results
 */
export function filterResults(results: SearchResult[], filters?: SearchFilter): SearchResult[] {
  if (!filters) return results

  return results.filter((result) => {
    if (filters.dateFrom && result.timestamp < filters.dateFrom) return false
    if (filters.dateTo && result.timestamp > filters.dateTo) return false
    if (filters.contentType && result.contentType !== filters.contentType) return false
    return true
  })
}

/**
 * Group search results by document
 */
export function groupResultsByDocument(results: SearchResult[]): Map<string, SearchResult[]> {
  const grouped = new Map<string, SearchResult[]>()

  for (const result of results) {
    if (!grouped.has(result.documentId)) {
      grouped.set(result.documentId, [])
    }
    grouped.get(result.documentId)!.push(result)
  }

  return grouped
}

/**
 * Sort search results by relevance
 */
export function sortByRelevance(results: SearchResult[], query: string): SearchResult[] {
  return [...results].sort((a, b) => {
    // Score based on match context position (earlier matches rank higher)
    const scoreA = fuzzyScore(query, a.content)
    const scoreB = fuzzyScore(query, b.content)
    return scoreB - scoreA
  })
}

/**
 * Word boundary search (exact phrase within word boundaries)
 */
export function searchWithWordBoundary(content: string, query: string): SearchResult[] {
  const regex = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
  const results: SearchResult[] = []
  let match

  while ((match = regex.exec(content)) !== null) {
    const lineStart = content.lastIndexOf('\n', match.index) + 1
    const lineEnd = content.indexOf('\n', match.index)
    const lineNumber = content.substring(0, match.index).split('\n').length

    results.push({
      id: `${lineNumber}-${match.index}`,
      documentId: '',
      documentTitle: '',
      content: content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd),
      lineNumber,
      charOffset: match.index,
      matchLength: query.length,
      context: getContextPreview(content, match.index, query.length),
      timestamp: Date.now(),
      contentType: 'markdown'
    })
  }

  return results
}

/**
 * Regex pattern search (for advanced users)
 */
export function searchWithRegex(content: string, pattern: string): SearchResult[] {
  try {
    const regex = new RegExp(pattern, 'gi')
    const results: SearchResult[] = []
    let match

    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length

      results.push({
        id: `${lineNumber}-${match.index}`,
        documentId: '',
        documentTitle: '',
        content: match[0],
        lineNumber,
        charOffset: match.index,
        matchLength: match[0].length,
        context: getContextPreview(content, match.index, match[0].length),
        timestamp: Date.now(),
        contentType: 'markdown'
      })
    }

    return results
  } catch (err) {
    console.error('Invalid regex pattern:', pattern, err)
    return []
  }
}

/**
 * Case sensitivity toggle
 */
export function searchCaseSensitive(content: string, query: string): SearchResult[] {
  const results: SearchResult[] = []
  let index = content.indexOf(query)

  while (index !== -1) {
    const lineNumber = content.substring(0, index).split('\n').length

    results.push({
      id: `${lineNumber}-${index}`,
      documentId: '',
      documentTitle: '',
      content: query,
      lineNumber,
      charOffset: index,
      matchLength: query.length,
      context: getContextPreview(content, index, query.length),
      timestamp: Date.now(),
      contentType: 'markdown'
    })

    index = content.indexOf(query, index + 1)
  }

  return results
}
