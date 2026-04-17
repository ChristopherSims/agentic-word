/**
 * Spell check utilities for v0.4.2
 * Includes dictionary support, spell checking, and custom dictionaries
 */

export interface SpellingError {
  id: string
  word: string
  offset: number
  lineNumber: number
  suggestions: string[]
  severity: 'error' | 'warning'
}

export interface Dictionary {
  name: string
  language: string // e.g., 'en-US', 'en-GB', 'fr-FR'
  words: Set<string>
  ignore: Set<string> // User-added words to ignore
}

// Common English word list (minimal - basic subset for demo)
const EN_US_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'word', 'document', 'text', 'content', 'writing', 'spell', 'check', 'grammar',
  'hello', 'world', 'test', 'example', 'sample', 'data', 'file', 'save', 'load',
  'function', 'method', 'variable', 'constant', 'parameter', 'argument', 'return',
  'import', 'export', 'module', 'class', 'interface', 'type', 'string', 'number',
  'boolean', 'array', 'object', 'null', 'undefined', 'true', 'false', 'this',
  'that', 'these', 'those', 'what', 'which', 'who', 'where', 'when', 'why', 'how'
])

const EN_GB_WORDS = new Set(Array.from(EN_US_WORDS))

/**
 * Levenshtein distance for spell checking suggestions
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()

  if (aLower === bLower) return 0
  if (!aLower || !bLower) return Math.max(aLower.length, bLower.length)

  const matrix: number[][] = []

  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      const cost = bLower[i - 1] === aLower[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[bLower.length][aLower.length]
}

/**
 * Get spelling suggestions using Levenshtein distance
 */
export function getSpellingSuggestions(word: string, dictionary: Set<string>, maxDistance: number = 2): string[] {
  const suggestions: Array<{ word: string; distance: number }> = []

  for (const dictWord of dictionary) {
    const distance = levenshteinDistance(word, dictWord)
    if (distance > 0 && distance <= maxDistance) {
      suggestions.push({ word: dictWord, distance })
    }
  }

  // Sort by distance and return top 5
  return suggestions
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map((s) => s.word)
}

/**
 * Check if word is likely a proper noun
 */
export function isLikelyProperNoun(word: string): boolean {
  return /^[A-Z][a-z]+$|^[A-Z]+$/.test(word) || /^[A-Z][a-z]+[A-Z][a-z]+$/.test(word)
}

/**
 * Check if word contains numbers (like "v2", "test123")
 */
export function containsNumbers(word: string): boolean {
  return /\d/.test(word)
}

/**
 * Create a spell checker instance
 */
export function createSpellChecker(dictionaryWords: Set<string>, ignoredWords: Set<string> = new Set()): (word: string) => boolean {
  return (word: string) => {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '')
    
    if (!cleanWord || cleanWord.length < 2) return true // Skip very short words
    if (ignoredWords.has(cleanWord)) return true // Skip ignored words
    if (isLikelyProperNoun(word)) return true // Skip proper nouns
    if (containsNumbers(word)) return true // Skip words with numbers
    
    return dictionaryWords.has(cleanWord)
  }
}

/**
 * Spell check content and return errors
 */
export function spellCheckContent(
  content: string,
  dictionary: Set<string>,
  ignoredWords: Set<string> = new Set()
): SpellingError[] {
  const errors: SpellingError[] = []
  const isValidWord = createSpellChecker(dictionary, ignoredWords)
  const wordRegex = /\b[\w'-]+\b/g
  const lines = content.split('\n')
  let charOffset = 0

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    let match

    while ((match = wordRegex.exec(line)) !== null) {
      const word = match[0]

      if (!isValidWord(word)) {
        const suggestions = getSpellingSuggestions(word, dictionary)

        errors.push({
          id: `${lineNum}-${match.index}`,
          word,
          offset: charOffset + match.index,
          lineNumber: lineNum + 1,
          suggestions,
          severity: 'error'
        })
      }
    }

    charOffset += line.length + 1 // +1 for newline
  }

  return errors
}

/**
 * Calculate spelling error density (errors per 1000 words)
 */
export function calculateErrorDensity(totalWords: number, errorCount: number): number {
  if (totalWords === 0) return 0
  return (errorCount / totalWords) * 1000
}

/**
 * Create default dictionaries
 */
export function createDefaultDictionaries(): Map<string, Dictionary> {
  const dictionaries = new Map<string, Dictionary>()

  dictionaries.set('en-US', {
    name: 'English (US)',
    language: 'en-US',
    words: EN_US_WORDS,
    ignore: new Set()
  })

  dictionaries.set('en-GB', {
    name: 'English (British)',
    language: 'en-GB',
    words: EN_GB_WORDS,
    ignore: new Set()
  })

  return dictionaries
}

/**
 * Add word to custom dictionary
 */
export function addWordToDictionary(dictionary: Dictionary, word: string): void {
  dictionary.words.add(word.toLowerCase())
}

/**
 * Add word to ignore list (user chooses to ignore)
 */
export function ignoreWord(dictionary: Dictionary, word: string): void {
  dictionary.ignore.add(word.toLowerCase())
}

/**
 * Remove word from ignore list
 */
export function unignoreWord(dictionary: Dictionary, word: string): void {
  dictionary.ignore.delete(word.toLowerCase())
}

/**
 * Get statistics about spelling errors
 */
export interface SpellCheckStats {
  totalErrors: number
  errorDensity: number // errors per 1000 words
  errorsByType: Map<string, number>
  suggestsFor: Map<string, string[]> // word -> suggestions
}

export function calculateSpellCheckStats(errors: SpellingError[], totalWords: number): SpellCheckStats {
  const errorsByType = new Map<string, number>()
  const suggestsFor = new Map<string, string[]>()

  for (const error of errors) {
    errorsByType.set(error.word, (errorsByType.get(error.word) || 0) + 1)
    if (!suggestsFor.has(error.word)) {
      suggestsFor.set(error.word, error.suggestions)
    }
  }

  return {
    totalErrors: errors.length,
    errorDensity: calculateErrorDensity(totalWords, errors.length),
    errorsByType,
    suggestsFor
  }
}
