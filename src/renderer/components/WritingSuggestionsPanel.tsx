import React, { useState } from 'react'
import { useAppStore } from '../store/app-store'
import {
  analyzeWriting,
  detectOverusedWords,
  getReadabilityRecommendations,
  getSynonymSuggestions,
  analyzeWordFrequency
} from '../utils/writing-suggestions-utils'
import type { WritingSuggestion, WritingAnalysis } from '../utils/writing-suggestions-utils'
import './styles/writing-suggestions-panel.css'

/**
 * v0.4.2 Writing Suggestions Panel
 * Synonym suggestions, word frequency warnings, and readability recommendations
 */
export const WritingSuggestionsPanel: React.FC = () => {
  const {
    writingPanelOpen,
    writingSuggestions,
    readabilityScore,
    documentContent,
    setWritingPanelOpen,
    setWritingSuggestions,
    setReadabilityScore
  } = useAppStore()

  const [analysis, setAnalysis] = useState<WritingAnalysis | null>(null)

  // Run writing analysis
  const handleAnalyzeWriting = () => {
    const writingAnalysis = analyzeWriting(documentContent)
    setAnalysis(writingAnalysis)
    setWritingSuggestions([...writingAnalysis.overusedWords, ...writingAnalysis.readabilityIssues])
    setReadabilityScore(writingAnalysis.readabilityScore)
  }

  if (!writingPanelOpen) return null

  // Get readability grade description
  const getGradeDescription = (grade: string): string => {
    if (grade.includes('5th') || grade.includes('6th') || grade.includes('7th')) return 'Very Easy'
    if (grade.includes('8th') || grade.includes('9th')) return 'Easy'
    if (grade.includes('10th') || grade.includes('11th')) return 'Moderate'
    if (grade.includes('12th')) return 'Difficult'
    if (grade === 'College') return 'Very Difficult'
    return 'Graduate Level'
  }

  const getReadabilityColor = (score: number): string => {
    if (score >= 80) return 'excellent'
    if (score >= 60) return 'good'
    if (score >= 40) return 'fair'
    return 'poor'
  }

  return (
    <div className="writing-suggestions-panel">
      <div className="writing-header">
        <h3>Writing Suggestions</h3>
        <button className="close-btn" onClick={() => setWritingPanelOpen(false)}>
          ✕
        </button>
      </div>

      <div className="writing-controls">
        <button className="btn btn-primary" onClick={handleAnalyzeWriting}>
          Analyze Writing
        </button>
      </div>

      {readabilityScore && (
        <div className="readability-section">
          <h4>Readability</h4>

          <div className="readability-card">
            <div className={`readability-score ${getReadabilityColor(readabilityScore.fleschKincaid)}`}>
              <div className="score-value">{readabilityScore.fleschKincaid}</div>
              <div className="score-label">Flesch Reading Ease</div>
            </div>

            <div className="readability-details">
              <div className="detail-row">
                <span>Grade Level:</span>
                <strong>{readabilityScore.grade}</strong>
              </div>
              <div className="detail-row">
                <span>Difficulty:</span>
                <strong>{getGradeDescription(readabilityScore.grade)}</strong>
              </div>
              <div className="detail-row">
                <span>Avg Words per Sentence:</span>
                <strong>{readabilityScore.averageWordsPerSentence}</strong>
              </div>
              <div className="detail-row">
                <span>Avg Syllables per Word:</span>
                <strong>{readabilityScore.averageSyllablesPerWord}</strong>
              </div>
            </div>

            {readabilityScore.suggestions.length > 0 && (
              <div className="readability-suggestions">
                {readabilityScore.suggestions.map((suggestion, idx) => (
                  <div key={idx} className="suggestion-item">
                    <p>💡 {suggestion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {analysis?.topWords && analysis.topWords.length > 0 && (
        <div className="word-frequency-section">
          <h4>Most Used Words</h4>
          <ul className="word-frequency-list">
            {analysis.topWords.map((wf) => (
              <li key={wf.word} className="frequency-item">
                <div className="word-info">
                  <span className="word">{wf.word}</span>
                  <span className="frequency">
                    {wf.count}x ({wf.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="frequency-bar">
                  <div className="frequency-fill" style={{ width: `${Math.min(wf.percentage / 5, 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="suggestions-section">
        <h4>Suggestions ({writingSuggestions.length})</h4>

        {writingSuggestions.length === 0 ? (
          <div className="empty-state">
            <p>No suggestions at this time</p>
          </div>
        ) : (
          <ul className="suggestions-list">
            {writingSuggestions.map((suggestion) => (
              <li key={suggestion.id} className={`suggestion-item type-${suggestion.type}`}>
                <div className="suggestion-header">
                  <span className="type-badge">{suggestion.type}</span>
                  <p className="suggestion-text">{suggestion.text}</p>
                </div>
                <p className="suggestion-detail">{suggestion.suggestion}</p>

                {suggestion.alternatives && suggestion.alternatives.length > 0 && (
                  <div className="alternatives">
                    <p className="alternatives-label">Alternatives:</p>
                    <div className="alternative-pills">
                      {suggestion.alternatives.slice(0, 3).map((alt) => (
                        <span key={alt} className="alternative-pill">
                          {alt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!analysis && (
        <div className="no-analysis">
          <p>Click "Analyze Writing" to get personalized suggestions</p>
        </div>
      )}
    </div>
  )
}
