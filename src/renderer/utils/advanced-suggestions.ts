/**
 * Advanced Suggestions Engine - Phase 4
 * Grammar correction, context-aware writing, and AI personalization
 */

export interface GrammarSuggestion {
  id: string
  type: 'grammar' | 'style' | 'tone' | 'readability'
  position: number
  originalText: string
  suggestion: string
  explanation: string
  confidence: number
  category: 'error' | 'warning' | 'info'
}

export interface ContextAwareSuggestion {
  id: string
  type: 'consistency' | 'vocabulary' | 'tone' | 'citation'
  position: number
  suggestion: string
  reason: string
  context: string
  confidence: number
}

export interface UserPreference {
  tone: 'formal' | 'casual' | 'neutral'
  vocabulary: 'technical' | 'simple' | 'mixed'
  styleGuide?: string
  customTerms: Record<string, string>
}

// Debounced grammar checking
export const checkGrammar = (text: string): GrammarSuggestion[] => {
  const suggestions: GrammarSuggestion[] = []

  // Common grammar patterns (simplified for demo)
  const patterns = [
    {
      regex: /\ba\s+([aeiou])/gi,
      type: 'grammar',
      fix: (match: string) => 'an ' + match.slice(2),
      explanation: 'Use "an" before vowels'
    },
    {
      regex: /\byour\s+(going|coming|running)/gi,
      type: 'grammar',
      fix: (match: string) => "you're " + match.slice(5),
      explanation: 'Use "you\'re" (you are) with verbs'
    },
    {
      regex: /\bits\s+(a|the|not)/gi,
      type: 'grammar',
      fix: (match: string) => "it's " + match.slice(4),
      explanation: 'Use "it\'s" (it is) before articles or negations'
    }
  ]

  let offset = 0
  for (const pattern of patterns) {
    let match
    const regex = new RegExp(pattern.regex)
    while ((match = regex.exec(text)) !== null) {
      suggestions.push({
        id: `grammar-${offset}`,
        type: pattern.type,
        position: match.index,
        originalText: match[0],
        suggestion: pattern.fix(match[0]),
        explanation: pattern.explanation,
        confidence: 0.85,
        category: 'error'
      })
      offset++
    }
  }

  return suggestions
}

// Detect tone and vocabulary consistency
export const analyzeContextConsistency = (
  text: string,
  userPreference: UserPreference
): ContextAwareSuggestion[] => {
  const suggestions: ContextAwareSuggestion[] = []
  const sentences = text.split(/[.!?]+/).filter(s => s.trim())

  // Check tone consistency
  const formalWords = new Set(['furthermore', 'nevertheless', 'consequently', 'therefore', 'moreover'])
  const casualWords = new Set(['gonna', 'kinda', 'like', 'actually', 'basically'])

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].toLowerCase()
    const hasFormal = [...formalWords].some(word => sentence.includes(word))
    const hasCasual = [...casualWords].some(word => sentence.includes(word))

    if (userPreference.tone === 'formal' && hasCasual) {
      suggestions.push({
        id: `tone-${i}`,
        type: 'tone',
        position: text.indexOf(sentences[i]),
        suggestion: `Maintain formal tone throughout`,
        reason: `Casual language detected in formal document`,
        context: sentences[i].trim().slice(0, 50),
        confidence: 0.7
      })
    }
  }

  return suggestions
}

// Smart readability scoring
export const scoreReadability = (text: string): { score: number; grade: string; issues: string[] } => {
  const words = text.split(/\s+/).length
  const sentences = text.split(/[.!?]+/).length
  const syllables = (text.match(/[aeiou]/gi) || []).length

  const avgWordsPerSentence = words / sentences
  const avgSyllablesPerWord = syllables / words

  // Flesch Reading Ease simplified
  let score = 206.835
  score -= 1.015 * avgWordsPerSentence
  score -= 84.6 * (avgSyllablesPerWord / words)
  score = Math.max(0, Math.min(100, score))

  let grade = 'College'
  const issues: string[] = []

  if (score > 90) grade = '5th grade'
  else if (score > 80) grade = '6th grade'
  else if (score > 70) grade = '7th-8th grade'
  else if (score > 60) grade = '9th-10th grade'
  else if (score > 50) grade = '11th-12th grade'

  if (avgWordsPerSentence > 20) issues.push('Sentences are too long')
  if (avgSyllablesPerWord > 1.5) issues.push('Use simpler words')

  return { score: Math.round(score), grade, issues }
}

// Suggestion response caching (for Phase 4 performance optimization)
export class SuggestionCache {
  private cache = new Map<string, { suggestions: GrammarSuggestion[]; timestamp: number }>()
  private ttl = 5000 // 5 seconds

  get(textHash: string): GrammarSuggestion[] | null {
    const entry = this.cache.get(textHash)
    if (!entry) return null

    const age = Date.now() - entry.timestamp
    if (age > this.ttl) {
      this.cache.delete(textHash)
      return null
    }

    return entry.suggestions
  }

  set(textHash: string, suggestions: GrammarSuggestion[]): void {
    this.cache.set(textHash, {
      suggestions,
      timestamp: Date.now()
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

// Simple hash for text caching
export const hashText = (text: string): string => {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString()
}

// Analytics tracking for suggestion acceptance
export interface SuggestionAnalytics {
  suggestionId: string
  type: 'accepted' | 'dismissed' | 'ignored'
  suggestionCategory: string
  timestamp: number
  documentLength: number
  responseTime: number
}

export class SuggestionAnalyticsTracker {
  private events: SuggestionAnalytics[] = []

  track(event: SuggestionAnalytics): void {
    this.events.push(event)

    // Batch send analytics every 10 events (debounced)
    if (this.events.length >= 10) {
      this.sendBatch()
    }
  }

  private sendBatch(): void {
    // In a real implementation, this would send to analytics service
    console.log('📊 Analytics batch:', this.events)
    this.events = []
  }

  flush(): void {
    if (this.events.length > 0) {
      this.sendBatch()
    }
  }
}

// User preference learning from acceptance patterns
export const inferUserPreference = (
  acceptedSuggestions: GrammarSuggestion[]
): Partial<UserPreference> => {
  const preference: Partial<UserPreference> = {
    tone: 'neutral',
    vocabulary: 'mixed',
    customTerms: {}
  }

  // Analyze pattern of accepted suggestions
  const formalCount = acceptedSuggestions.filter(s =>
    s.explanation.toLowerCase().includes('formal')
  ).length

  const casualCount = acceptedSuggestions.filter(s =>
    s.explanation.toLowerCase().includes('casual')
  ).length

  if (formalCount > casualCount * 2) {
    preference.tone = 'formal'
  } else if (casualCount > formalCount * 2) {
    preference.tone = 'casual'
  }

  return preference
}
