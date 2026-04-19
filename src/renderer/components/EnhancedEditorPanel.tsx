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
  const { documentContent, editorSelection } = useAppStore()

  // Phase 4: Advanced suggestions
  const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([])
  const [contextSuggestions, setContextSuggestions] = useState<ContextAwareSuggestion[]>([])
  const [readabilityScore, setReadabilityScore] = useState(0)

  // Debouncing and caching
  const grammarCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionCacheRef = useRef(new SuggestionCache())
  const analyticsTrackerRef = useRef(new SuggestionAnalyticsTracker())

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

  // Handle editor operations from agent tools
  useEffect(() => {
    const handleInsertContent = (data: unknown) => {
      const insertData = data as { content?: string; position?: string }
      console.log('[EnhancedEditorPanel] Inserting content:', insertData)
      // Dispatch to store action that EditorPanel will handle
      useAppStore.getState().setPendingEditorOperation({
        type: 'insert',
        content: insertData.content || '',
        position: insertData.position as 'end' | 'start' | 'cursor' || 'end'
      })
    }

    const handleReplaceText = (data: unknown) => {
      const replaceData = data as { search?: string; replace?: string; replaceAll?: boolean }
      console.log('[EnhancedEditorPanel] Replacing text:', replaceData)
      // Dispatch to store action that EditorPanel will handle
      useAppStore.getState().setPendingEditorOperation({
        type: 'replace',
        search: replaceData.search || '',
        replace: replaceData.replace || '',
        replaceAll: replaceData.replaceAll !== false
      })
    }

    const unsubInsert = window.wordapp?.on('editor-insert-content', handleInsertContent as any) as (() => void) | undefined
    const unsubReplace = window.wordapp?.on('editor-replace-text', handleReplaceText as any) as (() => void) | undefined

    return () => {
      unsubInsert?.()
      unsubReplace?.()
    }
  }, [])

  return (
    <SuggestionsManager
      editorContent={documentContent}
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
