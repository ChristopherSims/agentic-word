/**
 * Writing suggestions utilities for v0.4.2
 * Includes synonyms, word frequency analysis, and readability recommendations
 */

export interface WritingSuggestion {
  id: string
  type: 'synonym' | 'frequency' | 'readability'
  text: string
  suggestion: string
  offset: number
  lineNumber: number
  alternatives?: string[]
  severity: 'info' | 'warning'
}

export interface WordFrequencyData {
  word: string
  count: number
  percentage: number
}

export interface ReadabilityScore {
  fleschKincaid: number // 0-100, higher = easier to read
  averageWordsPerSentence: number
  averageSyllablesPerWord: number
  grade: string
  suggestions: string[]
}

/**
 * Simple synonym map (can be extended)
 */
const SYNONYM_MAP: Record<string, string[]> = {
  'good': ['excellent', 'great', 'fine', 'satisfactory', 'decent'],
  'bad': ['poor', 'terrible', 'awful', 'horrible', 'inadequate'],
  'very': ['extremely', 'remarkably', 'quite', 'notably'],
  'happy': ['joyful', 'pleased', 'content', 'cheerful', 'delighted'],
  'sad': ['unhappy', 'miserable', 'melancholy', 'sorrowful', 'dejected'],
  'big': ['large', 'huge', 'substantial', 'considerable', 'vast'],
  'small': ['tiny', 'little', 'minute', 'minuscule', 'petite'],
  'important': ['significant', 'crucial', 'vital', 'essential', 'paramount'],
  'easy': ['simple', 'straightforward', 'effortless', 'uncomplicated'],
  'difficult': ['challenging', 'complex', 'tough', 'arduous', 'demanding'],
  'start': ['begin', 'commence', 'initiate', 'launch', 'embark'],
  'end': ['conclude', 'finish', 'terminate', 'complete', 'cease'],
  'help': ['assist', 'aid', 'support', 'facilitate', 'enable'],
  'make': ['create', 'produce', 'generate', 'craft', 'construct'],
  'use': ['utilize', 'employ', 'apply', 'implement', 'leverage']
}

/**
 * Get synonym suggestions for a word
 */
export function getSynonymSuggestions(word: string): string[] {
  const lowerWord = word.toLowerCase()
  return SYNONYM_MAP[lowerWord] || []
}

/**
 * Analyze word frequency in text
 */
export function analyzeWordFrequency(text: string): WordFrequencyData[] {
  const words = text.toLowerCase().match(/\b[\w'-]+\b/g) || []
  const frequency: Record<string, number> = {}

  // Count word frequency
  for (const word of words) {
    if (word.length > 2) { // Skip very short words
      frequency[word] = (frequency[word] || 0) + 1
    }
  }

  const totalWords = Object.values(frequency).reduce((a, b) => a + b, 0)

  // Convert to array and sort by frequency
  return Object.entries(frequency)
    .map(([word, count]) => ({
      word,
      count,
      percentage: (count / totalWords) * 100
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Detect overused words (used more than 5% of the time)
 */
export function detectOverusedWords(text: string): WritingSuggestion[] {
  const suggestions: WritingSuggestion[] = []
  const frequency = analyzeWordFrequency(text)
  const lines = text.split('\n')
  let charOffset = 0

  // Find heavily overused words (>3% of text)
  const overused = frequency.filter((wf) => wf.percentage > 3)

  for (const { word, count } of overused) {
    const synonyms = getSynonymSuggestions(word)

    if (synonyms.length > 0) {
      // Find first occurrence in text
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum]
        const index = line.toLowerCase().indexOf(word)

        if (index !== -1) {
          suggestions.push({
            id: `overused-${word}`,
            type: 'frequency',
            text: `"${word}" is used ${count} times (${(count / frequency.reduce((a, b) => a + b.count, 0)) * 100}%)`,
            suggestion: `Consider using synonyms: ${synonyms.slice(0, 3).join(', ')}`,
            offset: charOffset + index,
            lineNumber: lineNum + 1,
            alternatives: synonyms,
            severity: 'info'
          })
          break
        }
      }
    }
  }

  return suggestions
}

/**
 * Count syllables in a word (simplified)
 */
export function countSyllables(word: string): number {
  const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '')

  if (cleanWord.length <= 3) return 1

  let count = 0
  let previousWasVowel = false

  for (const char of cleanWord) {
    const isVowel = 'aeiouy'.includes(char)

    if (isVowel && !previousWasVowel) {
      count++
    }

    previousWasVowel = isVowel
  }

  // Adjust for silent e
  if (cleanWord.endsWith('e')) {
    count--
  }

  // Ensure at least 1 syllable
  return Math.max(1, count)
}

/**
 * Calculate Flesch-Kincaid readability score
 * Score: 0-100 (higher = easier to read)
 * Grade: corresponds to U.S. school grade level
 */
export function calculateFleschKincaidScore(text: string): ReadabilityScore {
  const sentences = (text.match(/[.!?]+/g) || []).length
  const words = (text.match(/\b[\w'-]+\b/g) || []).length
  const syllables = (text.match(/\b[\w'-]+\b/g) || []).reduce((sum, word) => sum + countSyllables(word), 0)

  if (sentences === 0 || words === 0) {
    return {
      fleschKincaid: 0,
      averageWordsPerSentence: 0,
      averageSyllablesPerWord: 0,
      grade: 'N/A',
      suggestions: []
    }
  }

  // Flesch Reading Ease: 206.835 - 1.015(words/sentences) - 84.6(syllables/words)
  const flesch =
    206.835 -
    1.015 * (words / sentences) -
    84.6 * (syllables / words)

  const score = Math.max(0, Math.min(100, Math.round(flesch)))

  // Convert to grade level
  const gradeLevel = (0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59)
  const grade = getGradeLevel(Math.round(gradeLevel))

  const suggestions: string[] = []

  if (score < 40) {
    suggestions.push('Text is difficult to read. Use shorter sentences and simpler words.')
  } else if (score < 60) {
    suggestions.push('Text is somewhat difficult. Consider simplifying some sentences.')
  } else if (score > 90) {
    suggestions.push('Text is very easy to read. Good for general audiences.')
  }

  return {
    fleschKincaid: score,
    averageWordsPerSentence: Math.round(words / sentences),
    averageSyllablesPerWord: Math.round((syllables / words) * 10) / 10,
    grade,
    suggestions
  }
}

/**
 * Convert numeric grade to string
 */
function getGradeLevel(gradeNum: number): string {
  if (gradeNum < 6) return '5th grade'
  if (gradeNum < 7) return '6th grade'
  if (gradeNum < 8) return '7th grade'
  if (gradeNum < 9) return '8th grade'
  if (gradeNum < 10) return '9th grade'
  if (gradeNum < 11) return '10th grade'
  if (gradeNum < 12) return '11th grade'
  if (gradeNum < 13) return '12th grade'
  if (gradeNum < 14) return 'College'
  return 'Graduate'
}

/**
 * Get readability recommendations based on text
 */
export function getReadabilityRecommendations(text: string): WritingSuggestion[] {
  const suggestions: WritingSuggestion[] = []
  const score = calculateFleschKincaidScore(text)

  // Long word detection
  const words = text.match(/\b[\w'-]+\b/g) || []
  const longWords = words.filter((w) => w.length > 10)

  if (longWords.length > words.length * 0.1) {
    suggestions.push({
      id: 'readability-long-words',
      type: 'readability',
      text: `${longWords.length} long words (${((longWords.length / words.length) * 100).toFixed(1)}%)`,
      suggestion: 'Use shorter, simpler words for better readability',
      offset: 0,
      lineNumber: 1,
      severity: 'info'
    })
  }

  // Passive voice density
  const passivePattern = /\b(was|were|is|are|be|being|been)\s+(\w+ed|written|given|made|taken)\b/gi
  const passiveCount = (text.match(passivePattern) || []).length

  if (passiveCount > words.length * 0.15) {
    suggestions.push({
      id: 'readability-passive',
      type: 'readability',
      text: `High passive voice density (${((passiveCount / words.length) * 100).toFixed(1)}%)`,
      suggestion: 'Use more active voice for clarity',
      offset: 0,
      lineNumber: 1,
      severity: 'info'
    })
  }

  return suggestions
}

/**
 * Comprehensive writing analysis
 */
export interface WritingAnalysis {
  overusedWords: WritingSuggestion[]
  readabilityIssues: WritingSuggestion[]
  readabilityScore: ReadabilityScore
  topWords: WordFrequencyData[]
}

export function analyzeWriting(text: string): WritingAnalysis {
  const frequency = analyzeWordFrequency(text)

  return {
    overusedWords: detectOverusedWords(text),
    readabilityIssues: getReadabilityRecommendations(text),
    readabilityScore: calculateFleschKincaidScore(text),
    topWords: frequency.slice(0, 10)
  }
}
