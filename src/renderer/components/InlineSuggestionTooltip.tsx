import React, { type FC, useEffect, useState, useRef } from 'react'
import {
  Box,
  Typography,
  Button,
  Stack,
  Fade,
  LinearProgress
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
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
  const { inlineSuggestionTimeoutMs } = useAppStore()
  const [shouldShow, setShouldShow] = useState(false)
  const [remainingTime, setRemainingTime] = useState(inlineSuggestionTimeoutMs / 1000)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const suggestionIdRef = useRef<string | null>(null)

  // Auto-dismiss with configurable timeout
  useEffect(() => {
    if (!visible || !suggestion || isLoading) {
      setShouldShow(false)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      suggestionIdRef.current = null
      return
    }

    // Only show if this is a new suggestion (different ID)
    if (suggestionIdRef.current === suggestion.id) {
      return // Same suggestion, don't reset the timer
    }

    suggestionIdRef.current = suggestion.id
    setShouldShow(true)
    setRemainingTime(inlineSuggestionTimeoutMs / 1000)

    // Auto-dismiss after configured timeout
    timeoutRef.current = setTimeout(() => {
      onDismiss(suggestion.id)
      setShouldShow(false)
    }, inlineSuggestionTimeoutMs)

    // Update progress bar every 100ms
    progressIntervalRef.current = setInterval(() => {
      setRemainingTime(prev => Math.max(0, prev - 0.1))
    }, 100)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [suggestion?.id, isLoading, visible, inlineSuggestionTimeoutMs])

  if (!suggestion || !shouldShow) return null

  return (
    <Fade in={shouldShow}>
      <Box
        sx={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          zIndex: 10000,
          pointerEvents: 'auto'
        }}
      >
        <Box
          sx={{
            backgroundColor: 'var(--color-surface, #1e1e2e)',
            border: '1px solid var(--color-border, #45475a)',
            borderRadius: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
            padding: '16px',
            minWidth: 300,
            maxWidth: 380
          }}
        >
          <Stack spacing={1.5}>
            {/* Header with suggestion type */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
              <Box>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    fontSize: 11, 
                    fontWeight: 600, 
                    color: 'var(--color-accent, #89b4fa)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  ✨ AI Suggestion
                </Typography>
              </Box>
              <Box
                sx={{
                  fontSize: '12px',
                  color: 'var(--color-text-secondary, #a6adc8)',
                  fontWeight: 500
                }}
              >
                {Math.round(remainingTime)}s
              </Box>
            </Box>

            {/* Suggestion text */}
            <Typography
              sx={{
                fontSize: '13px',
                color: 'var(--color-text, #cdd6f4)',
                lineHeight: 1.5,
                fontStyle: 'italic',
                fontWeight: 400
              }}
            >
              {suggestion.text}
            </Typography>

            {/* Action buttons */}
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                startIcon={<CheckIcon />}
                onClick={() => {
                  onAccept(suggestion.id)
                  setShouldShow(false)
                  if (timeoutRef.current) clearTimeout(timeoutRef.current)
                  if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
                }}
                sx={{
                  flex: 1,
                  fontSize: '11px',
                  textTransform: 'none',
                  height: 32,
                  backgroundColor: 'var(--color-accent, #89b4fa)',
                  color: 'var(--color-background, #1e1e1e)',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: 'var(--color-accent-hover, #a6c7ff)'
                  }
                }}
              >
                Accept
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CloseIcon />}
                onClick={() => {
                  onDismiss(suggestion.id)
                  setShouldShow(false)
                  if (timeoutRef.current) clearTimeout(timeoutRef.current)
                  if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
                }}
                sx={{
                  flex: 1,
                  fontSize: '11px',
                  textTransform: 'none',
                  height: 32,
                  color: 'var(--color-text-secondary, #a6adc8)',
                  borderColor: 'var(--color-border, #45475a)',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'var(--color-text-secondary, #a6adc8)'
                  }
                }}
              >
                Dismiss
              </Button>
            </Stack>

            {/* Progress bar */}
            <Box
              sx={{
                height: 2,
                backgroundColor: 'var(--color-border, #45475a)',
                borderRadius: 1,
                overflow: 'hidden'
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  backgroundColor: 'var(--color-accent, #89b4fa)',
                  width: `${(remainingTime / 10) * 100}%`,
                  transition: 'width 0.1s linear'
                }}
              />
            </Box>
          </Stack>
        </Box>
      </Box>
    </Fade>
  )
}
