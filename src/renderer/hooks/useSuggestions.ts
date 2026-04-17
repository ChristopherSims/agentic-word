import { useCallback, useEffect, useRef, useState } from 'react'
import { useAIWriter } from './useAIWriter'
import type { InlineSuggestion } from '../components/InlineSuggestionTooltip'

export interface UseSuggestionsOptions {
  enabled?: boolean
  triggerWordCount?: number
  contextLength?: number
  debounceMs?: number
}

export const useSuggestions = (
  editorContent: string,
  cursorPosition: number,
  options: UseSuggestionsOptions = {}
) => {
  const {
    enabled = true,
    triggerWordCount = 3,
    contextLength = 150,
    debounceMs = 1000
  } = options

  const [currentSuggestion, setCurrentSuggestion] = useState<InlineSuggestion | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [cursorPos, setCursorPos] = useState<{ top: number; left: number } | null>(null)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSuggestionIdRef = useRef<string>('')

  const { paraphrase } = useAIWriter({
    onError: () => {
      setIsLoading(false)
      setCurrentSuggestion(null)
    }
  })

  // Extract context around cursor
  const getContext = useCallback(() => {
    const start = Math.max(0, cursorPosition - contextLength)
    const end = Math.min(editorContent.length, cursorPosition + contextLength)
    return editorContent.slice(start, end)
  }, [editorContent, cursorPosition, contextLength])

  // Check if we should trigger suggestions
  const shouldTriggerSuggestions = useCallback(() => {
    if (!enabled || !editorContent) return false

    const context = getContext()
    const words = context.trim().split(/\s+/).length

    return words >= triggerWordCount
  }, [enabled, editorContent, triggerWordCount, getContext])

  // Generate suggestions based on context
  const generateSuggestions = useCallback(async () => {
    if (!shouldTriggerSuggestions()) {
      setCurrentSuggestion(null)
      return
    }

    setIsLoading(true)
    const context = getContext()
    const cleanContext = context.replace(/<[^>]+>/g, '').trim()

    try {
      // Determine suggestion type based on context
      const endsWith = cleanContext.slice(-30)
      const hasPunctuation = /[.!?]$/.test(endsWith)

      let suggestionType: 'completion' | 'next-sentence' | 'missing-word' | 'argument' = 'completion'

      if (hasPunctuation && cleanContext.length > 20) {
        suggestionType = 'next-sentence'
      } else if (endsWith.includes('because') || endsWith.includes('since') || endsWith.includes('if')) {
        suggestionType = 'argument'
      }

      // Generate suggestion based on type
      let suggestionText = ''
      let confidence = 0.8

      switch (suggestionType) {
        case 'next-sentence': {
          // Next sentence prediction
          const sentences = cleanContext.split(/[.!?]+/).filter(s => s.trim())
          if (sentences.length > 0) {
            const lastSentence = sentences[sentences.length - 1].trim()
            // Simulate next sentence (in real implementation, use LLM)
            suggestionText = 'Consider continuing with a new perspective or supporting detail...'
            confidence = 0.75
          }
          break
        }

        case 'argument': {
          // Argument suggestion
          suggestionText = 'You could strengthen this by providing an example or statistic that supports your point.'
          confidence = 0.72
          break
        }

        case 'completion': {
          // Word completion/paraphrase suggestion
          const lastWords = cleanContext.slice(-50)
          try {
            const suggestions = await paraphrase(lastWords, 1)
            if (Array.isArray(suggestions) && suggestions.length > 0) {
              suggestionText = suggestions[0].slice(0, 80) + (suggestions[0].length > 80 ? '...' : '')
              confidence = 0.78
            }
          } catch {
            suggestionText = 'Rephrase for clarity: Consider simplifying or restructuring this phrase.'
            confidence = 0.65
          }
          break
        }

        default:
          break
      }

      if (suggestionText) {
        const suggestionId = `suggestion-${Date.now()}`
        lastSuggestionIdRef.current = suggestionId

        setCurrentSuggestion({
          id: suggestionId,
          type: suggestionType,
          text: suggestionText,
          confidence,
          context: cleanContext.slice(-40),
          position: cursorPos || undefined
        })
      }
    } catch (error) {
      console.error('Error generating suggestions:', error)
      setCurrentSuggestion(null)
    } finally {
      setIsLoading(false)
    }
  }, [shouldTriggerSuggestions, getContext, paraphrase, cursorPos])

  // Debounced trigger
  useEffect(() => {
    if (!enabled || !editorContent) {
      setCurrentSuggestion(null)
      return
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      generateSuggestions()
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [editorContent, cursorPosition, enabled, debounceMs, generateSuggestions])

  // Handle acceptance
  const acceptSuggestion = useCallback((suggestionId: string) => {
    if (suggestionId === lastSuggestionIdRef.current && currentSuggestion) {
      return currentSuggestion.text
    }
    setCurrentSuggestion(null)
    return null
  }, [currentSuggestion])

  // Handle dismissal
  const dismissSuggestion = useCallback((suggestionId: string) => {
    if (suggestionId === lastSuggestionIdRef.current) {
      setCurrentSuggestion(null)
    }
  }, [])

  // Update cursor position (call this from editor)
  const updateCursorPos = useCallback((top: number, left: number) => {
    setCursorPos({ top, left })
  }, [])

  return {
    currentSuggestion,
    isLoading,
    acceptSuggestion,
    dismissSuggestion,
    updateCursorPos,
    setCurrentSuggestion
  }
}
