import React, { useState, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const VcsPanel: FC = () => {
  const { vcsPanelOpen, vcsPanelView, commits, branches, currentBranch, diffData,
    setVcsPanelOpen, setVcsPanelView, setCommits, setBranches, setDiffData, setDocumentContent, setCurrentBranch } = useAppStore()
  const [commitMsg, setCommitMsg] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [selectedCommit, setSelectedCommit] = useState('')

  useEffect(() => {
    if (vcsPanelOpen) {
      refreshData()
    }
  }, [vcsPanelOpen, vcsPanelView])

  const refreshData = async () => {
    try {
      const log = await window.wordapp?.vcs.log()
      if (log) setCommits(log)

      const branchList = await window.wordapp?.vcs.listBranches()
      if (branchList) setBranches(branchList)

      const branch = await window.wordapp?.vcs.currentBranch()
      if (branch) setCurrentBranch(branch)
    } catch {}
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    const content = useAppStore.getState().documentContent
    await window.wordapp?.vcs.commit(commitMsg, content)
    setCommitMsg('')
    refreshData()
  }

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return
    await window.wordapp?.vcs.createBranch(newBranchName)
    setNewBranchName('')
    refreshData()
  }

  const handleSwitchBranch = async (name: string) => {
    await window.wordapp?.vcs.switchBranch(name)
    setCurrentBranch(name)
    refreshData()
  }

  const handleRevert = async (commitId: string) => {
    const content = await window.wordapp?.vcs.revert(commitId)
    if (content) {
      setDocumentContent(content)
    }
    refreshData()
  }

  const handleDiff = async (fromId?: string, toId?: string) => {
    const data = await window.wordapp?.vcs.diff(fromId, toId)
    if (data) setDiffData(data)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5)
  }

  return (
    <div className={`vcs-panel${vcsPanelOpen ? ' open' : ''}`}>
      <div className="vcs-panel-header">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['log', 'commit', 'branches', 'diff'] as const).map((view) => (
            <button
              key={view}
              className={`btn ${vcsPanelView === view ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVcsPanelView(view)}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
        <button className="toolbar-btn" onClick={() => setVcsPanelOpen(false)} style={{ width: 24, height: 24 }}>✕</button>
      </div>

      <div className="vcs-panel-body">
        {/* Branch indicator */}
        <div style={{ marginBottom: 12, padding: '6px 10px', background: 'var(--bg-surface)', borderRadius: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current branch: </span>
          <span className="branch-tag current">{currentBranch}</span>
        </div>

        {vcsPanelView === 'commit' && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Commit message
            </label>
            <input
              className="chat-input"
              style={{ width: '100%', marginBottom: 8 }}
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Describe your changes..."
              onKeyDown={(e) => { if (e.key === 'Enter') handleCommit() }}
            />
            <button className="btn btn-primary" onClick={handleCommit} style={{ width: '100%' }}>
              Commit
            </button>
          </div>
        )}

        {vcsPanelView === 'log' && (
          <div>
            {commits.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                No commits yet. Create your first commit to start tracking changes.
              </div>
            )}
            {commits.map((c) => (
              <div key={c.id} className="commit-entry">
                <span className="commit-id">{c.id}</span>
                <div style={{ flex: 1 }}>
                  <div className="commit-msg">{c.message}</div>
                  <div className="commit-time">{formatTime(c.timestamp)} · {c.branch}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleRevert(c.id)} title="Revert to this commit">⟲</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => { setSelectedCommit(c.id); setVcsPanelView('diff'); handleDiff(c.parent || undefined, c.id) }} title="View diff">Δ</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {vcsPanelView === 'branches' && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <input
                className="chat-input"
                style={{ width: 'calc(100% - 70px)', marginRight: 8 }}
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="New branch name..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch() }}
              />
              <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleCreateBranch}>
                Create
              </button>
            </div>
            {branches.map((b) => (
              <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bg-surface)' }}>
                <span className={`branch-tag ${b.current ? 'current' : 'other'}`}>{b.name}</span>
                {!b.current && (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => handleSwitchBranch(b.name)}>
                    Switch
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {vcsPanelView === 'diff' && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDiff()}>
                Refresh Diff
              </button>
            </div>
            {diffData ? (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {diffData.from || '(empty)'} → {diffData.to || '(empty)'}
                </div>
                {diffData.changes.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No differences found.</div>
                ) : (
                  diffData.changes.map((change, i) => (
                    <div key={i} className={`diff-line ${change.type}`}>
                      {change.type === 'add' ? '+' : '-'} {change.content}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                Make a commit first, then view the diff here.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
