import React, { useState, useCallback, useMemo, useEffect, useRef, FC } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { FixedSizeList as List } from 'react-window'

interface VirtualizedEditorProps {
  content: string
  onContentChange: (content: string) => void
  lineHeight?: number
  itemSize?: number // Height of each line in pixels
  overscanCount?: number // Number of items to render outside visible area
  maxHeight?: number | string
}

const ITEM_SIZE = 20 // Default line height in pixels
const OVERSCAN_COUNT = 5

/**
 * Virtualized Editor Component
 * Efficiently renders large documents using react-window
 * Only renders visible lines + overscan
 */
export const VirtualizedEditor: FC<VirtualizedEditorProps> = ({
  content,
  onContentChange,
  lineHeight,
  itemSize = ITEM_SIZE,
  overscanCount = OVERSCAN_COUNT,
  maxHeight = '100%'
}) => {
  const lines = useMemo(() => content.split('\n'), [content])
  const listRef = useRef<List>(null)
  const [editedLines, setEditedLines] = useState(new Map<number, string>())

  const handleLineChange = useCallback((lineIndex: number, newText: string) => {
    const newEditedLines = new Map(editedLines)
    newEditedLines.set(lineIndex, newText)
    setEditedLines(newEditedLines)

    // Update content
    const newLines = [...lines]
    newLines[lineIndex] = newText
    onContentChange(newLines.join('\n'))
  }, [editedLines, lines, onContentChange])

  const Row: FC<{ index: number; style: React.CSSProperties }> = ({ index, style }) => {
    const line = lines[index]
    const editedContent = editedLines.get(index)
    const displayContent = editedContent !== undefined ? editedContent : line

    return (
      <Box
        style={style}
        sx={{
          display: 'flex',
          alignItems: 'center',
          fontFamily: 'monospace',
          fontSize: '12px',
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: index % 2 === 0 ? 'background.paper' : 'action.hover',
          '&:hover': {
            backgroundColor: 'action.selected'
          }
        }}
      >
        {/* Line number */}
        <Box
          sx={{
            width: 50,
            textAlign: 'right',
            paddingRight: 1,
            color: 'text.secondary',
            backgroundColor: 'background.default',
            borderRight: '1px solid',
            borderColor: 'divider',
            userSelect: 'none',
            flexShrink: 0
          }}
        >
          <Typography variant="caption" sx={{ fontSize: '11px' }}>
            {index + 1}
          </Typography>
        </Box>

        {/* Line content */}
        <input
          type="text"
          value={displayContent}
          onChange={(e) => handleLineChange(index, e.target.value)}
          style={{
            flex: 1,
            border: 'none',
            fontFamily: 'monospace',
            fontSize: '12px',
            padding: '4px 8px',
            backgroundColor: 'transparent',
            outline: 'none',
            width: '100%'
          }}
        />
      </Box>
    )
  }

  return (
    <Paper
      sx={{
        maxHeight,
        overflow: 'hidden',
        backgroundColor: 'background.paper',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      <List
        ref={listRef}
        height={typeof maxHeight === 'number' ? maxHeight : 600}
        itemCount={lines.length}
        itemSize={itemSize}
        width="100%"
        overscanCount={overscanCount}
      >
        {Row}
      </List>
    </Paper>
  )
}

/**
 * Get line count from content
 */
export function getLineCount(content: string): number {
  return content.split('\n').length
}

/**
 * Estimate rendering performance
 */
export function estimateVirtualizationBenefit(contentSize: number, lineCount: number): {
  shouldVirtualize: boolean
  benefit: number
} {
  // Virtualize if more than 1000 lines or content > 1MB
  const shouldVirtualize = lineCount > 1000 || contentSize > 1024 * 1024
  
  if (!shouldVirtualize) {
    return { shouldVirtualize: false, benefit: 0 }
  }

  // Estimate rendering benefit
  // Visible area typically shows ~50 lines
  const visibleLines = 50
  const renderingReduction = ((lineCount - visibleLines) / lineCount) * 100

  return { shouldVirtualize: true, benefit: renderingReduction }
}
