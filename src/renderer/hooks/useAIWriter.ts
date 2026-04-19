import { useCallback } from 'react'

export interface UseAIWriterOptions {
  onSuccess?: (result: any) => void
  onError?: (error: string) => void
}

export const useAIWriter = (options: UseAIWriterOptions = {}) => {
  const generateOutline = useCallback(
    async (topic: string, depth: number = 2) => {
      try {
        const result = await window.wordapp.ai.generateOutline(topic, depth)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  const generateTitles = useCallback(
    async (topic: string, count: number = 5) => {
      try {
        const result = await window.wordapp.ai.generateTitles(topic, count)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  const generateIntroduction = useCallback(
    async (topic: string, style: 'brief' | 'medium' | 'detailed' = 'medium') => {
      try {
        const result = await window.wordapp.ai.generateIntroduction(topic, style)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  const generateConclusion = useCallback(
    async (docType: string, mainPoints: string[], style: 'brief' | 'medium' | 'detailed' = 'medium') => {
      try {
        const result = await window.wordapp.ai.generateConclusion(docType, mainPoints, style)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  const adjustTone = useCallback(
    async (text: string, targetTone: 'formal' | 'casual' | 'professional') => {
      try {
        const result = await window.wordapp.ai.adjustTone(text, targetTone)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  const paraphrase = useCallback(
    async (text: string, count: number = 3) => {
      try {
        const result = await window.wordapp.ai.paraphrase(text, count)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  const adjustComplexity = useCallback(
    async (text: string, level: 'simple' | 'moderate' | 'advanced') => {
      try {
        const result = await window.wordapp.ai.adjustComplexity(text, level)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  const translate = useCallback(
    async (text: string, targetLanguage: string) => {
      try {
        const result = await window.wordapp.ai.translate(text, targetLanguage)
        options.onSuccess?.(result)
        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        options.onError?.(errorMsg)
        throw error
      }
    },
    [options]
  )

  return {
    generateOutline,
    generateTitles,
    generateIntroduction,
    generateConclusion,
    adjustTone,
    paraphrase,
    adjustComplexity,
    translate
  }
}
