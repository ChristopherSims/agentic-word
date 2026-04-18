import React, { type FC } from 'react'
import { Box, Typography, Link as MuiLink, Table, TableBody, TableCell, TableHead, TableRow, Code as CodeBlock } from '@mui/material'

interface MarkdownRenderProps {
  content: string
}

/**
 * Simple markdown renderer for documentation
 * Converts basic markdown syntax to React components
 */
export const MarkdownRenderer: FC<MarkdownRenderProps> = ({ content }) => {
  if (!content || content.trim() === '') {
    return <Typography color="text.secondary">No content to display</Typography>
  }

  const lines = content.split('\n')
  console.log('[MarkdownRenderer] Split into', lines.length, 'lines')
  const elements: React.ReactNode[] = []
  let i = 0

  const parseInline = (text: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = []
    let lastIndex = 0

    // Code spans
    const codeRegex = /`([^`]+)`/g
    let match
    const codes: Array<{ start: number; end: number; text: string }> = []
    while ((match = codeRegex.exec(text)) !== null) {
      codes.push({ start: match.index, end: match.index + match[0].length, text: match[1] })
    }

    // Bold
    const boldRegex = /\*\*([^*]+)\*\*/g
    const bolds: Array<{ start: number; end: number; text: string }> = []
    while ((match = boldRegex.exec(text)) !== null) {
      bolds.push({ start: match.index, end: match.index + match[0].length, text: match[1] })
    }

    // Italic
    const italicRegex = /\*([^*]+)\*/g
    const italics: Array<{ start: number; end: number; text: string }> = []
    while ((match = italicRegex.exec(text)) !== null) {
      // Don't include already bold items
      if (!bolds.some((b) => b.start === match!.index - 1)) {
        italics.push({ start: match.index, end: match.index + match[0].length, text: match[1] })
      }
    }

    // Links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    const links: Array<{ start: number; end: number; text: string; url: string }> = []
    while ((match = linkRegex.exec(text)) !== null) {
      links.push({ start: match.index, end: match.index + match[0].length, text: match[1], url: match[2] })
    }

    const allFormats = [...codes, ...bolds, ...italics, ...links].sort((a, b) => a.start - b.start)

    for (let j = 0; j < allFormats.length; j++) {
      const fmt = allFormats[j]
      if (fmt.start > lastIndex) {
        nodes.push(text.substring(lastIndex, fmt.start))
      }

      if ('url' in fmt) {
        nodes.push(
          <MuiLink key={j} href={fmt.url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 'inherit' }}>
            {fmt.text}
          </MuiLink>
        )
      } else if ('text' in fmt && text.substring(fmt.start, fmt.start + 2) === '**') {
        nodes.push(
          <strong key={j} style={{ fontWeight: 700 }}>
            {fmt.text}
          </strong>
        )
      } else if ('text' in fmt && text.substring(fmt.start, fmt.start + 1) === '*') {
        nodes.push(
          <em key={j} style={{ fontStyle: 'italic' }}>
            {fmt.text}
          </em>
        )
      } else {
        nodes.push(
          <code key={j} style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '3px', fontSize: '0.9em' }}>
            {fmt.text}
          </code>
        )
      }
      lastIndex = fmt.end
    }

    if (lastIndex < text.length) {
      nodes.push(text.substring(lastIndex))
    }

    return nodes.length > 0 ? nodes : [text]
  }

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <Typography key={i} variant="h4" sx={{ mt: 3, mb: 1, fontWeight: 700 }}>
          {parseInline(line.substring(2))}
        </Typography>
      )
      i++
    } else if (line.startsWith('## ')) {
      elements.push(
        <Typography key={i} variant="h5" sx={{ mt: 2.5, mb: 1, fontWeight: 700 }}>
          {parseInline(line.substring(3))}
        </Typography>
      )
      i++
    } else if (line.startsWith('### ')) {
      elements.push(
        <Typography key={i} variant="h6" sx={{ mt: 2, mb: 0.75, fontWeight: 700 }}>
          {parseInline(line.substring(4))}
        </Typography>
      )
      i++
    }
    // Tables
    else if (line.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }

      if (tableLines.length >= 3) {
        const headerRow = tableLines[0].split('|').map((cell) => cell.trim()).filter(Boolean)
        const bodyRows = tableLines.slice(2).map((row) => row.split('|').map((cell) => cell.trim()).filter(Boolean))

        elements.push(
          <Box key={i} sx={{ overflowX: 'auto', my: 2 }}>
            <Table size="small" sx={{ minWidth: '100%' }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  {headerRow.map((cell, idx) => (
                    <TableCell key={idx} sx={{ fontSize: 12, fontWeight: 700 }}>
                      {parseInline(cell)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {bodyRows.map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {row.map((cell, cellIdx) => (
                      <TableCell key={cellIdx} sx={{ fontSize: 11 }}>
                        {parseInline(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )
      }
    }
    // Code blocks
    else if (line.startsWith('```')) {
      const codeLines = []
      i++
      const lang = line.substring(3)
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // Skip closing ```

      elements.push(
        <Box
          key={i}
          sx={{
            bgcolor: 'action.hover',
            p: 1,
            borderRadius: 1,
            overflow: 'auto',
            my: 1.5,
            border: 1,
            borderColor: 'divider'
          }}
        >
          <code style={{ fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {codeLines.join('\n')}
          </code>
        </Box>
      )
    }
    // Unordered lists
    else if (line.startsWith('- ') || line.startsWith('• ')) {
      const listItems = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('• '))) {
        listItems.push(
          <Box key={i} sx={{ ml: 2, mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 11 }}>
              • {parseInline(lines[i].substring(2))}
            </Typography>
          </Box>
        )
        i++
      }
      elements.push(
        <Box key={i}>{listItems}</Box>
      )
    }
    // Ordered lists
    else if (/^\d+\./.test(line)) {
      const listItems = []
      let itemNum = 1
      while (i < lines.length && /^\d+\./.test(lines[i])) {
        const match = lines[i].match(/^\d+\.\s*(.*)/)
        listItems.push(
          <Box key={i} sx={{ ml: 2, mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 11 }}>
              {itemNum}. {parseInline(match?.[1] || '')}
            </Typography>
          </Box>
        )
        itemNum++
        i++
      }
      elements.push(
        <Box key={i}>{listItems}</Box>
      )
    }
    // Horizontal rules
    else if (line === '---' || line === '***') {
      elements.push(<Box key={i} sx={{ my: 2, height: 1, bgcolor: 'divider' }} />)
      i++
    }
    // Empty lines
    else if (line.trim() === '') {
      elements.push(<Box key={i} sx={{ height: 4 }} />)
      i++
    }
    // Paragraphs
    else {
      const paragraphLines = []
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('|') && !lines[i].startsWith('-') && !lines[i].startsWith('•') && !/^\d+\./.test(lines[i])) {
        paragraphLines.push(lines[i])
        i++
      }

      if (paragraphLines.length > 0) {
        elements.push(
          <Typography key={i} variant="caption" sx={{ fontSize: 12, display: 'block', mb: 1, lineHeight: 1.6, color: 'text.primary' }}>
            {parseInline(paragraphLines.join(' '))}
          </Typography>
        )
      }
    }
  }

  return <Box sx={{ '& strong': { fontWeight: 700 }, '& em': { fontStyle: 'italic' } }}>{elements}</Box>
}
