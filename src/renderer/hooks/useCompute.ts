/**
 * useCompute — React hook for Rust compute bridge
 * v0.7.0: Wraps window.wordapp.compute.* IPC calls with loading/error states.
 * Falls back to TS when Rust addon is unavailable.
 */
import { useCallback, useState } from 'react'

// ─── Types ───

export interface AnalysisResult {
  readabilityScore: number
  tone: string
  keywords: string[]
  stats: {
    wordCount: number
    charCount: number
    sentenceCount: number
    paragraphCount: number
  }
}

export interface SearchResult {
  documentId: string
  title: string
  snippet: string
  score: number
}

export interface LanguageCheckResult {
  spell_issues: Array<{ word: string; position: number; suggestions: string[] }>
  grammar_issues: Array<{ id: string; position: number; original: string; suggestion: string; explanation: string; confidence: number }>
}

export interface DocStats {
  fleschKincaid: number
  avgSentenceLen: number
  paragraphCount: number
  readingTimeMin: number
  sentenceCount: number
  syllableCount: number
}

// ─── Hook State ───

interface ComputeState {
  rustAvailable: boolean | null
  checking: boolean
  // Per-operation loading states
  loadingAnalysis: boolean
  loadingSearch: boolean
  loadingLanguage: boolean
  loadingFormat: boolean
  loadingStats: boolean
  // Error states
  analysisError: string | null
  searchError: string | null
  languageError: string | null
  formatError: string | null
  statsError: string | null
}

const initialState: ComputeState = {
  rustAvailable: null,
  checking: false,
  loadingAnalysis: false,
  loadingSearch: false,
  loadingLanguage: false,
  loadingFormat: false,
  loadingStats: false,
  analysisError: null,
  searchError: null,
  languageError: null,
  formatError: null,
  statsError: null
}

// ─── Hook ───

export function useCompute() {
  const [state, setState] = useState<ComputeState>(initialState)

  // ─── Rust availability ───

  const checkRust = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, checking: true }))
    try {
      const available = await window.wordapp?.compute.isRustAvailable()
      setState((s) => ({ ...s, rustAvailable: !!available, checking: false }))
      return !!available
    } catch {
      setState((s) => ({ ...s, rustAvailable: false, checking: false }))
      return false
    }
  }, [])

  // ─── Document Analysis ───

  const analyzeDocument = useCallback(
    async (pmJson: string): Promise<AnalysisResult | null> => {
      setState((s) => ({ ...s, loadingAnalysis: true, analysisError: null }))
      try {
        const result = await window.wordapp?.compute.analyzeDocument(pmJson)
        setState((s) => ({ ...s, loadingAnalysis: false }))
        return result || null
      } catch (err) {
        const msg = (err as Error).message
        setState((s) => ({ ...s, loadingAnalysis: false, analysisError: msg }))
        return null
      }
    },
    []
  )

  // ─── Document Search ───

  const searchDocuments = useCallback(
    async (query: string, limit?: number): Promise<SearchResult[]> => {
      setState((s) => ({ ...s, loadingSearch: true, searchError: null }))
      try {
        const results = await window.wordapp?.compute.searchDocuments(query, limit)
        setState((s) => ({ ...s, loadingSearch: false }))
        return Array.isArray(results) ? results : []
      } catch (err) {
        const msg = (err as Error).message
        setState((s) => ({ ...s, loadingSearch: false, searchError: msg }))
        return []
      }
    },
    []
  )

  // ─── Language Check (Spell + Grammar) ───

  const checkLanguage = useCallback(
    async (pmJson: string): Promise<LanguageCheckResult | null> => {
      setState((s) => ({ ...s, loadingLanguage: true, languageError: null }))
      try {
        const result = await window.wordapp?.compute.checkLanguage(pmJson)
        setState((s) => ({ ...s, loadingLanguage: false }))
        return result || null
      } catch (err) {
        const msg = (err as Error).message
        setState((s) => ({ ...s, loadingLanguage: false, languageError: msg }))
        return null
      }
    },
    []
  )

  // ─── Format Document ───

  const formatDocument = useCallback(
    async (pmJson: string): Promise<string | null> => {
      setState((s) => ({ ...s, loadingFormat: true, formatError: null }))
      try {
        const result = await window.wordapp?.compute.formatDocument(pmJson)
        setState((s) => ({ ...s, loadingFormat: false }))
        return result || null
      } catch (err) {
        const msg = (err as Error).message
        setState((s) => ({ ...s, loadingFormat: false, formatError: msg }))
        return null
      }
    },
    []
  )

  // ─── Document Stats ───

  const getStats = useCallback(
    async (htmlContent: string): Promise<DocStats | null> => {
      setState((s) => ({ ...s, loadingStats: true, statsError: null }))
      try {
        const result = await window.wordapp?.compute.getStats(htmlContent)
        setState((s) => ({ ...s, loadingStats: false }))
        return result || null
      } catch (err) {
        const msg = (err as Error).message
        setState((s) => ({ ...s, loadingStats: false, statsError: msg }))
        return null
      }
    },
    []
  )

  return {
    ...state,
    checkRust,
    analyzeDocument,
    searchDocuments,
    checkLanguage,
    formatDocument,
    getStats
  }
}
