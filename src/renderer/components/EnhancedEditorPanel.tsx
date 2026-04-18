/**
 * Enhanced Editor with AI Suggestions - v0.5.3 Phase 3 & 4
 * Wraps EditorPanel with SuggestionsManager and advanced AI features
 */

import React, { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { EditorPanel } from './EditorPanel'
import { SuggestionsManager } from './SuggestionsManager'
import { useAppStore } from '../store/app-store'
import {
  checkGrammar,
  analyzeContextConsistency,
  scoreReadability,
  SuggestionCache,
  SuggestionAnalyticsTracker,
  hashText,
  inferUserPreference,
  type GrammarSuggestion,
  type ContextAwareSuggestion,
  type SuggestionAnalytics
} from '../utils/advanced-suggestions'
import type { InlineSuggestion } from './InlineSuggestionTooltip'

export const EnhancedEditorPanel: FC = () => {
  const { documentContent } = useAppStore()

  // Phase 3: Integration state
  const [cursorPosition, setCursorPosition] = useState(0)
  const [editorElement, setEditorElement] = useState<HTMLElement | null>(null)

  // Phase 4: Advanced suggestions
  const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([])
  const [contextSuggestions, setContextSuggestions] = useState<ContextAwareSuggestion[]>([])
  const [readabilityScore, setReadabilityScore] = useState(0)

  // Debouncing and caching
  const grammarCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionCacheRef = useRef(new SuggestionCache())
  const analyticsTrackerRef = useRef(new SuggestionAnalyticsTracker())

  // Track cursor position
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        // Simple cursor position estimation
        const preRange = range.cloneRange()
        preRange.selectNodeContents(document.querySelector('.tiptap') || document.body)
        preRange.setEnd(range.endContainer, range.endOffset)
        setCursorPosition(preRange.toString().length)
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  // Phase 4: Debounced grammar checking
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
    }, 500) // Debounce grammar check by 500ms
  }, [documentContent])

  // Phase 4: Debounced context-aware analysis
  useEffect(() => {
    if (!documentContent) return

    if (contextCheckTimerRef.current) clearTimeout(contextCheckTimerRef.current)

    contextCheckTimerRef.current = setTimeout(() => {
      const userPreference = useAppStore.getState().userPreference || {
        tone: 'neutral',
        vocabulary: 'mixed',
        customTerms: {}
      }

      const suggestions = analyzeContextConsistency(documentContent, userPreference)
      setContextSuggestions(suggestions)

      // Score readability
      const { score } = scoreReadability(documentContent)
      setReadabilityScore(score)
    }, 800) // Debounce context check by 800ms
  }, [documentContent])

  // Phase 3: Handle suggestion acceptance (callback from SuggestionsManager)
  const handleSuggestionAccepted = useCallback(
    (suggestion: InlineSuggestion, text: string) => {
      const { from, to } = useAppStore.getState().editorSelection || { from: 0, to: 0 }

      // Insert the suggested text
      const currentContent = useAppStore.getState().documentContent
      const newContent = currentContent.slice(0, from) + text + currentContent.slice(to)
      useAppStore.getState().setDocumentContent(newContent)

      // Track analytics (debounced batch)
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
        const newPreference = inferUserPreference(accepted)
        useAppStore.getState().setUserPreference?.({ ...useAppStore.getState().userPreference, ...newPreference })
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

  return (
    <SuggestionsManager
      editorContent={documentContent}
      cursorPosition={cursorPosition}
      onSuggestionAccepted={handleSuggestionAccepted}
    >
      <EditorPanel />

      {/* Phase 4: Display advanced suggestions below editor (optional UI) */}
      {(grammarSuggestions.length > 0 || contextSuggestions.length > 0) && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          maxHeight: '80px',
          overflow: 'auto'
        }}>
          {grammarSuggestions.length > 0 && (
            <div>
              <strong>✓ Grammar:</strong> {grammarSuggestions.length} issue{grammarSuggestions.length !== 1 ? 's' : ''}
            </div>
          )}
          {contextSuggestions.length > 0 && (
            <div>
              <strong>✓ Style:</strong> {contextSuggestions.length} suggestion{contextSuggestions.length !== 1 ? 's' : ''}
            </div>
          )}
          {readabilityScore > 0 && (
            <div>
              <strong>📊 Readability:</strong> {readabilityScore}/100
            </div>
          )}
        </div>
      )}
    </SuggestionsManager>
  )
}
