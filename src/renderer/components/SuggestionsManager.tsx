import React, { type FC, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { useSuggestions } from '../hooks/useSuggestions'
import type { InlineSuggestion } from './InlineSuggestionTooltip'

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
  const inlineSuggestionsEnabled = useAppStore((s) => s.inlineSuggestionsEnabled)
  const inlineSuggestionTriggerWordCount = useAppStore((s) => s.inlineSuggestionTriggerWordCount)
  const inlineSuggestionContextLength = useAppStore((s) => s.inlineSuggestionContextLength)
  const inlineSuggestionDebounceMs = useAppStore((s) => s.inlineSuggestionDebounceMs)
  const inlineSuggestionCooldownMs = useAppStore((s) => s.inlineSuggestionCooldownMs)
  const editorSelection = useAppStore((s) => s.editorSelection)

  // Get cursor position from editor selection
  const cursorPosition = editorSelection?.from ?? 0

  const [isLoadingInternal, setIsLoadingInternal] = useState(false)
  const lastSuggestionDismissedAtRef = useRef<number>(0)
  const currentSuggestionRef = useRef<InlineSuggestion | null>(null)

  const {
    currentSuggestion,
    isLoading,
    acceptSuggestion,
    dismissSuggestion,
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

  // Sync inline suggestion text to the store so EditorPanel can push it
  // into the InlineSuggestionGhost TipTap extension (grey ghost text).
  useEffect(() => {
    setIsLoadingInternal(isLoading)
    const suggestion = currentSuggestionRef.current

    if (suggestion) {
      const timeSinceDismissal = Date.now() - lastSuggestionDismissedAtRef.current
      if (timeSinceDismissal < inlineSuggestionCooldownMs) {
        useAppStore.getState().setInlineSuggestion(null)
        return
      }

      if (lastSuggestionIdRef.current !== suggestion.id) {
        // Push the suggestion text into the store → EditorPanel bridges it to TipTap
        useAppStore.getState().setInlineSuggestion(suggestion.text)
        lastSuggestionIdRef.current = suggestion.id
      }
    } else {
      useAppStore.getState().setInlineSuggestion(null)
    }
  }, [currentSuggestion?.id, isLoading, inlineSuggestionCooldownMs])

  return <>{children}</>
}
