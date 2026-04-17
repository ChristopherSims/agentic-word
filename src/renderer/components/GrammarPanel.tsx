import React, { useState } from 'react'
import { useAppStore } from '../store/app-store'
import {
  analyzeGrammar,
  analyzeSentenceComplexity,
  analyzeTone,
  suggestToneAdjustments,
  detectPassiveVoice
} from '../utils/grammar-utils'
import type { GrammarIssue, ToneAnalysis } from '../utils/grammar-utils'
import './styles/grammar-panel.css'

/**
 * v0.4.2 Grammar Panel
 * Grammar analysis, passive voice detection, and tone adjustment recommendations
 */
export const GrammarPanel: React.FC = () => {
  const {
    grammarPanelOpen,
    grammarCheckEnabled,
    grammarIssues,
    documentContent,
    setGrammarPanelOpen,
    setGrammarCheckEnabled,
    setGrammarIssues,
    setToneAnalysis
  } = useAppStore()

  const [sentenceComplexity, setSentenceComplexity] = useState<ReturnType<typeof analyzeSentenceComplexity> | null>(null)
  const [toneData, setToneData] = useState<ToneAnalysis | null>(null)

  // Run grammar check
  const handleGrammarCheck = () => {
    const issues = analyzeGrammar(documentContent)
    const complexity = analyzeSentenceComplexity(documentContent)
    const tone = analyzeTone(documentContent)

    setGrammarIssues(issues)
    setSentenceComplexity(complexity)
    setToneData(tone)
    setToneAnalysis(tone)
  }

  // Group issues by type
  const groupedIssues = grammarIssues.reduce(
    (acc, issue) => {
      if (!acc[issue.type]) {
        acc[issue.type] = []
      }
      acc[issue.type].push(issue)
      return acc
    },
    {} as Record<string, GrammarIssue[]>
  )

  if (!grammarPanelOpen) return null

  const typeLabels: Record<string, string> = {
    'passive-voice': '🔊 Passive Voice',
    'complexity': '📊 Sentence Complexity',
    'tone': '💬 Tone',
    'fragment': '⚠️ Fragments & Errors'
  }

  return (
    <div className="grammar-panel">
      <div className="grammar-header">
        <h3>Grammar & Style</h3>
        <button className="close-btn" onClick={() => setGrammarPanelOpen(false)}>
          ✕
        </button>
      </div>

      <div className="grammar-controls">
        <label>
          <input
            type="checkbox"
            checked={grammarCheckEnabled}
            onChange={(e) => setGrammarCheckEnabled(e.target.checked)}
          />
          Enable Grammar Check
        </label>

        <button className="btn btn-primary" onClick={handleGrammarCheck}>
          Analyze Document
        </button>
      </div>

      {sentenceComplexity && (
        <div className="complexity-stats">
          <h4>Sentence Complexity</h4>
          <div className="stat-row">
            <span>Average Words per Sentence:</span>
            <strong>{sentenceComplexity.averageWordsPerSentence}</strong>
          </div>
          <div className="stat-row">
            <span>Average Sentence Length:</span>
            <strong>{sentenceComplexity.averageSentenceLength} characters</strong>
          </div>
          {sentenceComplexity.averageWordsPerSentence > 25 && (
            <div className="warning">
              <p>⚠️ Your sentences are quite long. Consider breaking them up for better readability.</p>
            </div>
          )}
        </div>
      )}

      {toneData && (
        <div className="tone-stats">
          <h4>Tone Analysis</h4>
          <div className="formality-meter">
            <div className="meter-label">
              <span>Formality</span>
              <span className="meter-value">{toneData.formalityScore}%</span>
            </div>
            <div className="meter-bar">
              <div className="meter-fill" style={{ width: `${toneData.formalityScore}%` }} />
            </div>
            <div className="meter-labels">
              <span>Casual</span>
              <span>Professional</span>
              <span>Formal</span>
            </div>
          </div>
          {toneData.formalityScore < 40 && (
            <div className="info">
              <p>💡 Your writing has a casual tone. This works well for friendly communication.</p>
            </div>
          )}
          {toneData.formalityScore > 80 && (
            <div className="info">
              <p>💡 Your writing has a formal tone. Ensure this matches your intended audience.</p>
            </div>
          )}
        </div>
      )}

      <div className="grammar-issues">
        <h4>Issues ({grammarIssues.length})</h4>

        {grammarIssues.length === 0 ? (
          <div className="empty-state">
            <p>No grammar issues detected</p>
          </div>
        ) : (
          <div className="issues-by-type">
            {Object.entries(groupedIssues).map(([type, issues]) => (
              <div key={type} className="issue-group">
                <h5 className="issue-type-header">
                  {typeLabels[type] || type}
                  <span className="issue-count badge">{issues.length}</span>
                </h5>

                <ul className="issue-list">
                  {issues.slice(0, 10).map((issue) => (
                    <li key={issue.id} className={`issue-item severity-${issue.severity}`}>
                      <div className="issue-message">
                        <strong>{issue.message}</strong>
                        <p className="issue-line">Line {issue.lineNumber}</p>
                      </div>
                      {issue.suggestion && (
                        <div className="issue-suggestion">
                          <p className="suggestion-label">Suggestion:</p>
                          <p className="suggestion-text">{issue.suggestion}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {issues.length > 10 && (
                  <div className="more-issues">
                    <p>+{issues.length - 10} more {type} issues</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {toneData?.issues.length === 0 && grammarIssues.length === 0 && !sentenceComplexity && (
        <div className="no-analysis">
          <p>Click "Analyze Document" to start grammar checking</p>
        </div>
      )}
    </div>
  )
}
