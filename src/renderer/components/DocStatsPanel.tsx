import React, { useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const DocStatsPanel: FC = () => {
  const { docStatsPanelOpen, setDocStatsPanelOpen, docStats, setDocStats, documentContent, wordCount, charCount } = useAppStore()

  useEffect(() => {
    if (docStatsPanelOpen && documentContent) {
      window.wordapp?.docStats.compute(documentContent).then((stats) => {
        if (stats) setDocStats(stats as typeof docStats)
      }).catch(() => {})
    }
  }, [docStatsPanelOpen, documentContent])

  if (!docStatsPanelOpen) return null

  const statRow = (label: string, value: string | number, unit?: string) => (
    <div className="doc-stats-row">
      <span className="doc-stats-label">{label}</span>
      <span className="doc-stats-value">{value}{unit || ''}</span>
    </div>
  )

  return (
    <div className="doc-stats-panel">
      <div className="doc-stats-header">
        <span style={{ fontSize: 12, fontWeight: 600 }}>Document Statistics</span>
        <button className="toolbar-btn" style={{ width: 20, height: 20, fontSize: 10 }} onClick={() => setDocStatsPanelOpen(false)}>✕</button>
      </div>
      <div className="doc-stats-body">
        {statRow('Words', wordCount)}
        {statRow('Characters', charCount)}
        {statRow('Paragraphs', docStats.paragraphCount)}
        {statRow('Sentences', docStats.sentenceCount)}
        {statRow('Syllables', docStats.syllableCount)}
        {statRow('Avg Sentence Length', docStats.avgSentenceLen, ' words')}
        {statRow('Reading Time', docStats.readingTimeMin, ' min')}
        <div className="doc-stats-divider" />
        <div className="doc-stats-readability">
          <span className="doc-stats-label">Flesch-Kincaid Grade</span>
          <span className={`doc-stats-grade ${docStats.fleschKincaid <= 8 ? 'grade-easy' : docStats.fleschKincaid <= 12 ? 'grade-mid' : 'grade-hard'}`}>
            {docStats.fleschKincaid}
          </span>
        </div>
        <div className="doc-stats-readability-label">
          {docStats.fleschKincaid <= 5 ? 'Very Easy' :
           docStats.fleschKincaid <= 8 ? 'Easy' :
           docStats.fleschKincaid <= 10 ? 'Standard' :
           docStats.fleschKincaid <= 12 ? 'Fairly Difficult' :
           docStats.fleschKincaid <= 14 ? 'Difficult' : 'Very Difficult'}
        </div>
      </div>
    </div>
  )
}
