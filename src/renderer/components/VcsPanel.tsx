import React, { useState, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const VcsPanel: FC = () => {
  const {
    vcsPanelOpen, vcsPanelView, commits, branches, currentBranch, diffData,
    diffSideBySide, vcsTags, graphNodes, mergeConflicts, mergeSourceBranch,
    setVcsPanelOpen, setVcsPanelView, setCommits, setBranches, setDiffData,
    setDocumentContent, setCurrentBranch, setDiffSideBySide, setVcsTags,
    setGraphNodes, setMergeConflicts, setMergeSourceBranch
  } = useAppStore()

  const [commitMsg, setCommitMsg] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [tagCommitId, setTagCommitId] = useState('')
  const [selectedCommit, setSelectedCommit] = useState('')
  const [mergeBranch, setMergeBranch] = useState('')

  useEffect(() => {
    if (vcsPanelOpen) refreshData()
  }, [vcsPanelOpen, vcsPanelView])

  const refreshData = async () => {
    try {
      const log = await window.wordapp?.vcs.log()
      if (log) setCommits(log)

      const branchList = await window.wordapp?.vcs.listBranches()
      if (branchList) setBranches(branchList)

      const branch = await window.wordapp?.vcs.currentBranch()
      if (branch) setCurrentBranch(branch)

      const tags = await window.wordapp?.vcs.listTags()
      if (tags) setVcsTags(tags)

      if (vcsPanelView === 'graph') {
        const g = await window.wordapp?.vcs.graph()
        if (g) setGraphNodes(g)
      }
    } catch {}
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    const content = useAppStore.getState().documentContent
    try {
      await window.wordapp?.vcs.commit(commitMsg, content)
      setCommitMsg('')
      refreshData()
      useAppStore.getState().addToast('success', 'Committed successfully')
    } catch (err) {
      useAppStore.getState().addToast('error', `Commit failed: ${(err as Error).message}`)
    }
  }

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return
    await window.wordapp?.vcs.createBranch(newBranchName)
    setNewBranchName('')
    refreshData()
  }

  const handleDeleteBranch = async (name: string) => {
    await window.wordapp?.vcs.deleteBranch(name)
    refreshData()
  }

  const handleSwitchBranch = async (name: string) => {
    await window.wordapp?.vcs.switchBranch(name)
    setCurrentBranch(name)
    const log = await window.wordapp?.vcs.log()
    if (log) setCommits(log)
    refreshData()
  }

  const handleRevert = async (commitId: string) => {
    const content = await window.wordapp?.vcs.revert(commitId)
    if (content) setDocumentContent(content)
    refreshData()
  }

  const handleDiff = async (fromId?: string, toId?: string) => {
    const data = await window.wordapp?.vcs.diff(fromId, toId)
    if (data) setDiffData(data)
  }

  const handleMerge = async () => {
    if (!mergeBranch) return
    setMergeSourceBranch(mergeBranch)
    const content = useAppStore.getState().documentContent
    const result = await window.wordapp?.vcs.merge(mergeBranch, content)
    if (result) {
      if (result.success) {
        setMergeConflicts([])
        refreshData()
        useAppStore.getState().addToast('success', `Merged ${mergeBranch}`)
      } else {
        setMergeConflicts(result.conflicts || [])
        useAppStore.getState().addToast('warning', `Merge has ${result.conflicts?.length || 0} conflicts`)
      }
    }
  }

  const handleCherryPick = async (commitId: string) => {
    await window.wordapp?.vcs.cherryPick(commitId)
    refreshData()
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    await window.wordapp?.vcs.createTag(newTagName, tagCommitId || undefined)
    setNewTagName('')
    setTagCommitId('')
    refreshData()
  }

  const handleDeleteTag = async (name: string) => {
    await window.wordapp?.vcs.deleteTag(name)
    refreshData()
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5)
  }

  const views = ['log', 'commit', 'branches', 'graph', 'merge', 'diff', 'tags'] as const

  if (!vcsPanelOpen) return null

  return (
    <div className="vcs-panel open">
      <div className="vcs-panel-header">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {views.map((view) => (
            <button
              key={view}
              className={`btn ${vcsPanelView === view ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVcsPanelView(view)}
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
        <button className="toolbar-btn" onClick={() => setVcsPanelOpen(false)} style={{ width: 24, height: 24 }}>✕</button>
      </div>

      <div className="vcs-panel-body">
        <div style={{ marginBottom: 12, padding: '6px 10px', background: 'var(--bg-surface)', borderRadius: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Branch: </span>
          <span className="branch-tag current">{currentBranch}</span>
        </div>

        {vcsPanelView === 'commit' && <CommitView />}
        {vcsPanelView === 'log' && <LogView />}
        {vcsPanelView === 'branches' && <BranchesView />}
        {vcsPanelView === 'graph' && <GraphView />}
        {vcsPanelView === 'merge' && <MergeView />}
        {vcsPanelView === 'diff' && <DiffView />}
        {vcsPanelView === 'tags' && <TagsView />}
      </div>
    </div>
  )

  // ─── Commit View ───
  function CommitView() {
    return (
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
    )
  }

  // ─── Log View ───
  function LogView() {
    return (
      <div>
        {commits.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            No commits yet.
          </div>
        )}
        {commits.map((c) => (
          <div key={c.id} className="commit-entry">
            <span className="commit-id">{c.id}</span>
            <div style={{ flex: 1 }}>
              <div className="commit-msg">{c.message}</div>
              <div className="commit-time">
                {formatTime(c.timestamp)} · {c.branch}
                {c.tags && c.tags.length > 0 && c.tags.map((t) => (
                  <span key={t} className="vcs-tag-badge">{t}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleRevert(c.id)} title="Revert">⟲</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => { setSelectedCommit(c.id); setVcsPanelView('diff'); handleDiff(c.parents?.[0] || undefined, c.id) }} title="Diff">Δ</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleCherryPick(c.id)} title="Cherry-pick">🍒</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ─── Branches View ───
  function BranchesView() {
    return (
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
              <>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => handleSwitchBranch(b.name)}>
                  Switch
                </button>
                {b.name !== 'main' && (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => handleDeleteBranch(b.name)}>
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ─── Graph View ───
  function GraphView() {
    if (graphNodes.length === 0) {
      return (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
          No commits to display.
        </div>
      )
    }

    return (
      <div className="vcs-graph">
        {graphNodes.map((node) => (
          <div key={node.id} className="graph-node">
            <div className="graph-node-dot" />
            {node.isMerge && <div className="graph-merge-indicator">M</div>}
            <div className="graph-node-content">
              <div className="graph-node-msg">{node.message}</div>
              <div className="graph-node-meta">
                <span className="commit-id">{node.id}</span>
                <span style={{ color: 'var(--text-muted)' }}>{formatTime(node.timestamp)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{node.branch}</span>
                {node.branches.map((b) => (
                  <span key={b} className="branch-tag other" style={{ fontSize: 10 }}>{b}</span>
                ))}
                {node.tags.map((t) => (
                  <span key={t} className="vcs-tag-badge">{t}</span>
                ))}
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleCherryPick(node.id)} title="Cherry-pick">🍒</button>
          </div>
        ))}
      </div>
    )
  }

  // ─── Merge View ───
  function MergeView() {
    return (
      <div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
          Merge source branch into <strong>{currentBranch}</strong>
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select
            className="toolbar-select"
            style={{ flex: 1 }}
            value={mergeBranch}
            onChange={(e) => setMergeBranch(e.target.value)}
          >
            <option value="">Select branch...</option>
            {branches.filter((b) => !b.current).map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleMerge} disabled={!mergeBranch}>
            Merge
          </button>
        </div>

        {mergeConflicts.length > 0 && (
          <div className="merge-conflicts">
            <div style={{ color: 'var(--warning)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Conflicts detected ({mergeConflicts.length})
            </div>
            {mergeConflicts.map((c, i) => (
              <div key={i} className="conflict-entry">
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{c.path}</div>
                <div className="conflict-three-way">
                  <div className="conflict-pane">
                    <div className="conflict-pane-label">Base</div>
                    <pre className="conflict-pane-content">{c.base}</pre>
                  </div>
                  <div className="conflict-pane ours">
                    <div className="conflict-pane-label">Ours ({currentBranch})</div>
                    <pre className="conflict-pane-content">{c.ours}</pre>
                  </div>
                  <div className="conflict-pane theirs">
                    <div className="conflict-pane-label">Theirs ({mergeSourceBranch})</div>
                    <pre className="conflict-pane-content">{c.theirs}</pre>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => {
                    const resolved = [...mergeConflicts]
                    resolved[i] = { ...resolved[i], resolved: c.ours }
                    setMergeConflicts(resolved)
                  }}>Keep Ours</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => {
                    const resolved = [...mergeConflicts]
                    resolved[i] = { ...resolved[i], resolved: c.theirs }
                    setMergeConflicts(resolved)
                  }}>Keep Theirs</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {mergeConflicts.length === 0 && mergeSourceBranch && (
          <div style={{ color: 'var(--success)', fontSize: 13, textAlign: 'center', padding: 12 }}>
            Merge completed successfully.
          </div>
        )}
      </div>
    )
  }

  // ─── Diff View ───
  function DiffView() {
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDiff()}>
            Latest Diff
          </button>
          <button
            className={`btn ${diffSideBySide ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setDiffSideBySide(!diffSideBySide)}
          >
            {diffSideBySide ? 'Side-by-Side' : 'Inline'}
          </button>
        </div>
        {diffData ? (
          diffSideBySide ? <SideBySideDiff /> : <InlineDiff />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            Make a commit first, then view the diff here.
          </div>
        )}
      </div>
    )
  }

  function InlineDiff() {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {diffData!.from} → {diffData!.to}
        </div>
        {diffData!.changes.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No differences.</div>
        ) : (
          diffData!.changes.map((change, i) => (
            <div key={i} className={`diff-line ${change.type}`}>
              {change.type === 'add' ? '+' : '-'} {change.content}
            </div>
          ))
        )}
      </div>
    )
  }

  function SideBySideDiff() {
    const fromLines = diffData!.fromContent.split('\n')
    const toLines = diffData!.toContent.split('\n')
    const maxLen = Math.max(fromLines.length, toLines.length)

    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {diffData!.from} → {diffData!.to}
        </div>
        <div className="diff-side-by-side">
          <div className="diff-pane">
            <div className="diff-pane-header">Before</div>
            <div className="diff-pane-content">
              {Array.from({ length: maxLen }, (_, i) => (
                <div key={i} className={`diff-sbs-line ${i < fromLines.length && (i >= toLines.length || fromLines[i] !== toLines[i]) ? 'diff-removed' : ''}`}>
                  <span className="diff-line-num">{i + 1}</span>
                  <span>{i < fromLines.length ? fromLines[i] : ''}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="diff-pane">
            <div className="diff-pane-header">After</div>
            <div className="diff-pane-content">
              {Array.from({ length: maxLen }, (_, i) => (
                <div key={i} className={`diff-sbs-line ${i < toLines.length && (i >= fromLines.length || fromLines[i] !== toLines[i]) ? 'diff-added' : ''}`}>
                  <span className="diff-line-num">{i + 1}</span>
                  <span>{i < toLines.length ? toLines[i] : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Tags View ───
  function TagsView() {
    return (
      <div>
        <div style={{ marginBottom: 12 }}>
          <input
            className="chat-input"
            style={{ width: 'calc(50% - 40px)', marginRight: 8 }}
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name..."
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag() }}
          />
          <input
            className="chat-input"
            style={{ width: 'calc(50% - 40px)', marginRight: 8 }}
            value={tagCommitId}
            onChange={(e) => setTagCommitId(e.target.value)}
            placeholder="Commit ID (optional)"
          />
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleCreateTag}>
            Create
          </button>
        </div>

        {vcsTags.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            No tags yet.
          </div>
        ) : (
          vcsTags.map((tag) => (
            <div key={tag.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bg-surface)' }}>
              <span className="vcs-tag-badge">{tag.name}</span>
              <span className="commit-id">{tag.commitId}</span>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>{formatTime(tag.timestamp)}</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => handleDeleteTag(tag.name)}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    )
  }
}