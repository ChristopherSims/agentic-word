/**
 * Smart text formatting utilities for auto-correction and formatting rules
 */

export interface SmartFormattingRules {
  smartQuotes: boolean
  autoEmdash: boolean
  autoEndash: boolean
  removeDuplicateSpaces: boolean
  autoCorrection: boolean
}

const DEFAULT_RULES: SmartFormattingRules = {
  smartQuotes: true,
  autoEmdash: true,
  autoEndash: true,
  removeDuplicateSpaces: true,
  autoCorrection: true
}

const COMMON_CORRECTIONS: Record<string, string> = {
  'teh': 'the',
  'recieve': 'receive',
  'occured': 'occurred',
  'seperate': 'separate',
  'wich': 'which',
  'thier': 'their',
  'becuase': 'because',
  'accomodate': 'accommodate',
  'occassion': 'occasion',
  'untill': 'until',
  'havent': "haven't",
  'doesnt': "doesn't",
  'couldnt': "couldn't",
  'shouldnt': "shouldn't",
  'wont': "won't",
  'cant': "can't",
  'shouldve': "should've",
  'couldve': "could've",
  'wouldve': "would've"
}

/**
 * Apply smart formatting rules to text
 */
export function applySmartFormatting(text: string, rules: SmartFormattingRules = DEFAULT_RULES): string {
  let result = text

  // Remove duplicate spaces
  if (rules.removeDuplicateSpaces) {
    result = result.replace(/  +/g, ' ')
  }

  // Smart quotes (straight to curly)
  if (rules.smartQuotes) {
    result = result
      .replace(/"([^"]*)"/g, '"$1"')
      .replace(/'([^']*)'/g, ''$1'')
  }

  // Auto em-dash (— for double hyphen)
  if (rules.autoEmdash) {
    result = result.replace(/--/g, '—')
  }

  // Auto en-dash (– for space-hyphen-space)
  if (rules.autoEndash) {
    result = result.replace(/ - /g, ' – ')
  }

  // Common auto-corrections
  if (rules.autoCorrection) {
    Object.entries(COMMON_CORRECTIONS).forEach(([wrong, correct]) => {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi')
      result = result.replace(regex, correct)
    })
  }

  return result
}

/**
 * Detect word boundaries and return last word being typed
 */
export function getLastWord(text: string, position: number): { word: string; start: number } {
  const beforeCursor = text.substring(0, position)
  const wordMatch = beforeCursor.match(/\S+$/)

  if (!wordMatch) {
    return { word: '', start: position }
  }

  const start = position - wordMatch[0].length
  return { word: wordMatch[0], start }
}

/**
 * Suggest auto-correction for a word
 */
export function getSuggestion(word: string): string | null {
  const lower = word.toLowerCase()
  return COMMON_CORRECTIONS[lower] || null
}

/**
 * Check if text has orphan words (single word at end of paragraph/line)
 */
export function findOrphans(text: string): Array<{ index: number; word: string }> {
  const orphans: Array<{ index: number; word: string }> = []
  const paragraphs = text.split('\n')
  let currentIndex = 0

  paragraphs.forEach((para) => {
    const trimmed = para.trim()
    const words = trimmed.split(/\s+/)

    if (words.length === 1 && trimmed.length > 0 && currentIndex > 0) {
      const wordIndex = currentIndex + para.indexOf(words[0])
      orphans.push({ index: wordIndex, word: words[0] })
    }

    currentIndex += para.length + 1 // +1 for newline
  })

  return orphans
}

/**
 * Apply orphan prevention (add non-breaking space before last word in paragraph)
 */
export function preventOrphans(text: string): string {
  return text.split('\n').map((para) => {
    const trimmed = para.trim()
    const words = trimmed.split(/\s+/)

    if (words.length > 1) {
      const withoutLast = words.slice(0, -1).join(' ')
      const lastWord = words[words.length - 1]
      return withoutLast + '\u00A0' + lastWord // \u00A0 is non-breaking space
    }

    return para
  }).join('\n')
}

/**
 * Convert straight quotes to curly quotes
 */
export function convertQuotes(text: string): string {
  return text
    .replace(/"([^"]*)"/g, '"$1"')
    .replace(/'([^']*)'/g, ''$1'')
}
