import React, { useState } from 'react'
import { useAppStore } from '../store/app-store'
import { spellCheckContent, getSpellingSuggestions, createDefaultDictionaries, addWordToDictionary, ignoreWord as ignoreWordInDict, calculateSpellCheckStats } from '../utils/spell-check-utils'
import type { SpellingError, Dictionary } from '../utils/spell-check-utils'
import './styles/spell-check-panel.css'

/**
 * v0.4.2 Spell Check Panel
 * Real-time spell checking with custom dictionary support
 */
export const SpellCheckPanel: React.FC = () => {
  const {
    spellCheckPanelOpen,
    spellCheckEnabled,
    spellCheckErrors,
    selectedDictionary,
    ignoreWords,
    documentContent,
    setSpellCheckPanelOpen,
    setSpellCheckEnabled,
    setSpellCheckErrors,
    setSelectedDictionary,
    addIgnoreWord,
    setSpellCheckStats
  } = useAppStore()

  const [dictionaries] = useState<Map<string, Dictionary>>(() => createDefaultDictionaries())
  const [statistics, setStatistics] = useState<ReturnType<typeof calculateSpellCheckStats> | null>(null)

  // Run spell check
  const handleSpellCheck = () => {
    const currentDict = dictionaries.get(selectedDictionary)
    if (!currentDict) return

    // Add ignored words to the dictionary's ignore set
    for (const word of ignoreWords) {
      ignoreWordInDict(currentDict, word)
    }

    const errors = spellCheckContent(documentContent, currentDict.words, ignoreWords)
    const words = documentContent.split(/\s+/).length

    // Calculate statistics
    const stats = calculateSpellCheckStats(errors, words)
    setStatistics(stats)

    setSpellCheckErrors(errors)
    setSpellCheckStats({
      totalErrors: stats.totalErrors,
      errorDensity: stats.errorDensity,
      topErrors: Array.from(stats.errorsByType.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    })
  }

  // Accept spelling suggestion
  const handleAcceptSuggestion = (error: SpellingError, suggestion: string) => {
    const startIndex = documentContent.lastIndexOf(error.word, error.offset)
    if (startIndex === -1) return

    const endIndex = startIndex + error.word.length

    // Note: In a real implementation, this would update the document content through the editor
    console.log(`Replace "${error.word}" with "${suggestion}"`)
  }

  // Add word to ignored list
  const handleIgnoreWord = (word: string) => {
    addIgnoreWord(word)
  }

  // Add word to custom dictionary
  const handleAddToDictionary = (word: string) => {
    const dict = dictionaries.get(selectedDictionary)
    if (dict) {
      addWordToDictionary(dict, word)
    }
  }

  if (!spellCheckPanelOpen) return null

  const sortedErrors = spellCheckErrors.sort((a, b) => a.lineNumber - b.lineNumber)

  return (
    <div className="spell-check-panel">
      <div className="spell-check-header">
        <h3>Spell Check</h3>
        <button className="close-btn" onClick={() => setSpellCheckPanelOpen(false)}>
          ✕
        </button>
      </div>

      <div className="spell-check-controls">
        <label>
          <input
            type="checkbox"
            checked={spellCheckEnabled}
            onChange={(e) => setSpellCheckEnabled(e.target.checked)}
          />
          Enable Spell Check
        </label>

        <select value={selectedDictionary} onChange={(e) => setSelectedDictionary(e.target.value)}>
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (British)</option>
        </select>

        <button className="btn btn-primary" onClick={handleSpellCheck}>
          Check Document
        </button>
      </div>

      {statistics && (
        <div className="spell-check-stats">
          <h4>Statistics</h4>
          <div className="stat-row">
            <span>Total Errors:</span>
            <strong>{statistics.totalErrors}</strong>
          </div>
          <div className="stat-row">
            <span>Error Density:</span>
            <strong>{statistics.errorDensity.toFixed(2)} per 1000 words</strong>
          </div>
          {statistics.errorsByType.size > 0 && (
            <div className="stat-section">
              <h5>Most Common Errors:</h5>
              <ul className="error-list">
                {Array.from(statistics.errorsByType.entries())
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([word, count]) => (
                    <li key={word}>
                      <strong>{word}</strong>: {count} occurrence{count !== 1 ? 's' : ''}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="spell-check-errors">
        <h4>
          Errors ({sortedErrors.length})
          {sortedErrors.length > 0 && <span className="error-count badge">{sortedErrors.length}</span>}
        </h4>

        {sortedErrors.length === 0 ? (
          <div className="empty-state">
            <p>No spelling errors found</p>
          </div>
        ) : (
          <div className="error-items">
            {sortedErrors.map((error) => (
              <div key={error.id} className="error-item">
                <div className="error-header">
                  <span className="error-word">"{error.word}"</span>
                  <span className="error-line">Line {error.lineNumber}</span>
                </div>

                {error.suggestions.length > 0 && (
                  <div className="suggestions">
                    <p className="suggestion-label">Suggestions:</p>
                    <div className="suggestion-buttons">
                      {error.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          className="btn btn-sm btn-suggestion"
                          onClick={() => handleAcceptSuggestion(error, suggestion)}
                          title={`Replace with "${suggestion}"`}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="error-actions">
                  <button
                    className="btn btn-sm btn-link"
                    onClick={() => handleIgnoreWord(error.word)}
                    title="Ignore this word in future checks"
                  >
                    Ignore
                  </button>
                  <button
                    className="btn btn-sm btn-link"
                    onClick={() => handleAddToDictionary(error.word)}
                    title="Add to dictionary"
                  >
                    Add to Dictionary
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
