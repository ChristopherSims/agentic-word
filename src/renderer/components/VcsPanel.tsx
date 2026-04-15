import React, { useState, useEffect, type FC } from 'react'
import { Box, Paper, Typography, IconButton, Tabs, Tab, TextField, Button, Chip, List, ListItem, ListItemText, ListItemButton, Divider, Select, MenuItem, FormControl, Tooltip, Alert } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SaveIcon from '@mui/icons-material/Save'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import DeleteIcon from '@mui/icons-material/Delete'
import UndoIcon from '@mui/icons-material/Undo'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
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
  const [mergeBranch, setMergeBranch] = useState('')

  useEffect(() => { if (vcsPanelOpen) refreshData() }, [vcsPanelOpen, vcsPanelView])

  const refreshData = async () => {
    try {
      const log = await window.wordapp?.vcs.log(); if (log) setCommits(log)
      const branchList = await window.wordapp?.vcs.listBranches(); if (branchList) setBranches(branchList)
      const branch = await window.wordapp?.vcs.currentBranch(); if (branch) setCurrentBranch(branch)
      const tags = await window.wordapp?.vcs.listTags(); if (tags) setVcsTags(tags)
      if (vcsPanelView === 'graph') { const g = await window.wordapp?.vcs.graph(); if (g) setGraphNodes(g) }
    } catch {}
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    try { await window.wordapp?.vcs.commit(commitMsg, useAppStore.getState().documentContent); setCommitMsg(''); refreshData(); useAppStore.getState().addToast('success', 'Committed') }
    catch (err) { useAppStore.getState().addToast('error', `Commit failed: ${(err as Error).message}`) }
  }
  const handleCreateBranch = async () => { if (!newBranchName.trim()) return; await window.wordapp?.vcs.createBranch(newBranchName); setNewBranchName(''); refreshData() }
  const handleDeleteBranch = async (name: string) => { await window.wordapp?.vcs.deleteBranch(name); refreshData() }
  const handleSwitchBranch = async (name: string) => { await window.wordapp?.vcs.switchBranch(name); setCurrentBranch(name); refreshData() }
  const handleRevert = async (commitId: string) => { const content = await window.wordapp?.vcs.revert(commitId); if (content) setDocumentContent(content); refreshData() }
  const handleDiff = async (fromId?: string, toId?: string) => { const data = await window.wordapp?.vcs.diff(fromId, toId); if (data) setDiffData(data) }
  const handleMerge = async () => {
    if (!mergeBranch) return
    setMergeSourceBranch(mergeBranch)
    const result = await window.wordapp?.vcs.merge(mergeBranch, useAppStore.getState().documentContent)
    if (result) {
      if (result.success) { setMergeConflicts([]); refreshData(); useAppStore.getState().addToast('success', `Merged ${mergeBranch}`) }
      else { setMergeConflicts(result.conflicts || []); useAppStore.getState().addToast('warning', `Merge has ${result.conflicts?.length || 0} conflicts`) }
    }
  }
  const handleCherryPick = async (commitId: string) => { await window.wordapp?.vcs.cherryPick(commitId); refreshData() }
  const handleCreateTag = async () => { if (!newTagName.trim()) return; await window.wordapp?.vcs.createTag(newTagName, tagCommitId || undefined); setNewTagName(''); setTagCommitId(''); refreshData() }
  const handleDeleteTag = async (name: string) => { await window.wordapp?.vcs.deleteTag(name); refreshData() }

  const formatTime = (ts: number) => { const d = new Date(ts); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5) }

  if (!vcsPanelOpen) return null

  return (
    <Paper sx={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 360, zIndex: 100, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={vcsPanelView} onChange={(_, v) => setVcsPanelView(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 28, '& .MuiTab-root': { minHeight: 28, px: 0.75, fontSize: 10 } }}>
          <Tab label="Log" value="log" /><Tab label="Commit" value="commit" /><Tab label="Branches" value="branches" /><Tab label="Graph" value="graph" /><Tab label="Merge" value="merge" /><Tab label="Diff" value="diff" /><Tab label="Tags" value="tags" />
        </Tabs>
        <IconButton size="small" onClick={() => setVcsPanelOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>

      <Box sx={{ px: 1.5, py: 0.75, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">Branch: </Typography>
        <Chip label={currentBranch} size="small" color="primary" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {vcsPanelView === 'commit' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Commit message</Typography>
            <TextField fullWidth size="small" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder="Describe your changes..." onKeyDown={(e) => { if (e.key === 'Enter') handleCommit() }} sx={{ mb: 1 }} />
            <Button fullWidth variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleCommit}>Commit</Button>
          </>
        )}

        {vcsPanelView === 'log' && (
          <>
            {commits.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>No commits yet.</Typography>}
            {commits.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                <Chip label={c.id.slice(0, 7)} size="small" variant="outlined" sx={{ fontSize: 9, height: 16, fontFamily: 'monospace' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" noWrap>{c.message}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 9 }}>{formatTime(c.timestamp)} · {c.branch} {c.tags?.map((t) => <Chip key={t} label={t} size="small" sx={{ fontSize: 8, height: 14, ml: 0.25 }} />)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  <Tooltip title="Revert"><IconButton size="small" onClick={() => handleRevert(c.id)}><UndoIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
                  <Tooltip title="Diff"><IconButton size="small" onClick={() => { setVcsPanelView('diff'); handleDiff(c.parents?.[0] || undefined, c.id) }}><CompareArrowsIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
                  <Tooltip title="Cherry-pick"><IconButton size="small" onClick={() => handleCherryPick(c.id)}><Chip label="🍒" size="small" sx={{ fontSize: 8, height: 14 }} /></IconButton></Tooltip>
                </Box>
              </Box>
            ))}
          </>
        )}

        {vcsPanelView === 'branches' && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
              <TextField size="small" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="New branch..." sx={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch() }} />
              <Button size="small" variant="outlined" onClick={handleCreateBranch}>Create</Button>
            </Box>
            <List dense>{branches.map((b) => (
              <ListItem key={b.name} secondaryAction={!b.current && <Box sx={{ display: 'flex', gap: 0.25 }}>
                <Button size="small" variant="outlined" onClick={() => handleSwitchBranch(b.name)} sx={{ fontSize: 10, py: 0 }}>Switch</Button>
                {b.name !== 'main' && <IconButton size="small" color="error" onClick={() => handleDeleteBranch(b.name)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>}
              </Box>}>
                <ListItemText primary={<Chip label={b.name} size="small" color={b.current ? 'primary' : 'default'} variant={b.current ? 'filled' : 'outlined'} sx={{ fontSize: 10, height: 20 }} />} />
              </ListItem>
            ))}</List>
          </>
        )}

        {vcsPanelView === 'graph' && (
          <>
            {graphNodes.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>No commits to display.</Typography>}
            {graphNodes.map((node) => (
              <Box key={node.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                {node.isMerge && <Chip label="M" size="small" color="secondary" sx={{ fontSize: 8, height: 14 }} />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" noWrap>{node.message}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 9 }}>
                    {node.id.slice(0, 7)} · {formatTime(node.timestamp)} · {node.branch}
                    {node.branches.map((b) => <Chip key={b} label={b} size="small" sx={{ fontSize: 8, height: 14, ml: 0.25 }} />)}
                    {node.tags.map((t) => <Chip key={t} label={t} size="small" color="warning" sx={{ fontSize: 8, height: 14, ml: 0.25 }} />)}
                  </Typography>
                </Box>
                <Tooltip title="Cherry-pick"><IconButton size="small" onClick={() => handleCherryPick(node.id)}><SwapHorizIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
              </Box>
            ))}
          </>
        )}

        {vcsPanelView === 'merge' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Merge source branch into <strong>{currentBranch}</strong></Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
              <FormControl fullWidth size="small"><Select value={mergeBranch} onChange={(e) => setMergeBranch(e.target.value)} displayEmpty><MenuItem value="" sx={{ fontSize: 11 }}>Select branch...</MenuItem>{branches.filter((b) => !b.current).map((b) => <MenuItem key={b.name} value={b.name} sx={{ fontSize: 11 }}>{b.name}</MenuItem>)}</Select></FormControl>
              <Button size="small" variant="contained" onClick={handleMerge} disabled={!mergeBranch}>Merge</Button>
            </Box>
            {mergeConflicts.length > 0 && (
              <Box>
                <Alert severity="warning" sx={{ mb: 1, py: 0, '& .MuiAlert-message': { fontSize: 11 } }}>Conflicts detected ({mergeConflicts.length})</Alert>
                {mergeConflicts.map((c, i) => (
                  <Box key={i} sx={{ mb: 1, p: 1, borderRadius: 1, border: 1, borderColor: 'warning.main' }}>
                    <Typography variant="caption" color="text.secondary">{c.path}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                      <Box sx={{ flex: 1 }}><Typography variant="caption" fontWeight={600}>Base</Typography><pre style={{ fontSize: 10, margin: 0, whiteSpace: 'pre-wrap' }}>{c.base}</pre></Box>
                      <Box sx={{ flex: 1 }}><Typography variant="caption" fontWeight={600} color="primary.main">Ours ({currentBranch})</Typography><pre style={{ fontSize: 10, margin: 0, whiteSpace: 'pre-wrap' }}>{c.ours}</pre></Box>
                      <Box sx={{ flex: 1 }}><Typography variant="caption" fontWeight={600} color="error.main">Theirs ({mergeSourceBranch})</Typography><pre style={{ fontSize: 10, margin: 0, whiteSpace: 'pre-wrap' }}>{c.theirs}</pre></Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                      <Button size="small" variant="outlined" onClick={() => { const r = [...mergeConflicts]; r[i] = { ...r[i], resolved: c.ours }; setMergeConflicts(r) }}>Keep Ours</Button>
                      <Button size="small" variant="outlined" onClick={() => { const r = [...mergeConflicts]; r[i] = { ...r[i], resolved: c.theirs }; setMergeConflicts(r) }}>Keep Theirs</Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            {mergeConflicts.length === 0 && mergeSourceBranch && (
              <Typography variant="caption" color="success.main" sx={{ textAlign: 'center', display: 'block', py: 2 }}>Merge completed successfully.</Typography>
            )}
          </>
        )}

        {vcsPanelView === 'diff' && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
              <Button size="small" variant="outlined" onClick={() => handleDiff()}>Latest Diff</Button>
              <Button size="small" variant={diffSideBySide ? 'contained' : 'outlined'} onClick={() => setDiffSideBySide(!diffSideBySide)}>{diffSideBySide ? 'Side-by-Side' : 'Inline'}</Button>
            </Box>
            {diffData ? (
              diffSideBySide ? (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Box sx={{ flex: 1 }}><Typography variant="caption" fontWeight={600}>Before</Typography>{diffData.fromContent.split('\n').map((l: string, i: number) => <Box key={i} sx={{ fontSize: 10, fontFamily: 'monospace', px: 0.5, bgcolor: 'action.hover' }}>{l}</Box>)}</Box>
                  <Box sx={{ flex: 1 }}><Typography variant="caption" fontWeight={600}>After</Typography>{diffData.toContent.split('\n').map((l: string, i: number) => <Box key={i} sx={{ fontSize: 10, fontFamily: 'monospace', px: 0.5 }}>{l}</Box>)}</Box>
                </Box>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>{diffData.from} → {diffData.to}</Typography>
                  {diffData.changes.length === 0 && <Typography variant="caption" color="text.secondary">No differences.</Typography>}
                  {diffData.changes.map((c: any, i: number) => (
                    <Box key={i} sx={{ fontSize: 10, fontFamily: 'monospace', px: 0.5, bgcolor: c.type === 'add' ? 'success.dark' : c.type === 'delete' ? 'error.dark' : 'transparent', color: c.type !== 'normal' ? 'white' : 'text.primary' }}>
                      {c.type === 'add' ? '+' : c.type === 'delete' ? '-' : ' '} {c.content}
                    </Box>
                  ))}
                </Box>
              )
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>Make a commit first, then view the diff here.</Typography>
            )}
          </>
        )}

        {vcsPanelView === 'tags' && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
              <TextField size="small" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Tag name..." sx={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag() }} />
              <TextField size="small" value={tagCommitId} onChange={(e) => setTagCommitId(e.target.value)} placeholder="Commit ID (opt)" sx={{ flex: 1 }} />
              <Button size="small" variant="outlined" onClick={handleCreateTag}>Create</Button>
            </Box>
            {vcsTags.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>No tags yet.</Typography>}
            <List dense>{vcsTags.map((tag) => (
              <ListItem key={tag.name} secondaryAction={<IconButton size="small" color="error" onClick={() => handleDeleteTag(tag.name)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>}>
                <Chip label={tag.name} size="small" color="warning" sx={{ fontSize: 10, height: 20, mr: 0.5 }} />
                <ListItemText primary={tag.commitId.slice(0, 7)} secondary={formatTime(tag.timestamp)} primaryTypographyProps={{ fontSize: 10, fontFamily: 'monospace' }} secondaryTypographyProps={{ fontSize: 9 }} />
              </ListItem>
            ))}</List>
          </>
        )}
      </Box>
    </Paper>
  )
}
