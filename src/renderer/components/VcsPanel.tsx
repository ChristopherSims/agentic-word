import React, { useState, useEffect, type FC } from 'react'
import { Box, Typography, IconButton, Tabs, Tab, TextField, Button, Chip, List, ListItem, ListItemText, ListItemButton, Divider, Select, MenuItem, FormControl, Tooltip, Alert, Switch, FormControlLabel, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SaveIcon from '@mui/icons-material/Save'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import DeleteIcon from '@mui/icons-material/Delete'
import UndoIcon from '@mui/icons-material/Undo'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import StashIcon from '@mui/icons-material/Archive'
import BlameIcon from '@mui/icons-material/PersonPin'
import RebaseIcon from '@mui/icons-material/History'
import PatchIcon from '@mui/icons-material/EmailOutlined'
import HookIcon from '@mui/icons-material/Security'
import GraphIcon from '@mui/icons-material/AccountTree'
import MergeIcon from '@mui/icons-material/Merge'
import { useAppStore } from '../store/app-store'
import { ThreeWayMergeViewer } from './ThreeWayMergeViewer'
import { BranchProtectionPanel } from './BranchProtectionPanel'
import { MergeStatusPanel } from './MergeStatusPanel'
import { DagGraph } from './DagGraph'
import type {
  VcsGraphLanesResult, VcsStashEntry, VcsBlameLine, VcsHooks,
  VcsMergeResult, VcsValidateCommitResult, VcsImportPatchResult, VcsBranchProtection, VcsMergeRequest
} from '../types'
import { SidePanel } from './shared/SidePanel'
import { formatTime, validateInput } from '../utils'

type VcsView = 'log' | 'commit' | 'branches' | 'graph' | 'merge' | 'diff' | 'tags' | 'stash' | 'blame' | 'rebase' | 'patches' | 'hooks' | 'merge-strategies' | 'branch-protection' | 'merge-requests'

export const VcsPanel: FC = () => {
  const {
    vcsPanelOpen, vcsPanelView, commits, branches, currentBranch, diffData,
    diffSideBySide, vcsTags, graphNodes, mergeConflicts, mergeSourceBranch,
    vcsStashList, vcsBlameData, vcsBlameOpen, vcsGraphEdges, vcsHooks,
    vcsRebaseMode, vcsRebaseSelectedIds,
    setVcsPanelOpen, setVcsPanelView, setCommits, setBranches, setDiffData,
    setDocumentContent, setCurrentBranch, setDiffSideBySide, setVcsTags,
    setGraphNodes, setMergeConflicts, setMergeSourceBranch,
    setVcsStashList, setVcsBlameData, setVcsBlameOpen, setVcsGraphEdges,
    setVcsHooks, setVcsRebaseMode, setVcsRebaseSelectedIds
  } = useAppStore()

  const [commitMsg, setCommitMsg] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [tagCommitId, setTagCommitId] = useState('')
  const [mergeBranch, setMergeBranch] = useState('')
  const [stashMsg, setStashMsg] = useState('')
  const [squashMsg, setSquashMsg] = useState('')
  const [editCommitId, setEditCommitId] = useState('')
  const [editCommitMsg, setEditCommitMsg] = useState('')
  const [patchDialogOpen, setPatchDialogOpen] = useState(false)
  // v0.4.8: Advanced VCS Features
  const [branchProtections, setBranchProtections] = useState<VcsBranchProtection[]>([])
  const [mergeRequests, setMergeRequests] = useState<VcsMergeRequest[]>([])
  const [threeWayMergeDiff, setThreeWayMergeDiff] = useState<{ base: string; ours: string; theirs: string; conflicts: any[] }>({ base: '', ours: '', theirs: '', conflicts: [] })
  const [mergeStrategy, setMergeStrategy] = useState<'recursive' | 'resolve' | 'ours' | 'theirs'>('recursive')
  const [patchFromId, setPatchFromId] = useState('')
  const [patchToId, setPatchToId] = useState('')
  const [importPatchText, setImportPatchText] = useState('')
  const [hookTemplate, setHookTemplate] = useState(vcsHooks.commitMessageTemplate)
  const [protectedBranches, setProtectedBranches] = useState(vcsHooks.protectedBranches.join(', '))
  // v0.5.5: Range diff & branch comparison
  const [diffFromId, setDiffFromId] = useState('')
  const [diffToId, setDiffToId] = useState('')
  const [diffRangeMode, setDiffRangeMode] = useState(false)
  const [compareBranchA, setCompareBranchA] = useState('')
  const [compareBranchB, setCompareBranchB] = useState('')

  useEffect(() => { if (vcsPanelOpen) refreshData() }, [vcsPanelOpen, vcsPanelView])

  const refreshData = async () => {
    try {
      const log = await window.wordapp?.vcs.log(); if (log) setCommits(log)
      const branchList = await window.wordapp?.vcs.listBranches(); if (branchList) setBranches(branchList)
      const branch = await window.wordapp?.vcs.currentBranch(); if (branch) setCurrentBranch(branch)
      const tags = await window.wordapp?.vcs.listTags(); if (tags) setVcsTags(tags)
      if (vcsPanelView === 'graph') {
        const g = await window.wordapp?.vcs.graphLanes()
        if (g) { const graphResult = g as VcsGraphLanesResult; setGraphNodes(graphResult.nodes ?? []); setVcsGraphEdges(graphResult.edges ?? []) }
      }
      if (vcsPanelView === 'stash') {
        const s = await window.wordapp?.vcs.stashList(); if (s) setVcsStashList(s as VcsStashEntry[])
      }
      if (vcsPanelView === 'blame') {
        const b = await window.wordapp?.vcs.blame(useAppStore.getState().documentContent); if (b) setVcsBlameData(b as VcsBlameLine[])
      }
      if (vcsPanelView === 'hooks') {
        const h = await window.wordapp?.vcs.getHooks(); if (h) setVcsHooks(h as VcsHooks)
      }
    } catch (err) {
      useAppStore.getState().addToast('error', `VCS data refresh failed: ${(err as Error).message}`)
    }
  }

  const handleCommit = async () => {
    if (!validateInput(commitMsg)) return
    // Validate with hooks
    const validation = await window.wordapp?.vcs.validateCommit(commitMsg)
    if (validation && !(validation as VcsValidateCommitResult).valid) {
      useAppStore.getState().addToast('warning', `Commit blocked: ${(validation as VcsValidateCommitResult).errors.join('; ')}`)
      return
    }
    try {
      await window.wordapp?.vcs.commit(commitMsg, useAppStore.getState().documentContent)
      setCommitMsg(''); refreshData()
      useAppStore.getState().addToast('success', 'Committed')
    } catch (err) { useAppStore.getState().addToast('error', `Commit failed: ${(err as Error).message}`) }
  }

  const handleCreateBranch = async () => { if (!validateInput(newBranchName)) return; await window.wordapp?.vcs.createBranch(newBranchName); setNewBranchName(''); refreshData() }
  const handleDeleteBranch = async (name: string) => { await window.wordapp?.vcs.deleteBranch(name); refreshData() }
  const handleSwitchBranch = async (name: string) => { await window.wordapp?.vcs.switchBranch(name); setCurrentBranch(name); refreshData() }
  const handleRevert = async (commitId: string) => { const content = await window.wordapp?.vcs.revert(commitId); if (content) setDocumentContent(content); refreshData() }
  const handleDiff = async (fromId?: string, toId?: string) => { const data = await window.wordapp?.vcs.diff(fromId, toId); if (data) setDiffData(data) }
  const handleBranchCompare = async () => {
    const a = branches.find(b => b.name === compareBranchA)
    const b = branches.find(br => br.name === compareBranchB)
    if (!a || !b || a.name === b.name) return
    setDiffRangeMode(true)
    setVcsPanelView('diff')
    await handleDiff(a.head || undefined, b.head || undefined)
  }
  const handleMerge = async () => {
    if (!mergeBranch) return
    setMergeSourceBranch(mergeBranch)
    const result = await window.wordapp?.vcs.merge(mergeBranch, useAppStore.getState().documentContent) as VcsMergeResult | undefined
    if (result) {
      if (result.success) { setMergeConflicts([]); refreshData(); useAppStore.getState().addToast('success', `Merged ${mergeBranch}`) }
      else { setMergeConflicts(result.conflicts ?? []); useAppStore.getState().addToast('warning', `Merge has ${result.conflicts?.length ?? 0} conflicts`) }
    }
  }
  const handleCherryPick = async (commitId: string) => { await window.wordapp?.vcs.cherryPick(commitId); refreshData() }
  const handleCreateTag = async () => { if (!validateInput(newTagName)) return; await window.wordapp?.vcs.createTag(newTagName, tagCommitId || undefined); setNewTagName(''); setTagCommitId(''); refreshData() }
  const handleDeleteTag = async (name: string) => { await window.wordapp?.vcs.deleteTag(name); refreshData() }

  const handleStashPush = async () => {
    const result = await window.wordapp?.vcs.stashPush(stashMsg || undefined)
    if (result) { setStashMsg(''); refreshData(); useAppStore.getState().addToast('success', 'Stashed') }
  }
  const handleStashPop = async () => {
    const entry = await window.wordapp?.vcs.stashPop()
    if (entry) { setDocumentContent((entry as VcsStashEntry).content); refreshData(); useAppStore.getState().addToast('success', 'Stash popped') }
    else useAppStore.getState().addToast('warning', 'No stash entries')
  }
  const handleStashApply = async (id: string) => {
    const entry = await window.wordapp?.vcs.stashApply(id)
    if (entry) { setDocumentContent((entry as VcsStashEntry).content); useAppStore.getState().addToast('success', 'Stash applied') }
  }
  const handleStashDrop = async (id: string) => {
    await window.wordapp?.vcs.stashDrop(id); refreshData()
    useAppStore.getState().addToast('success', 'Stash dropped')
  }

  const handleRebaseSquash = async () => {
    if (vcsRebaseSelectedIds.length < 2) return
    const result = await window.wordapp?.vcs.rebaseSquash(vcsRebaseSelectedIds, squashMsg || undefined)
    if (result) { setVcsRebaseMode(false); setVcsRebaseSelectedIds([]); setSquashMsg(''); refreshData(); useAppStore.getState().addToast('success', 'Squashed') }
  }
  const handleRebaseReorder = async () => {
    const result = await window.wordapp?.vcs.rebaseReorder(vcsRebaseSelectedIds)
    if (result) { setVcsRebaseMode(false); setVcsRebaseSelectedIds([]); refreshData(); useAppStore.getState().addToast('success', 'Reordered') }
  }
  const handleRebaseEdit = async () => {
    if (!editCommitId || !validateInput(editCommitMsg)) return
    const result = await window.wordapp?.vcs.rebaseEdit(editCommitId, editCommitMsg)
    if (result) { setEditCommitId(''); setEditCommitMsg(''); refreshData(); useAppStore.getState().addToast('success', 'Commit message edited') }
  }

  const handleExportPatch = async () => {
    const filePath = await window.wordapp?.file.saveAsDialog([{ name: 'Patch', extensions: ['patch'] }])
    if (filePath) {
      const result = await window.wordapp?.vcs.exportPatchFile(filePath, patchFromId || undefined, patchToId || undefined)
      if (result?.success) useAppStore.getState().addToast('success', 'Patch exported')
    }
  }
  const handleImportPatch = async () => {
    if (!validateInput(importPatchText)) return
    const result = await window.wordapp?.vcs.importPatch(importPatchText)
    const patchResult = result as VcsImportPatchResult | undefined
    if (patchResult?.success) {
      if (!patchResult.content) throw new Error('Patch succeeded but returned no content')
      setDocumentContent(patchResult.content)
      setImportPatchText(''); setPatchDialogOpen(false)
      useAppStore.getState().addToast('success', 'Patch applied')
    } else {
      useAppStore.getState().addToast('error', `Patch failed: ${patchResult?.message || 'unknown error'}`)
    }
  }

  const handleSaveHooks = async () => {
    const hooks = {
      ...vcsHooks,
      commitMessageTemplate: hookTemplate,
      protectedBranches: protectedBranches.split(',').map((s) => s.trim()).filter(Boolean)
    }
    const result = await window.wordapp?.vcs.setHooks(hooks)
    if (result) { setVcsHooks(result as VcsHooks); useAppStore.getState().addToast('success', 'Hooks saved') }
  }

  if (!vcsPanelOpen) return null

  // Branch colors for the DAG
  const branchColors: Record<string, string> = {
    main: '#89b4fa', master: '#89b4fa',
    develop: '#a6e3a9', feature: '#f9e2af',
    release: '#f38ba8', hotfix: '#fab387'
  }
  const getBranchColor = (name: string) => branchColors[name] || '#cba6f7'

  return (
    <SidePanel title="Version Control" onClose={() => setVcsPanelOpen(false)} width={380} headerContent={
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
        <Tabs value={vcsPanelView} onChange={(_, v) => setVcsPanelView(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 28, '& .MuiTab-root': { minHeight: 28, px: 0.5, fontSize: 9 }, flex: 1 }}>
          <Tab label="Log" value="log" /><Tab label="Commit" value="commit" /><Tab label="Branches" value="branches" />
          <Tab icon={<GraphIcon sx={{ fontSize: 12 }} />} value="graph" title="DAG" />
          <Tab label="Merge" value="merge" /><Tab label="Diff" value="diff" /><Tab label="Tags" value="tags" />
          <Tab icon={<StashIcon sx={{ fontSize: 12 }} />} value="stash" title="Stash" />
          <Tab icon={<BlameIcon sx={{ fontSize: 12 }} />} value="blame" title="Blame" />
          <Tab icon={<RebaseIcon sx={{ fontSize: 12 }} />} value="rebase" title="Rebase" />
          <Tab icon={<PatchIcon sx={{ fontSize: 12 }} />} value="patches" title="Patches" />
          <Tab icon={<HookIcon sx={{ fontSize: 12 }} />} value="hooks" title="Hooks" />
          {/* v0.4.8: Advanced VCS Features */}
          <Tab icon={<MergeIcon sx={{ fontSize: 12 }} />} value="merge-strategies" title="Merge Strategies" />
          <Tab icon={<MergeIcon sx={{ fontSize: 12 }} />} value="branch-protection" title="Branch Protection" />
          <Tab icon={<MergeIcon sx={{ fontSize: 12 }} />} value="merge-requests" title="Merge Requests" />
        </Tabs>
        <IconButton size="small" onClick={() => setVcsPanelOpen(false)} title="Close panel" sx={{ ml: 0.5, flexShrink: 0 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    }>

      <Box sx={{ px: 1.5, py: 0.75, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">Branch: </Typography>
        <Chip label={currentBranch} size="small" color="primary" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
        {vcsRebaseMode && <Chip label="REBASE" size="small" color="warning" sx={{ fontSize: 9, height: 16, ml: 0.5 }} />}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {vcsPanelView === 'commit' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Commit message</Typography>
            <TextField fullWidth size="small" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder={vcsHooks.commitMessageTemplate || 'Describe your changes...'} onKeyDown={(e) => { if (e.key === 'Enter') handleCommit() }} sx={{ mb: 1 }} />
            <Button fullWidth variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleCommit}>Commit</Button>
          </>
        )}


        {vcsPanelView === 'log' && (
          <>
            {commits.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>No commits yet.</Typography>}
            {commits.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: vcsRebaseMode && vcsRebaseSelectedIds.includes(c.id) ? 'action.selected' : 'transparent' }}>
                {vcsRebaseMode && (
                  <Checkbox size="small" checked={vcsRebaseSelectedIds.includes(c.id)} onChange={() => setVcsRebaseSelectedIds(vcsRebaseSelectedIds.includes(c.id) ? vcsRebaseSelectedIds.filter((x) => x !== c.id) : [...vcsRebaseSelectedIds, c.id])} sx={{ p: 0 }} />
                )}
                <Chip label={c.id.slice(0, 7)} size="small" variant="outlined" sx={{ fontSize: 9, height: 16, fontFamily: 'monospace' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" noWrap>{c.message}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 9 }}>{formatTime(c.timestamp)} · {c.branch} {c.author ? `· ${c.author}` : ''} {c.tags?.map((t) => <Chip key={t} label={t} size="small" sx={{ fontSize: 8, height: 14, ml: 0.25 }} />)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  <Tooltip title="Revert"><IconButton size="small" onClick={() => handleRevert(c.id)}><UndoIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
                  <Tooltip title="Diff"><IconButton size="small" onClick={() => { setVcsPanelView('diff'); handleDiff(c.parents?.[0] || undefined, c.id) }}><CompareArrowsIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
                  <Tooltip title="Cherry-pick"><IconButton size="small" onClick={() => handleCherryPick(c.id)}><SwapHorizIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>
                </Box>
              </Box>
            ))}
          </>
        )}

        {/* ─── Branches ─── */}
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
                <ListItemText primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Chip label={b.name} size="small" color={b.current ? 'primary' : 'default'} variant={b.current ? 'filled' : 'outlined'} sx={{ fontSize: 10, height: 20 }} />
                  {vcsHooks.protectedBranches.includes(b.name) && <Chip label="protected" size="small" color="warning" variant="outlined" sx={{ fontSize: 7, height: 14 }} />}
                </Box>} />
              </ListItem>
            ))}</List>
            {/* Branch Comparison */}
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Compare Branches</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Select value={compareBranchA} onChange={(e) => setCompareBranchA(e.target.value)} displayEmpty>
                  <MenuItem value="" sx={{ fontSize: 11 }}>Select branch...</MenuItem>
                  {branches.map(b => <MenuItem key={b.name} value={b.name} sx={{ fontSize: 11 }}>{b.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Typography variant="caption" sx={{ alignSelf: 'center' }}>→</Typography>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Select value={compareBranchB} onChange={(e) => setCompareBranchB(e.target.value)} displayEmpty>
                  <MenuItem value="" sx={{ fontSize: 11 }}>Select branch...</MenuItem>
                  {branches.map(b => <MenuItem key={b.name} value={b.name} sx={{ fontSize: 11 }}>{b.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Button size="small" variant="contained" onClick={handleBranchCompare} disabled={!compareBranchA || !compareBranchB || compareBranchA === compareBranchB}>Compare</Button>
            </Box>
          </>
        )}

        {/* ─── DAG Graph ─── */}
        {vcsPanelView === 'graph' && (
          <>
            {graphNodes.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>No commits to display.</Typography>}
            {graphNodes.length > 0 && (
              <Box sx={{ height: 480, width: '100%' }}>
                <DagGraph
                  nodes={graphNodes}
                  edges={vcsGraphEdges}
                  onNodeClick={(node) => {
                    setVcsPanelView('diff')
                    handleDiff(node.parents?.[0] || undefined, node.id)
                  }}
                />
              </Box>
            )}
          </>
        )}

        {/* ─── Merge ─── */}
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
          </>
        )}

        {/* ─── Diff ─── */}
        {vcsPanelView === 'diff' && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
              <Button size="small" variant={diffRangeMode ? 'outlined' : 'contained'} onClick={() => { setDiffRangeMode(false); handleDiff() }}>Latest Diff</Button>
              <Button size="small" variant={diffRangeMode ? 'contained' : 'outlined'} onClick={() => setDiffRangeMode(!diffRangeMode)}>Range Diff</Button>
              <Button size="small" variant={diffSideBySide ? 'contained' : 'outlined'} onClick={() => setDiffSideBySide(!diffSideBySide)}>{diffSideBySide ? 'Side-by-Side' : 'Inline'}</Button>
            </Box>
            {diffRangeMode && (
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <Select value={diffFromId} onChange={(e) => setDiffFromId(e.target.value)} displayEmpty>
                    <MenuItem value="" sx={{ fontSize: 11 }}>From commit...</MenuItem>
                    {commits.map(c => <MenuItem key={c.id} value={c.id} sx={{ fontSize: 11 }}>{c.id.slice(0,7)} — {c.message.slice(0,30)}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <Select value={diffToId} onChange={(e) => setDiffToId(e.target.value)} displayEmpty>
                    <MenuItem value="" sx={{ fontSize: 11 }}>To commit...</MenuItem>
                    {commits.map(c => <MenuItem key={c.id} value={c.id} sx={{ fontSize: 11 }}>{c.id.slice(0,7)} — {c.message.slice(0,30)}</MenuItem>)}
                  </Select>
                </FormControl>
                <Button size="small" variant="contained" onClick={() => handleDiff(diffFromId || undefined, diffToId || undefined)} disabled={!diffFromId || !diffToId}>Diff</Button>
              </Box>
            )}
            {diffData ? (diffSideBySide ? (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Box sx={{ flex: 1 }}><Typography variant="caption" fontWeight={600}>Before</Typography>{diffData.fromContent.split('\n').map((l: string, i: number) => <Box key={i} sx={{ fontSize: 10, fontFamily: 'monospace', px: 0.5, bgcolor: 'action.hover' }}>{l}</Box>)}</Box>
                <Box sx={{ flex: 1 }}><Typography variant="caption" fontWeight={600}>After</Typography>{diffData.toContent.split('\n').map((l: string, i: number) => <Box key={i} sx={{ fontSize: 10, fontFamily: 'monospace', px: 0.5 }}>{l}</Box>)}</Box>
              </Box>
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>{diffData.from} → {diffData.to}</Typography>
                {diffData.changes.length === 0 && <Typography variant="caption" color="text.secondary">No differences.</Typography>}
                {diffData.changes.map((c: { type: string; line: number; content: string }, i: number) => (
                  <Box key={i} sx={{ fontSize: 10, fontFamily: 'monospace', px: 0.5, bgcolor: c.type === 'add' ? 'success.dark' : c.type === 'delete' ? 'error.dark' : 'transparent', color: c.type !== 'normal' ? 'white' : 'text.primary' }}>
                    {c.type === 'add' ? '+' : c.type === 'delete' ? '-' : ' '} {c.content}
                  </Box>
                ))}
              </Box>
            )) : <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>Make a commit first, then view the diff here.</Typography>}
          </>
        )}

        {/* ─── Tags ─── */}
        {vcsPanelView === 'tags' && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
              <TextField size="small" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Tag name..." sx={{ flex: 1 }} />
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

        {/* ─── Stash ─── */}
        {vcsPanelView === 'stash' && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField size="small" value={stashMsg} onChange={(e) => setStashMsg(e.target.value)} placeholder="Stash message (optional)" sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }} />
              <Button size="small" variant="contained" onClick={handleStashPush}>Stash</Button>
              <Button size="small" variant="outlined" onClick={handleStashPop}>Pop</Button>
            </Box>
            {vcsStashList.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>No stashed changes.</Typography>}
            <List dense>{vcsStashList.map((s) => (
              <ListItem key={s.id} secondaryAction={<Box sx={{ display: 'flex', gap: 0.25 }}>
                <Button size="small" onClick={() => handleStashApply(s.id)} sx={{ fontSize: 9 }}>Apply</Button>
                <IconButton size="small" color="error" onClick={() => handleStashDrop(s.id)}><DeleteIcon sx={{ fontSize: 12 }} /></IconButton>
              </Box>}>
                <ListItemText primary={s.message} secondary={`${s.branch} · ${formatTime(s.timestamp)}`} primaryTypographyProps={{ fontSize: 11 }} secondaryTypographyProps={{ fontSize: 9 }} />
              </ListItem>
            ))}</List>
          </>
        )}

        {/* ─── Blame ─── */}
        {vcsPanelView === 'blame' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Per-line: which commit last changed this line</Typography>
            {vcsBlameData.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>Commit some content first to see blame data.</Typography>}
            <Box sx={{ fontFamily: 'monospace', fontSize: 10 }}>
              {vcsBlameData.slice(0, 50).map((b) => (
                <Box key={b.line} sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', py: 0.25 }}>
                  <Typography variant="caption" sx={{ minWidth: 28, color: 'text.secondary', fontSize: 9 }}>{b.line}</Typography>
                  <Tooltip title={`${b.commitId} · ${b.author} · ${b.date} · ${b.message}`}>
                    <Chip label={b.commitId.slice(0, 7)} size="small" variant="outlined" sx={{ fontSize: 7, height: 14, minWidth: 48, mr: 0.5 }} />
                  </Tooltip>
                  <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: 10 }}>{b.text}</Typography>
                </Box>
              ))}
              {vcsBlameData.length > 50 && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 1 }}>Showing first 50 of {vcsBlameData.length} lines</Typography>}
            </Box>
          </>
        )}

        {/* ─── Rebase ─── */}
        {vcsPanelView === 'rebase' && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1, alignItems: 'center' }}>
              <Typography variant="caption" fontWeight={600}>Interactive Rebase</Typography>
              <Button size="small" variant={vcsRebaseMode ? 'contained' : 'outlined'} onClick={() => { setVcsRebaseMode(!vcsRebaseMode); setVcsRebaseSelectedIds([]) }}>{vcsRebaseMode ? 'Cancel' : 'Start'}</Button>
            </Box>

            {vcsRebaseMode && (
              <>
                <Alert severity="info" sx={{ mb: 1, py: 0, '& .MuiAlert-message': { fontSize: 10 } }}>
                  Select commits in Log tab, then Squash or Reorder here.
                </Alert>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Selected: {vcsRebaseSelectedIds.length} commit(s)
                </Typography>

                {/* Squash */}
                {vcsRebaseSelectedIds.length >= 2 && (
                  <Box sx={{ mb: 1.5, p: 1, borderRadius: 1, border: 1, borderColor: 'primary.main' }}>
                    <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>Squash {vcsRebaseSelectedIds.length} commits</Typography>
                    <TextField size="small" fullWidth value={squashMsg} onChange={(e) => setSquashMsg(e.target.value)} placeholder="Squash message..." sx={{ mb: 0.5, '& .MuiInputBase-input': { fontSize: 11 } }} />
                    <Button size="small" variant="contained" onClick={handleRebaseSquash}>Squash</Button>
                  </Box>
                )}

                {/* Reorder */}
                {vcsRebaseSelectedIds.length >= 2 && (
                  <Box sx={{ mb: 1.5, p: 1, borderRadius: 1, border: 1, borderColor: 'secondary.main' }}>
                    <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>Reorder selected commits</Typography>
                    {vcsRebaseSelectedIds.map((id, i) => (
                      <Box key={id} sx={{ display: 'flex', gap: 0.5, mb: 0.25, alignItems: 'center' }}>
                        <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary', minWidth: 16 }}>{i + 1}.</Typography>
                        <Chip label={id.slice(0, 7)} size="small" sx={{ fontSize: 8, height: 14 }} />
                        <IconButton size="small" onClick={() => {
                          if (i > 0) { const ids = [...vcsRebaseSelectedIds]; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; setVcsRebaseSelectedIds(ids) }
                        }} disabled={i === 0}><Typography variant="caption" sx={{ fontSize: 10 }}>↑</Typography></IconButton>
                        <IconButton size="small" onClick={() => {
                          if (i < vcsRebaseSelectedIds.length - 1) { const ids = [...vcsRebaseSelectedIds]; [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]]; setVcsRebaseSelectedIds(ids) }
                        }} disabled={i === vcsRebaseSelectedIds.length - 1}><Typography variant="caption" sx={{ fontSize: 10 }}>↓</Typography></IconButton>
                      </Box>
                    ))}
                    <Button size="small" variant="contained" onClick={handleRebaseReorder} sx={{ mt: 0.5 }}>Apply Order</Button>
                  </Box>
                )}

                {/* Edit message */}
                <Box sx={{ p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>Edit commit message</Typography>
                  <TextField size="small" value={editCommitId} onChange={(e) => setEditCommitId(e.target.value)} placeholder="Commit ID" sx={{ mb: 0.5, '& .MuiInputBase-input': { fontSize: 11 } }} />
                  <TextField size="small" value={editCommitMsg} onChange={(e) => setEditCommitMsg(e.target.value)} placeholder="New message..." sx={{ mb: 0.5, '& .MuiInputBase-input': { fontSize: 11 } }} />
                  <Button size="small" variant="outlined" onClick={handleRebaseEdit}>Edit Message</Button>
                </Box>
              </>
            )}

            {!vcsRebaseMode && (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 3 }}>
                Click "Start" to enter rebase mode, then select commits from the Log tab.
              </Typography>
            )}
          </>
        )}

        {/* ─── Patches ─── */}
        {vcsPanelView === 'patches' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Export or import unified diff patches for email-based collaboration</Typography>
            <Box sx={{ mb: 2, p: 1, borderRadius: 1, border: 1, borderColor: 'primary.main' }}>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>Export Patch</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                <TextField size="small" value={patchFromId} onChange={(e) => setPatchFromId(e.target.value)} placeholder="From commit ID" sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }} />
                <TextField size="small" value={patchToId} onChange={(e) => setPatchToId(e.target.value)} placeholder="To commit ID" sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 11 } }} />
              </Box>
              <Button size="small" variant="contained" onClick={handleExportPatch}>Export .patch File</Button>
            </Box>

            <Box sx={{ p: 1, borderRadius: 1, border: 1, borderColor: 'secondary.main' }}>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>Import Patch</Typography>
              <TextField multiline rows={4} size="small" value={importPatchText} onChange={(e) => setImportPatchText(e.target.value)} placeholder="Paste patch content here..." sx={{ mb: 0.5, '& .MuiInputBase-input': { fontSize: 10, fontFamily: 'monospace' } }} />
              <Button size="small" variant="contained" onClick={handleImportPatch} disabled={!importPatchText.trim()}>Apply Patch</Button>
            </Box>
          </>
        )}

        {/* ─── Hooks ─── */}
        {vcsPanelView === 'hooks' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>VCS hooks and branch protection rules</Typography>
            <FormControlLabel control={<Switch checked={vcsHooks.preCommitLint} onChange={(e) => setVcsHooks({ ...vcsHooks, preCommitLint: e.target.checked })} />} label={<Typography variant="caption">Pre-commit lint check</Typography>} />
            <FormControlLabel control={<Switch checked={vcsHooks.requireCommitMessage} onChange={(e) => setVcsHooks({ ...vcsHooks, requireCommitMessage: e.target.checked })} />} label={<Typography variant="caption">Require commit message</Typography>} />

            <Typography variant="caption" fontWeight={600} sx={{ mt: 1, mb: 0.5, display: 'block' }}>Commit Message Template</Typography>
            <TextField size="small" fullWidth value={hookTemplate} onChange={(e) => setHookTemplate(e.target.value)} placeholder="e.g. feat: | fix: | docs:" sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: 11 } }} />

            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>Protected Branches (comma-separated)</Typography>
            <TextField size="small" fullWidth value={protectedBranches} onChange={(e) => setProtectedBranches(e.target.value)} placeholder="main, release" sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: 11 } }} />

            {vcsHooks.protectedBranches.length > 0 && (
              <Box sx={{ mb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {vcsHooks.protectedBranches.map((b) => (
                  <Chip key={b} label={b} size="small" color="warning" variant="outlined" sx={{ fontSize: 9, height: 18 }} />
                ))}
              </Box>
            )}

            <Button size="small" variant="contained" onClick={handleSaveHooks}>Save Hooks</Button>
          </>
        )}

        {/* v0.4.8: Advanced Merge Strategies */}
        {vcsPanelView === 'merge-strategies' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
              Advanced merge with strategy selection
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                Merge Strategy
              </Typography>
              <FormControl fullWidth size="small">
                <Select value={mergeStrategy} onChange={(e) => setMergeStrategy(e.target.value as any)}>
                  <MenuItem value="recursive">Recursive (Three-way)</MenuItem>
                  <MenuItem value="resolve">Resolve (Auto-resolve)</MenuItem>
                  <MenuItem value="ours">Ours (Keep current)</MenuItem>
                  <MenuItem value="theirs">Theirs (Accept incoming)</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                Source Branch
              </Typography>
              <FormControl fullWidth size="small">
                <Select value={mergeBranch} onChange={(e) => setMergeBranch(e.target.value)} displayEmpty>
                  <MenuItem value="">Select branch...</MenuItem>
                  {branches.filter((b) => !b.current).map((b) => (
                    <MenuItem key={b.name} value={b.name}>{b.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Button
              fullWidth
              variant="contained"
              onClick={handleMerge}
              disabled={!mergeBranch}
              sx={{ mb: 2 }}
            >
              Merge with {mergeStrategy} Strategy
            </Button>

            {threeWayMergeDiff.conflicts.length > 0 && (
              <Box>
                <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                  Merge Preview
                </Typography>
                <ThreeWayMergeViewer
                  base={threeWayMergeDiff.base}
                  ours={threeWayMergeDiff.ours}
                  theirs={threeWayMergeDiff.theirs}
                  conflicts={threeWayMergeDiff.conflicts}
                />
              </Box>
            )}
          </>
        )}

        {/* v0.4.8: Branch Protection */}
        {vcsPanelView === 'branch-protection' && (
          <BranchProtectionPanel
            branches={branches}
            protections={branchProtections}
            onSetProtection={async (branchName, protection) => {
              try {
                await window.wordapp?.vcs.setBranchProtection(branchName, protection)
                setBranchProtections([...branchProtections.filter(p => p.branch !== branchName), { branch: branchName, ...protection }])
                useAppStore.getState().addToast('success', `Protected ${branchName}`)
              } catch (err) {
                useAppStore.getState().addToast('error', `Failed to set protection: ${(err as Error).message}`)
              }
            }}
            onRemoveProtection={async (branchName) => {
              try {
                await window.wordapp?.vcs.removeBranchProtection(branchName)
                setBranchProtections(branchProtections.filter(p => p.branch !== branchName))
                useAppStore.getState().addToast('success', `Removed protection from ${branchName}`)
              } catch (err) {
                useAppStore.getState().addToast('error', `Failed to remove protection: ${(err as Error).message}`)
              }
            }}
          />
        )}

        {/* v0.4.8: Merge Requests */}
        {vcsPanelView === 'merge-requests' && (
          <MergeStatusPanel
            currentBranch={currentBranch}
            branches={branches}
            mergeRequests={mergeRequests}
            onCreateMR={async (sourceBranch, targetBranch, title, description) => {
              try {
                await window.wordapp?.vcs.createMergeRequest(sourceBranch, targetBranch, title, description, 'current-user')
                useAppStore.getState().addToast('success', 'Merge request created')
              } catch (err) {
                useAppStore.getState().addToast('error', `Failed to create MR: ${(err as Error).message}`)
              }
            }}
            onApproveMR={async (mrId, reviewer) => {
              try {
                await window.wordapp?.vcs.approveMergeRequest(mrId, reviewer)
                useAppStore.getState().addToast('success', 'Merge request approved')
              } catch (err) {
                useAppStore.getState().addToast('error', `Failed to approve MR: ${(err as Error).message}`)
              }
            }}
            onRejectMR={async (mrId, reviewer, comment) => {
              try {
                await window.wordapp?.vcs.rejectMergeRequest(mrId, reviewer, comment)
                useAppStore.getState().addToast('warning', 'Changes requested on merge request')
              } catch (err) {
                useAppStore.getState().addToast('error', `Failed to reject MR: ${(err as Error).message}`)
              }
            }}
            onMergeMR={async (mrId) => {
              try {
                await window.wordapp?.vcs.mergeMergeRequest(mrId)
                useAppStore.getState().addToast('success', 'Merge request merged')
              } catch (err) {
                useAppStore.getState().addToast('error', `Failed to merge MR: ${(err as Error).message}`)
              }
            }}
            onCloseMR={async (mrId) => {
              try {
                await window.wordapp?.vcs.closeMergeRequest(mrId)
                useAppStore.getState().addToast('success', 'Merge request closed')
              } catch (err) {
                useAppStore.getState().addToast('error', `Failed to close MR: ${(err as Error).message}`)
              }
            }}
          />
        )}
      </Box>
    </SidePanel>
  )
}
