/**
 * AI Writing Assistant Utilities
 * v0.4.7 AI-Powered Features for content generation and writing enhancement
 */

export interface OutlineItem {
  level: number
  title: string
  expanded?: boolean
  children?: OutlineItem[]
}

export interface ToneStyle {
  name: 'formal' | 'casual' | 'professional'
  description: string
  examples: string[]
}

export interface ContentGenerationRequest {
  type: 'outline' | 'paragraph' | 'title' | 'introduction' | 'conclusion'
  topic?: string
  currentContent?: string
  context?: string
  style?: 'formal' | 'casual' | 'professional'
}

export interface WritingEnhancementRequest {
  type: 'tone' | 'paraphrase' | 'complexity' | 'translate'
  text: string
  targetTone?: 'formal' | 'casual' | 'professional'
  targetComplexity?: 'simple' | 'moderate' | 'advanced'
  targetLanguage?: string
}

export interface SmartSuggestion {
  type: 'completion' | 'next_sentence' | 'missing_word' | 'argument'
  text: string
  context: string
  confidence: number
}

/**
 * Generate outline from a topic
 * Returns hierarchical structure of document outline
 */
export function generateOutline(topic: string, depth: number = 3): OutlineItem[] {
  return [
    {
      level: 1,
      title: `Introduction to ${topic}`,
      expanded: true,
      children: [
        { level: 2, title: 'Background and Context', expanded: false },
        { level: 2, title: 'Importance and Relevance', expanded: false },
        { level: 2, title: 'Thesis Statement', expanded: false }
      ]
    },
    {
      level: 1,
      title: `Main Topics in ${topic}`,
      expanded: true,
      children: [
        { level: 2, title: 'First Key Point', expanded: false },
        { level: 2, title: 'Second Key Point', expanded: false },
        { level: 2, title: 'Third Key Point', expanded: false }
      ]
    },
    {
      level: 1,
      title: `Analysis and Discussion`,
      expanded: true,
      children: [
        { level: 2, title: 'Critical Evaluation', expanded: false },
        { level: 2, title: 'Implications', expanded: false }
      ]
    },
    {
      level: 1,
      title: `Conclusion`,
      expanded: true,
      children: [
        { level: 2, title: 'Summary of Key Points', expanded: false },
        { level: 2, title: 'Final Thoughts and Recommendations', expanded: false }
      ]
    }
  ]
}

/**
 * Expand or summarize a paragraph
 */
export function getParagraphOptions(text: string): { expand: string; summarize: string } {
  return {
    expand: `Expand the following paragraph with more details, examples, and explanations: ${text}`,
    summarize: `Condense the following paragraph into 2-3 sentences: ${text}`
  }
}

/**
 * Generate title suggestions based on content
 */
export function generateTitleSuggestions(content: string): string[] {
  // Placeholder suggestions - would be replaced with LLM call
  const wordCount = content.split(' ').length
  return [
    'Compelling Document Title',
    'Main Concept Summary',
    'Key Topics Overview',
    `${wordCount}-Word Analysis`
  ]
}

/**
 * Generate introduction paragraph
 */
export function generateIntroduction(topic: string, length: 'short' | 'medium' | 'long' = 'medium'): string {
  const lengths = {
    short: 'one paragraph',
    medium: 'two paragraphs',
    long: 'three paragraphs'
  }
  return `Generate an engaging ${lengths[length]} introduction for a document about ${topic}`
}

/**
 * Generate conclusion paragraph
 */
export function generateConclusion(topic: string, mainPoints: string[], length: 'short' | 'medium' | 'long' = 'medium'): string {
  const pointsText = mainPoints.join(', ')
  return `Write a ${length} conclusion that summarizes these points: ${pointsText}`
}

/**
 * Adjust tone of text
 */
export function adjustTone(text: string, targetTone: 'formal' | 'casual' | 'professional'): string {
  const instructions = {
    formal: 'Rewrite this in a formal, academic tone with sophisticated vocabulary',
    casual: 'Rewrite this in a casual, friendly tone with everyday language',
    professional: 'Rewrite this in a professional, business-appropriate tone'
  }
  return `${instructions[targetTone]}: ${text}`
}

/**
 * Generate paraphrase suggestions
 */
export function paraphraseSuggestions(text: string): string[] {
  return [
    `Provide an alternative phrasing: ${text}`,
    `Reword more concisely: ${text}`,
    `Express in different words: ${text}`
  ]
}

/**
 * Adjust complexity level
 */
export function adjustComplexity(text: string, targetLevel: 'simple' | 'moderate' | 'advanced'): string {
  const instructions = {
    simple: 'Simplify this text for a general audience with limited technical knowledge',
    moderate: 'Rewrite this at a moderate complexity level for a general educated audience',
    advanced: 'Enhance this text with more sophisticated vocabulary and complex sentence structures'
  }
  return `${instructions[targetLevel]}: ${text}`
}

/**
 * Generate translation suggestion
 */
export function translateText(text: string, targetLanguage: string): string {
  return `Translate the following to ${targetLanguage}: ${text}`
}

/**
 * Generate context-aware completions
 */
export function contextAwareCompletions(precedingText: string, followingText?: string): SmartSuggestion[] {
  return [
    {
      type: 'completion',
      text: 'complete this thought',
      context: precedingText,
      confidence: 0.85
    }
  ]
}

/**
 * Predict next sentence
 */
export function predictNextSentence(currentText: string): SmartSuggestion {
  return {
    type: 'next_sentence',
    text: 'The next logical sentence would be...',
    context: currentText,
    confidence: 0.78
  }
}

/**
 * Detect missing words or phrases
 */
export function detectMissingWords(text: string): SmartSuggestion[] {
  return [
    {
      type: 'missing_word',
      text: 'Consider adding...',
      context: text,
      confidence: 0.72
    }
  ]
}

/**
 * Generate argument suggestions
 */
export function suggestArguments(topic: string, existingArguments: string[]): SmartSuggestion[] {
  return [
    {
      type: 'argument',
      text: 'Additional argument to consider...',
      context: topic,
      confidence: 0.80
    }
  ]
}

/**
 * Format outline for display
 */
export function formatOutline(outline: OutlineItem[]): string {
  const lines: string[] = []
  
  function traverse(items: OutlineItem[], prefix = '') {
    items.forEach((item, idx) => {
      const indent = '  '.repeat(item.level - 1)
      const bullet = item.level === 1 ? '' : '-'
      lines.push(`${indent}${bullet} ${item.title}`.trim())
      
      if (item.children && item.expanded) {
        traverse(item.children, prefix)
      }
    })
  }
  
  traverse(outline)
  return lines.join('\n')
}

/**
 * Tone style definitions
 */
export const TONE_STYLES: Record<string, ToneStyle> = {
  formal: {
    name: 'formal',
    description: 'Academic, sophisticated, professional',
    examples: [
      'The aforementioned proposition warrants serious consideration.',
      'This phenomenon necessitates comprehensive analysis.'
    ]
  },
  casual: {
    name: 'casual',
    description: 'Friendly, conversational, approachable',
    examples: [
      'Hey, this thing is really worth checking out.',
      'So basically, it all comes down to this.'
    ]
  },
  professional: {
    name: 'professional',
    description: 'Business-appropriate, clear, confident',
    examples: [
      'We recommend implementing this solution to improve efficiency.',
      'Key metrics indicate strong performance across all departments.'
    ]
  }
}
