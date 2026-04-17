import React, { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { useSuggestions } from '../hooks/useSuggestions'
import { InlineSuggestionTooltip, type InlineSuggestion } from './InlineSuggestionTooltip'

interface SuggestionsManagerProps {
  editorContent: string
  cursorPosition: number
  onSuggestionAccepted?: (suggestion: InlineSuggestion, text: string) => void
  children?: React.ReactNode
}

export const SuggestionsManager: FC<SuggestionsManagerProps> = ({
  editorContent,
  cursorPosition,
  onSuggestionAccepted,
  children
}) => {
  const {
    inlineSuggestionsEnabled,
    inlineSuggestionTriggerWordCount,
    inlineSuggestionContextLength,
    inlineSuggestionDebounceMs
  } = useAppStore()

  const [displaySuggestion, setDisplaySuggestion] = useState<InlineSuggestion | null>(null)
  const [isLoadingInternal, setIsLoadingInternal] = useState(false)

  const {
    currentSuggestion,
    isLoading,
    acceptSuggestion,
    dismissSuggestion,
    updateCursorPos,
    setCurrentSuggestion
  } = useSuggestions(editorContent, cursorPosition, {
    enabled: inlineSuggestionsEnabled,
    triggerWordCount: inlineSuggestionTriggerWordCount,
    contextLength: inlineSuggestionContextLength,
    debounceMs: inlineSuggestionDebounceMs
  })

  const lastSuggestionIdRef = useRef<string>('')

  // Sync internal suggestion state
  useEffect(() => {
    setDisplaySuggestion(currentSuggestion)
    setIsLoadingInternal(isLoading)
    if (currentSuggestion) {
      lastSuggestionIdRef.current = currentSuggestion.id
    }
  }, [currentSuggestion, isLoading])

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!displaySuggestion) return

      // Accept suggestion with Tab
      if (e.key === 'Tab') {
        e.preventDefault()
        const text = acceptSuggestion(displaySuggestion.id)
        if (text) {
          onSuggestionAccepted?.(displaySuggestion, text)
          setDisplaySuggestion(null)
        }
        return
      }

      // Dismiss suggestion with Escape
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissSuggestion(displaySuggestion.id)
        setDisplaySuggestion(null)
        return
      }
    },
    [displaySuggestion, acceptSuggestion, dismissSuggestion, onSuggestionAccepted]
  )

  // Add keyboard listener
  useEffect(() => {
    if (!inlineSuggestionsEnabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [inlineSuggestionsEnabled, handleKeyDown])

  // Handle acceptance with button click
  const handleAccept = useCallback((suggestionId: string) => {
    const text = acceptSuggestion(suggestionId)
    if (text && displaySuggestion) {
      onSuggestionAccepted?.(displaySuggestion, text)
    }
    setDisplaySuggestion(null)
  }, [acceptSuggestion, displaySuggestion, onSuggestionAccepted])

  // Handle dismissal with button click
  const handleDismiss = useCallback((suggestionId: string) => {
    dismissSuggestion(suggestionId)
    setDisplaySuggestion(null)
  }, [dismissSuggestion])

  return (
    <>
      {children}
      {inlineSuggestionsEnabled && (
        <InlineSuggestionTooltip
          suggestion={displaySuggestion}
          isLoading={isLoadingInternal}
          onAccept={handleAccept}
          onDismiss={handleDismiss}
          visible={true}
        />
      )}
    </>
  )
}
