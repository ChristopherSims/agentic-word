import React, { type FC, useEffect, useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Chip,
  LinearProgress,
  Fade,
  Card,
  CardContent
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { useAppStore } from '../store/app-store'

export interface InlineSuggestion {
  id: string
  type: 'completion' | 'next-sentence' | 'missing-word' | 'argument'
  text: string
  confidence: number
  context?: string
  position?: { top: number; left: number }
}

interface InlineSuggestionTooltipProps {
  suggestion: InlineSuggestion | null
  isLoading?: boolean
  onAccept: (suggestionId: string) => void
  onDismiss: (suggestionId: string) => void
  visible?: boolean
}

export const InlineSuggestionTooltip: FC<InlineSuggestionTooltipProps> = ({
  suggestion,
  isLoading = false,
  onAccept,
  onDismiss,
  visible = true
}) => {
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    setShouldShow(visible && !!suggestion && !isLoading)
  }, [suggestion, isLoading, visible])

  if (!suggestion || !shouldShow) return null

  const typeLabels: Record<string, string> = {
    completion: '💬 Complete',
    'next-sentence': '→ Next',
    'missing-word': '? Missing',
    argument: '⚡ Argument'
  }

  const typeColors: Record<string, any> = {
    completion: { bg: '#E3F2FD', border: '#1976D2' },
    'next-sentence': { bg: '#F3E5F5', border: '#7B1FA2' },
    'missing-word': { bg: '#FFF3E0', border: '#F57C00' },
    argument: { bg: '#E8F5E9', border: '#388E3C' }
  }

  const colors = typeColors[suggestion.type] || typeColors.completion

  return (
    <Fade in={true}>
      <Box
        sx={{
          position: 'fixed',
          zIndex: 10000,
          pointerEvents: 'auto',
          ...((suggestion.position?.top && suggestion.position?.left) && {
            top: `${suggestion.position.top + 24}px`,
            left: `${suggestion.position.left}px`
          })
        }}
      >
        <Card
          sx={{
            bgcolor: colors.bg,
            border: `2px solid ${colors.border}`,
            borderRadius: 1.5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 320,
            maxWidth: 420
          }}
        >
          <CardContent sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              {/* Header with type and confidence */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <AutoAwesomeIcon sx={{ fontSize: 16, color: colors.border }} />
                  <Typography variant="caption" fontWeight={700} sx={{ fontSize: 11, color: colors.border }}>
                    {typeLabels[suggestion.type]}
                  </Typography>
                </Stack>
                <Chip
                  label={`${Math.round(suggestion.confidence * 100)}%`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 9, height: 18, color: colors.border, borderColor: colors.border }}
                />
              </Box>

              {/* Context if available */}
              {suggestion.context && (
                <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary', fontStyle: 'italic' }}>
                  "{suggestion.context.slice(0, 50)}..."
                </Typography>
              )}

              {/* Suggestion text */}
              <Box
                sx={{
                  bgcolor: 'white',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 0.75,
                  p: 1,
                  minHeight: 32
                }}
              >
                <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1.5, color: 'text.primary' }}>
                  {suggestion.text}
                </Typography>
              </Box>

              {/* Action buttons */}
              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<CheckIcon />}
                  onClick={() => onAccept(suggestion.id)}
                  sx={{ flex: 1, fontSize: 9, textTransform: 'none', height: 28 }}
                >
                  Accept (Tab)
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<CloseIcon />}
                  onClick={() => onDismiss(suggestion.id)}
                  sx={{ flex: 1, fontSize: 9, textTransform: 'none', height: 28 }}
                >
                  Dismiss (Esc)
                </Button>
              </Stack>

              {/* Confidence progress bar */}
              <LinearProgress
                variant="determinate"
                value={suggestion.confidence * 100}
                sx={{
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: colors.border
                  }
                }}
              />
            </Stack>
          </CardContent>
        </Card>

        {/* Keyboard hint */}
        <Typography
          variant="caption"
          sx={{
            fontSize: 8,
            color: 'text.secondary',
            display: 'block',
            mt: 0.5,
            textAlign: 'center'
          }}
        >
          Tab to accept • Esc to dismiss
        </Typography>
      </Box>
    </Fade>
  )
}
