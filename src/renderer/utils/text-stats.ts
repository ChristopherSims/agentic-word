/**
 * Text statistics and analytics utilities
 */

export interface TextStats {
  characters: number
  charactersWithoutSpaces: number
  words: number
  sentences: number
  paragraphs: number
  readingTimeMinutes: number
  readingTimeSeconds: number
  readabilityScore: number
  averageWordLength: number
  characterFrequency: Record<string, number>
}

const AVERAGE_WPM = 200

/**
 * Calculate comprehensive text statistics
 */
export function calculateTextStats(text: string): TextStats {
  const characters = text.length
  const charactersWithoutSpaces = text.replace(/\s/g, '').length
  const words = countWords(text)
  const sentences = countSentences(text)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0).length
  
  const { minutes, seconds } = calculateReadingTime(words)
  const readabilityScore = calculateFleschKincaid(text, sentences, words)
  const averageWordLength = words > 0 ? charactersWithoutSpaces / words : 0
  const characterFrequency = getCharacterFrequency(text.toLowerCase())

  return {
    characters,
    charactersWithoutSpaces,
    words,
    sentences,
    paragraphs,
    readingTimeMinutes: minutes,
    readingTimeSeconds: seconds,
    readabilityScore,
    averageWordLength,
    characterFrequency
  }
}

/**
 * Count words (excluding whitespace-only content)
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length
}

/**
 * Count sentences (ends with . ! ?)
 */
function countSentences(text: string): number {
  const sentences = text.match(/[.!?]+/g)
  return sentences ? sentences.length : 0
}

/**
 * Calculate reading time (based on average WPM)
 */
function calculateReadingTime(words: number): { minutes: number; seconds: number } {
  const totalSeconds = Math.ceil((words / AVERAGE_WPM) * 60)
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60
  }
}

/**
 * Flesch-Kincaid Readability Index
 * Grade = (0.39 × words/sentences) + (11.8 × syllables/words) − 15.59
 * Returns grade level (0-18+)
 */
function calculateFleschKincaid(text: string, sentences: number, words: number): number {
  if (sentences === 0 || words === 0) return 0

  const syllables = estimateSyllables(text)
  const grade =
    0.39 * (words / sentences) +
    11.8 * (syllables / words) -
    15.59

  return Math.max(0, Math.round(grade * 10) / 10)
}

/**
 * Estimate syllable count (rough approximation)
 * Count vowel groups as syllables
 */
function estimateSyllables(text: string): number {
  const words = text.match(/\b\w+\b/g) || []
  let totalSyllables = 0

  words.forEach(word => {
    const lower = word.toLowerCase()
    // Count vowel groups
    const vowelGroups = lower.match(/[aeiouy]+/g) || []
    let syllableCount = vowelGroups.length

    // Adjust for silent e
    if (lower.endsWith('e')) syllableCount--
    // Adjust for -ed ending
    if (lower.endsWith('ed') && !lower.endsWith('ted') && !lower.endsWith('ded')) {
      syllableCount--
    }

    // Minimum 1 syllable per word
    totalSyllables += Math.max(1, syllableCount)
  })

  return totalSyllables
}

/**
 * Get character frequency distribution
 */
function getCharacterFrequency(text: string): Record<string, number> {
  const frequency: Record<string, number> = {}

  for (const char of text) {
    if (char.match(/[a-z]/)) {
      frequency[char] = (frequency[char] || 0) + 1
    }
  }

  return frequency
}

/**
 * Get top N most frequent characters
 */
export function getTopCharacters(frequency: Record<string, number>, n: number = 10): Array<{ char: string; count: number }> {
  return Object.entries(frequency)
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

/**
 * Format reading time as human-readable string
 */
export function formatReadingTime(minutes: number, seconds: number): string {
  if (minutes === 0) {
    return `${seconds}s`
  }
  if (seconds === 0) {
    return `${minutes}m`
  }
  return `${minutes}m ${seconds}s`
}

/**
 * Get readability interpretation
 */
export function getReadabilityLabel(score: number): string {
  if (score < 6) return 'Very Easy'
  if (score < 9) return 'Easy'
  if (score < 12) return 'Moderate'
  if (score < 14) return 'Fairly Difficult'
  if (score < 16) return 'Difficult'
  return 'Very Difficult'
}
