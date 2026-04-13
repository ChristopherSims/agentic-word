import React, { useEffect, useRef, type FC } from 'react'
import { useAppStore, type PendingChange } from '../store/app-store'

/**
 * Computes a simple word-level diff between two HTML strings.
 * Returns an array of diff segments that can be rendered inline.
 */
function computeHtmlDiff(before: string, after: string): DiffSegment[] {
  const beforeText = stripTags(before)
  const afterText = stripTags(after)

  if (beforeText === afterText) {
    // Check for tag-level changes (formatting)
    if (before !== after) {
      return [{ type: 'replace', removed: before, added: after }]
    }
    return [{ type: 'same', content: afterText }]
  }

  const beforeWords = beforeText.split(/(\s+)/)
  const afterWords = afterText.split(/(\s+)/)

  // Simple LCS-based diff
  const segments: DiffSegment[] = []
  const lcs = computeLCS(beforeWords, afterWords)

  let bi = 0, ai = 0
  for (const op of lcs) {
    if (op === 'same') {
      segments.push({ type: 'same', content: beforeWords[bi] })
      bi++; ai++
    } else if (op === 'removed') {
      // Collect consecutive removals
      let removed = beforeWords[bi]
      bi++
      while (bi < beforeWords.length && lcs[bi + ai] === 'removed') {
        removed += beforeWords[bi]
        bi++
      }
      segments.push({ type: 'removed', content: removed })
    } else if (op === 'added') {
      let added = afterWords[ai]
      ai++
      while (ai < afterWords.length && lcs[bi + ai - 1] === 'added') {
        added += afterWords[ai]
        ai++
      }
      segments.push({ type: 'added', content: added })
    }
  }

  // Merge adjacent removed+added into replace segments
  const merged: DiffSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const cur = segments[i]
    const next = segments[i + 1]
    if (cur.type === 'removed' && next?.type === 'added') {
      merged.push({ type: 'replace', removed: cur.content!, added: next.content! })
      i++
    } else {
      merged.push(cur)
    }
  }

  return merged
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const ops: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.unshift('same')
      i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.unshift('removed')
      i--
    } else {
      ops.unshift('added')
      j--
    }
  }
  while (i > 0) { ops.unshift('removed'); i-- }
  while (j > 0) { ops.unshift('added'); j-- }

  return ops
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

interface DiffSegment {
  type: 'same' | 'removed' | 'added' | 'replace'
  content?: string
  removed?: string
  added?: string
}

export const DiffOverlay: FC = () => {
  const { pendingChanges, activePendingChangeId, acceptPendingChange, rejectPendingChange, acceptAllPendingChanges, rejectAllPendingChanges, setActivePendingChange } = useAppStore()
  const activeChange = pendingChanges.find((c) => c.id === activePendingChangeId && c.status === 'pending')
  const pending = pendingChanges.filter((c) => c.status === 'pending')
  const containerRef = useRef<HTMLDivElement>(null)

  if (!activeChange) {
    if (pending.length === 0) return null
    // Auto-select first pending
    setTimeout(() => setActivePendingChange(pending[0].id), 0)
    return null
  }

  const segments = computeHtmlDiff(activeChange.contentBefore, activeChange.contentAfter)
  const hasChanges = segments.some((s) => s.type !== 'same')

  return (
    <div className="diff-overlay" ref={containerRef}>
      <div className="diff-overlay-header">
        <div className="diff-overlay-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <span>AI Suggestion</span>
          <span className="diff-overlay-count">{pending.indexOf(activeChange) + 1}/{pending.length}</span>
        </div>
        <div className="diff-overlay-actions">
          <button
            className="diff-btn diff-btn-accept"
            onClick={() => acceptPendingChange(activeChange.id)}
            title="Accept change (Enter)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Accept
          </button>
          <button
            className="diff-btn diff-btn-reject"
            onClick={() => rejectPendingChange(activeChange.id)}
            title="Reject change (Escape)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Reject
          </button>
        </div>
      </div>

      {hasChanges ? (
        <div className="diff-overlay-body">
          {renderDiffDescription(activeChange)}
          <div className="diff-inline-preview">
            {segments.map((seg, i) => {
              switch (seg.type) {
                case 'same':
                  return <span key={i} className="diff-same">{seg.content}</span>
                case 'removed':
                  return <span key={i} className="diff-removed">{seg.content}</span>
                case 'added':
                  return <span key={i} className="diff-added">{seg.content}</span>
                case 'replace':
                  return (
                    <span key={i} className="diff-replace">
                      <span className="diff-removed">{seg.removed}</span>
                      <span className="diff-added">{seg.added}</span>
                    </span>
                  )
                default:
                  return null
              }
            })}
          </div>
        </div>
      ) : (
        <div className="diff-overlay-body">
          <div className="diff-no-change">No visible changes in text content (formatting change only)</div>
          <div className="diff-inline-preview" dangerouslySetInnerHTML={{ __html: activeChange.contentAfter }} />
        </div>
      )}

      {pending.length > 1 && (
        <div className="diff-overlay-footer">
          <button className="diff-btn diff-btn-accept-all" onClick={acceptAllPendingChanges}>
            Accept All ({pending.length})
          </button>
          <button className="diff-btn diff-btn-reject-all" onClick={rejectAllPendingChanges}>
            Reject All
          </button>
          <div className="diff-nav">
            <button
              className="diff-btn diff-btn-nav"
              disabled={pending.indexOf(activeChange) === 0}
              onClick={() => {
                const idx = pending.indexOf(activeChange)
                if (idx > 0) setActivePendingChange(pending[idx - 1].id)
              }}
            >← Prev</button>
            <button
              className="diff-btn diff-btn-nav"
              disabled={pending.indexOf(activeChange) === pending.length - 1}
              onClick={() => {
                const idx = pending.indexOf(activeChange)
                if (idx < pending.length - 1) setActivePendingChange(pending[idx + 1].id)
              }}
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}

function renderDiffDescription(change: PendingChange): React.ReactNode {
  const desc = change.description
  return <div className="diff-description">{desc}</div>
}
