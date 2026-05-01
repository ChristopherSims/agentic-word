/**
 * useCompute — React hook for Rust compute bridge
 * v0.7.0: Wraps window.wordapp.compute.* IPC calls with loading/error states.
 * Falls back to TS when Rust addon is unavailable.
 */
import { useCallback, useState } from 'react'

interface ComputeState {
  rustAvailable: boolean | null
  checking: boolean
}

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

export function useCompute() {
  const [state, setState] = useState<ComputeState>({
    rustAvailable: null,
    checking: false
  })

  const checkRust = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, checking: true }))
    try {
      const available = await window.wordapp?.compute.isRustAvailable()
      setState({ rustAvailable: !!available, checking: false })
      return !!available
    } catch {
      setState({ rustAvailable: false, checking: false })
      return false
    }
  }, [])

  const analyzeDocument = useCallback(
    async (pmJson: string): Promise<AnalysisResult | null> => {
      try {
        const result = await window.wordapp?.compute.analyzeDocument(pmJson)
        return result || null
      } catch {
        return null
      }
    },
    []
  )

  const searchDocuments = useCallback(
    async (query: string, limit?: number): Promise<SearchResult[]> => {
      try {
        const results = await window.wordapp?.compute.searchDocuments(query, limit)
        return Array.isArray(results) ? results : []
      } catch {
        return []
      }
    },
    []
  )

  return {
    ...state,
    checkRust,
    analyzeDocument,
    searchDocuments
  }
}
