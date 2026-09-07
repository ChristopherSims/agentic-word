/**
 * Enhanced Editor with AI Suggestions
 * Wraps EditorPanel with SuggestionsManager and advanced AI features
 */

import React, { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { EditorPanel } from './EditorPanel'
import { SuggestionsManager } from './SuggestionsManager'
import { useAppStore } from '../store/app-store'
import {
  checkGrammar,
  SuggestionCache,
  SuggestionAnalyticsTracker,
  hashText,
  inferUserPreference,
  type GrammarSuggestion,
  type SuggestionAnalytics
} from '../utils/advanced-suggestions'
import type { InlineSuggestion } from './InlineSuggestionTooltip'

export const EnhancedEditorPanel: FC = () => {
  const documentContent = useAppStore((s) => s.documentContent)
  const editorSelection = useAppStore((s) => s.editorSelection)

  // Advanced suggestions
  const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([])

  // Debouncing and caching
  const grammarCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionCacheRef = useRef(new SuggestionCache())
  const analyticsTrackerRef = useRef(new SuggestionAnalyticsTracker())

  // Debounced grammar checking — gated behind 2s inactivity to avoid CPU during typing
  useEffect(() => {
    if (!documentContent) return

    if (grammarCheckTimerRef.current) clearTimeout(grammarCheckTimerRef.current)

    grammarCheckTimerRef.current = setTimeout(() => {
      const textHash = hashText(documentContent)
      let suggestions = suggestionCacheRef.current.get(textHash)

      if (!suggestions) {
        suggestions = checkGrammar(documentContent)
        suggestionCacheRef.current.set(textHash, suggestions)
      }

      setGrammarSuggestions(suggestions)
    }, 2000) // Gate behind 2s of inactivity to avoid lag during fast typing
  }, [documentContent])

  // Handle suggestion acceptance (callback from SuggestionsManager)
  const handleSuggestionAccepted = useCallback(
    (suggestion: InlineSuggestion, text: string) => {
      // Queue the suggestion for insertion through the editor
      // EditorPanel will listen to this and insert at the current cursor position
      useAppStore.getState().setPendingSuggestionInsert(text)

      // Track analytics (debounced batch)
      const currentContent = useAppStore.getState().documentContent
      const analyticsEvent: SuggestionAnalytics = {
        suggestionId: suggestion.id,
        type: 'accepted',
        suggestionCategory: suggestion.type,
        timestamp: Date.now(),
        documentLength: currentContent.length,
        responseTime: 0
      }
      analyticsTrackerRef.current.track(analyticsEvent)

      // Update user preference based on acceptance
      const accepted = grammarSuggestions.filter(s => s.id === suggestion.id)
      if (accepted.length > 0) {
        const currentPreference = useAppStore.getState().userPreference || {
          tone: 'neutral' as const,
          vocabulary: 'mixed' as const,
          customTerms: {}
        }
        const newPreference = inferUserPreference(accepted)
        useAppStore.getState().setUserPreference?.({ 
          tone: newPreference.tone ?? currentPreference.tone,
          vocabulary: newPreference.vocabulary ?? currentPreference.vocabulary,
          customTerms: { ...currentPreference.customTerms, ...newPreference.customTerms }
        })
      }

      useAppStore.getState().addToast('success', 'Suggestion applied')
    },
    [grammarSuggestions]
  )

  // Cleanup: flush analytics on unmount
  useEffect(() => {
    return () => {
      analyticsTrackerRef.current.flush()
    }
  }, [])

  // Handle editor operations from agent tools via store dispatch
  // (AgentWorkspacePanel listens for agent-tool-apply and dispatches to store)
  useEffect(() => {
    // This effect is mainly for tracking/future use - the actual operation
    // is applied in EditorPanel via pendingEditorOperation state
    console.log('[EnhancedEditorPanel] Editor operation handling delegated to AgentWorkspacePanel → store → EditorPanel')
  }, [])

  return (
    <SuggestionsManager
      editorContent={documentContent}
      onSuggestionAccepted={handleSuggestionAccepted}
    >
      <EditorPanel />
    </SuggestionsManager>
  )
}
