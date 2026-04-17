/**
 * Grammar analysis utilities for v0.4.2
 * Includes passive voice detection, sentence complexity analysis, and more
 */

export interface GrammarIssue {
  id: string
  type: 'passive-voice' | 'complexity' | 'tone' | 'fragment'
  message: string
  suggestion: string
  offset: number
  lineNumber: number
  severity: 'info' | 'warning'
}

/**
 * Detect passive voice in text
 * Simple detection: "was/were/is/are + [verb]-ed/en"
 */
export function detectPassiveVoice(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = []
  const passivePattern = /\b(was|were|is|are|be|being|been)\s+(\w+ed|written|given|made|taken|done|seen|known)\b/gi
  const lines = text.split('\n')
  let charOffset = 0

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    let match

    while ((match = passivePattern.exec(line)) !== null) {
      issues.push({
        id: `passive-${lineNum}-${match.index}`,
        type: 'passive-voice',
        message: `Passive voice detected: "${match[0]}"`,
        suggestion: 'Consider using active voice for clearer, more direct writing',
        offset: charOffset + match.index,
        lineNumber: lineNum + 1,
        severity: 'info'
      })
    }

    charOffset += line.length + 1
  }

  return issues
}

/**
 * Analyze sentence complexity
 * Returns the average words per sentence and flags unusually long sentences
 */
export interface SentenceComplexityAnalysis {
  issues: GrammarIssue[]
  averageWordsPerSentence: number
  averageSentenceLength: number
}

export function analyzeSentenceComplexity(text: string): SentenceComplexityAnalysis {
  const issues: GrammarIssue[] = []

  // Simple sentence splitting by punctuation
  const sentencePattern = /[^.!?]*[.!?]+/g
  const sentences = text.match(sentencePattern) || []

  if (sentences.length === 0) {
    return {
      issues,
      averageWordsPerSentence: 0,
      averageSentenceLength: 0
    }
  }

  let totalWords = 0
  let totalChars = 0
  let charOffset = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim()
    const wordCount = sentence.split(/\s+/).filter((w) => w.length > 0).length
    const charCount = sentence.length

    totalWords += wordCount
    totalChars += charCount

    // Flag sentences with more than 25 words as complex
    if (wordCount > 25) {
      issues.push({
        id: `complexity-${i}`,
        type: 'complexity',
        message: `Sentence is complex: ${wordCount} words`,
        suggestion: 'Consider breaking this sentence into shorter ones for better readability',
        offset: charOffset,
        lineNumber: Math.floor(charOffset / 50) + 1, // Rough estimate
        severity: 'info'
      })
    }

    charOffset += charCount + 1
  }

  const averageWordsPerSentence = Math.round(totalWords / sentences.length)
  const averageSentenceLength = Math.round(totalChars / sentences.length)

  return {
    issues,
    averageWordsPerSentence,
    averageSentenceLength
  }
}

/**
 * Detect common grammar errors
 */
export function detectCommonErrors(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = []

  // Subject-verb agreement issues (simplified)
  const svErrors = [
    { pattern: /\b(he|she|it|The)\s+(\w+)\s+(are)\b/gi, message: 'Subject-verb disagreement', suggestion: 'Use "is" instead of "are"' },
    { pattern: /\b(they|we|you|I)\s+(\w+)\s+(is)\b/gi, message: 'Subject-verb disagreement', suggestion: 'Use "are" instead of "is"' }
  ]

  const lines = text.split('\n')
  let charOffset = 0

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]

    for (const { pattern, message, suggestion } of svErrors) {
      let match
      while ((match = pattern.exec(line)) !== null) {
        issues.push({
          id: `sv-${lineNum}-${match.index}`,
          type: 'fragment',
          message,
          suggestion,
          offset: charOffset + match.index,
          lineNumber: lineNum + 1,
          severity: 'warning'
        })
      }
    }

    charOffset += line.length + 1
  }

  return issues
}

/**
 * Tone analysis - detect potentially problematic tone
 */
export interface ToneAnalysis {
  formalityScore: number // 0-100, higher = more formal
  issues: GrammarIssue[]
}

export function analyzeTone(text: string): ToneAnalysis {
  const issues: GrammarIssue[] = []
  let formalityScore = 50

  // Informal markers
  const informalPatterns = [
    { pattern: /\b(gonna|wanna|gotta|kinda|sorta|dunno)\b/gi, informal: true },
    { pattern: /\b(awesome|cool|amazing|super|stuff)\b/gi, informal: true },
    { pattern: /!+|\?+/g, informal: true }
  ]

  // Formal markers
  const formalPatterns = [
    { pattern: /\b(furthermore|moreover|hence|thus|therefore|consequently)\b/gi, formal: true },
    { pattern: /\b(shall|ought|henceforth|herein|thereof)\b/gi, formal: true },
    { pattern: /\b(elucidate|substantiate|corroborate|facilitate)\b/gi, formal: true }
  ]

  let informalCount = 0
  let formalCount = 0

  // Check informal patterns
  for (const { pattern } of informalPatterns) {
    const matches = text.match(pattern) || []
    informalCount += matches.length
  }

  // Check formal patterns
  for (const { pattern } of formalPatterns) {
    const matches = text.match(pattern) || []
    formalCount += matches.length
  }

  // Adjust formality score
  formalityScore = Math.max(0, Math.min(100, 50 + formalCount * 5 - informalCount * 5))

  // Add warning if tone is too informal for professional writing
  if (informalCount > 3) {
    issues.push({
      id: 'tone-informal',
      type: 'tone',
      message: `Informal tone detected (${informalCount} markers)`,
      suggestion: 'Consider using a more formal tone for professional writing',
      offset: 0,
      lineNumber: 1,
      severity: 'info'
    })
  }

  return {
    formalityScore,
    issues
  }
}

/**
 * Detect sentence fragments
 */
export function detectFragments(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = []

  // Simple fragment detection: sentences without a verb
  const sentences = text.split(/[.!?]+/)
  let charOffset = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim()

    if (!sentence) continue

    // Check if sentence has a verb (very simplified)
    const hasVerb = /\b(is|are|was|were|be|being|been|have|has|had|do|does|did|will|would|could|should|can|may|must|might)\b/i.test(sentence)

    if (!hasVerb && sentence.length > 5) {
      issues.push({
        id: `fragment-${i}`,
        type: 'fragment',
        message: 'This may be a sentence fragment',
        suggestion: 'Ensure the sentence contains a main verb',
        offset: charOffset,
        lineNumber: Math.floor(charOffset / 50) + 1,
        severity: 'warning'
      })
    }

    charOffset += sentence.length + 1
  }

  return issues
}

/**
 * Get all grammar issues
 */
export function analyzeGrammar(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = []

  issues.push(...detectPassiveVoice(text))
  issues.push(...detectCommonErrors(text))
  issues.push(...analyzeSentenceComplexity(text).issues)
  issues.push(...detectFragments(text))
  issues.push(...analyzeTone(text).issues)

  return issues
}

/**
 * Suggest tone adjustments
 */
export interface ToneAdjustment {
  original: string
  formal: string
  casual: string
  professional: string
}

export function suggestToneAdjustments(sentence: string): ToneAdjustment[] {
  const adjustments: ToneAdjustment[] = []

  const toneMap: Array<[RegExp, ToneAdjustment]> = [
    [
      /\bwanna\b/gi,
      {
        original: 'wanna',
        formal: 'wish to',
        casual: 'wanna',
        professional: 'would like to'
      }
    ],
    [
      /\bgonna\b/gi,
      {
        original: 'gonna',
        formal: 'will',
        casual: 'gonna',
        professional: 'will'
      }
    ],
    [
      /\bkinda\b/gi,
      {
        original: 'kinda',
        formal: 'somewhat',
        casual: 'kinda',
        professional: 'somewhat'
      }
    ],
    [
      /\bamazing\b/gi,
      {
        original: 'amazing',
        formal: 'remarkable',
        casual: 'amazing',
        professional: 'notable'
      }
    ]
  ]

  for (const [pattern, adjustment] of toneMap) {
    if (pattern.test(sentence)) {
      adjustments.push(adjustment)
    }
  }

  return adjustments
}
