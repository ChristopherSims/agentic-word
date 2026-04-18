import React, { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { useSuggestions } from '../hooks/useSuggestions'
import { InlineSuggestionTooltip, type InlineSuggestion } from './InlineSuggestionTooltip'

interface SuggestionsManagerProps {
  editorContent: string
  onSuggestionAccepted?: (suggestion: InlineSuggestion, text: string) => void
  children?: React.ReactNode
}

export const SuggestionsManager: FC<SuggestionsManagerProps> = ({
  editorContent,
  onSuggestionAccepted,
  children
}) => {
  const {
    inlineSuggestionsEnabled,
    inlineSuggestionTriggerWordCount,
    inlineSuggestionContextLength,
    inlineSuggestionDebounceMs,
    inlineSuggestionCooldownMs,
    editorSelection
  } = useAppStore()

  // Get cursor position from editor selection
  const cursorPosition = editorSelection?.from ?? 0

  const [displaySuggestion, setDisplaySuggestion] = useState<InlineSuggestion | null>(null)
  const [isLoadingInternal, setIsLoadingInternal] = useState(false)
  const lastSuggestionDismissedAtRef = useRef<number>(0)
  const currentSuggestionRef = useRef<InlineSuggestion | null>(null)

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
    debounceMs: inlineSuggestionDebounceMs,
    cooldownMs: inlineSuggestionCooldownMs
  })

  // Keep ref in sync with current value
  useEffect(() => {
    currentSuggestionRef.current = currentSuggestion
  }, [currentSuggestion])

  const lastSuggestionIdRef = useRef<string>('')

  // Sync internal suggestion state with cooldown enforcement (only run on ID change)
  useEffect(() => {
    setIsLoadingInternal(isLoading)
    const suggestion = currentSuggestionRef.current
    
    if (suggestion) {
      // Check if we're still in cooldown period
      const timeSinceDismissal = Date.now() - lastSuggestionDismissedAtRef.current
      if (timeSinceDismissal < inlineSuggestionCooldownMs) {
        // Still in cooldown, don't show the suggestion
        setDisplaySuggestion(null)
        return
      }

      // Not in cooldown, show the suggestion (if it's a new one)
      if (lastSuggestionIdRef.current !== suggestion.id) {
        setDisplaySuggestion(suggestion)
        lastSuggestionIdRef.current = suggestion.id
      }
    } else {
      setDisplaySuggestion(null)
    }
  }, [currentSuggestion?.id, isLoading, inlineSuggestionCooldownMs])

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
    // Record dismissal time for cooldown
    lastSuggestionDismissedAtRef.current = Date.now()
    setDisplaySuggestion(null)
  }, [acceptSuggestion, displaySuggestion, onSuggestionAccepted])

  // Handle dismissal with button click
  const handleDismiss = useCallback((suggestionId: string) => {
    dismissSuggestion(suggestionId)
    // Record dismissal time for cooldown
    lastSuggestionDismissedAtRef.current = Date.now()
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
