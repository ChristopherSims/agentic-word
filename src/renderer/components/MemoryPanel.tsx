import React, { useState, useEffect } from 'react'
import { Box, Typography, Chip, IconButton, Card, CardContent, Button, TextField, Select, MenuItem, FormControl, Switch, Tooltip } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import { useAppStore } from '../store/app-store'
import { ContextInspector } from './ContextInspector'
import type { AgentMemoryEntry, MemoryStatus } from '../../shared/types'

const TYPE_COLORS: Record<string, string> = {
  fact: '#89b4fa',
  preference: '#f9e2af',
  decision: '#a6e3a1',
  correction: '#f38ba8',
  summary: '#cba6f7',
}

// §F: honest status labels so an enabled toggle is never presented as a
// running worker, and a consent block is never presented as a failure.
const STATUS_LABEL: Record<MemoryStatus['state'], string> = {
  'disabled-by-user': 'off',
  'blocked-by-consent': 'blocked by consent',
  'unavailable-runtime': 'runtime unavailable',
  'pending-maintenance': 'cleanup pending',
  rebuilding: 'rebuilding',
  ready: 'ready',
  failed: 'failed'
}

const STATUS_COLOR: Record<MemoryStatus['state'], string> = {
  'disabled-by-user': 'var(--text-secondary)',
  'blocked-by-consent': '#f9e2af',
  'unavailable-runtime': '#f9e2af',
  'pending-maintenance': '#f9e2af',
  rebuilding: '#89b4fa',
  ready: '#a6e3a1',
  failed: '#f38ba8'
}

type MemoryView = 'all' | 'review' | 'approved' | 'archived'

export function MemoryPanel({ documentId }: { documentId?: string }) {
  // Pinned identity (popup) or live active document (workspace tab) — §10.2
  const liveDocId = useAppStore(s => s.getActiveDocumentId())
  const docId = documentId ?? liveDocId
  const addToast = useAppStore(s => s.addToast)
  const toggleDocumentProtection = useAppStore(s => s.toggleDocumentProtection)
  // The revision bump in the selector makes the localStorage-backed flag
  // re-evaluate whenever protection changes anywhere (§11).
  const isProtected = useAppStore(s => s.protectedRevision >= 0 && s.isDocumentProtected(documentId ?? undefined))
  const [entries, setEntries] = useState<AgentMemoryEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [template, setTemplate] = useState('')
  const [mnesisEnabled, setMnesisEnabled] = useState(false)
  const [mnesisRunning, setMnesisRunning] = useState(false)
  const [mnesisError, setMnesisError] = useState<string | null>(null)
  // §F honest status: distinguishes disabled-by-user, blocked-by-consent,
  // pending-maintenance, rebuilding, ready, unavailable and failed.
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | null>(null)
  const [view, setView] = useState<MemoryView>('all')
  // §11 honest limits: shown after a full forget so the user knows what a
  // forget does NOT erase.
  const [forgetNotice, setForgetNotice] = useState(false)

  useEffect(() => {
    // Experimental conversation-context sidecar (memory.md Phase 1) — off by default
    window.wordapp?.agent.mnesisStatus().then((s) => {
      if (s) {
        setMnesisEnabled(s.enabled)
        setMnesisRunning(s.running)
        setMnesisError(s.error)
      }
    })
    // Optional so older preload builds / test doubles without the API still work.
    const statusPromise = window.wordapp?.agent?.memoryStatus?.()
    if (statusPromise) {
      statusPromise.then((s) => { if (s) setMemoryStatus(s) }).catch(() => {})
    }
  }, [])

  const handleToggleMnesis = async (enabled: boolean) => {
    setMnesisEnabled(enabled)
    const result = await window.wordapp?.agent.mnesisSetEnabled(enabled)
    if (result) {
      setMnesisRunning(result.running)
      setMnesisError(result.error)
    }
    const statusPromise = window.wordapp?.agent?.memoryStatus?.()
    if (statusPromise) {
      statusPromise.then((s) => { if (s) setMemoryStatus(s) }).catch(() => {})
    }
    addToast(
      'info',
      enabled
        ? 'Conversation context engine enabled — turns are recorded once the Python worker is available'
        : 'Conversation context engine disabled'
    )
  }
  const pendingCount = entries.filter(e => e.approvalState === 'candidate').length
  const approvedCount = entries.filter(e => !e.approvalState || e.approvalState === 'approved').length
  const rejectedCount = entries.filter(e => e.approvalState === 'rejected' || e.approvalState === 'superseded').length

  // §10.2 views: All / Suggestions (candidates) / Approved / Archived
  const visibleEntries = view === 'all' ? entries : entries.filter((e) => {
    if (view === 'review') return e.approvalState === 'candidate'
    if (view === 'approved') return !e.approvalState || e.approvalState === 'approved'
    return e.approvalState === 'rejected' || e.approvalState === 'superseded'
  })

  /**
   * §11 "Stop using this memory": revoke an active entry so it leaves prompts
   * and retrieval, but keep the record visible in Archived for review —
   * distinct from handleDelete, which removes the stored evidence entirely.
   */
  const handleForget = async (id: string) => {
    await window.wordapp?.agent.memorySetApproval(id, 'rejected')
    loadMemory()
    addToast('success', 'Memory revoked — no longer used, kept in Archived')
  }

  const loadMemory = async () => {
    const result = await window.wordapp?.agent.memoryGet(docId)
    if (result) setEntries(result as AgentMemoryEntry[])
  }

  const handleSetApproval = async (id: string, state: 'approved' | 'rejected') => {
    await window.wordapp?.agent.memorySetApproval(id, state)
    loadMemory()
    addToast('success', state === 'approved' ? 'Memory approved — now included in prompts' : 'Memory rejected')
  }

  useEffect(() => { loadMemory() }, [docId])

  // Legacy records quarantined during migration (memory.md §12 step 5)
  const [quarantine, setQuarantine] = useState<Array<{ key: string; reason: string; originKey: string | null; record: Record<string, unknown> }>>([])
  const loadQuarantine = async () => {
    const result = await window.wordapp?.agent.memoryQuarantine()
    if (result) setQuarantine(result)
  }
  useEffect(() => { loadQuarantine() }, [])

  const handleResolveQuarantine = async (key: string, action: 'keep' | 'discard') => {
    await window.wordapp?.agent.memoryQuarantineResolve(key, action, docId ?? undefined)
    loadQuarantine()
    loadMemory()
    addToast(
      'info',
      action === 'keep'
        ? 'Quarantined memory imported as a suggestion for review'
        : 'Quarantined memory discarded'
    )
  }

  const handleDelete = async (id: string) => {
    await window.wordapp?.agent.memoryDelete(id)
    loadMemory()
    addToast('success', 'Memory entry deleted')
  }

  /**
   * Full §11 forget flow: ledger cascade + derived summaries, anti-re-learning
   * block, and Mnesis projection disposal/rebuild. Distinct from the archived
   * revoke above and from a bare ledger delete — the honest-limits notice is
   * shown afterwards so the user knows exactly what was and was not erased.
   */
  const handleForgetFully = async (id: string) => {
    const result = await window.wordapp?.agent.memoryForget(id)
    loadMemory()
    if (!result || result.state === 'failed') {
      addToast('error', 'Forget failed — the durable commit did not complete')
      return
    }
    const parts = [`Forgotten: ${result.removedIds.length} entr${result.removedIds.length === 1 ? 'y' : 'ies'} (incl. derived summaries)`]
    if (result.state === 'pending') {
      parts.push('cleanup still pending — affected history stays unavailable until it completes')
      addToast('warning', parts.join(' — '))
    } else {
      if (result.projectionDisposed) parts.push('conversation projection purged and rebuilt')
      parts.push('automatic re-learning blocked')
      addToast('success', parts.join(' — '))
    }
    setForgetNotice(true)
  }

  const handleClearAll = async () => {
    await window.wordapp?.agent.memoryClear(docId)
    setEntries([])
    addToast('success', 'All memory cleared')
  }

  const handleStartEdit = (entry: AgentMemoryEntry) => {
    setEditingId(entry.id)
    setEditContent(entry.content)
  }

  const handleSaveEdit = async () => {
    if (editingId) {
      await window.wordapp?.agent.memoryUpdate(editingId, editContent)
      setEditingId(null)
      setEditContent('')
      loadMemory()
      addToast('success', 'Memory entry updated')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleConsolidate = async () => {
    if (isProtected) return // §11: no persistence for protected documents
    const result = await window.wordapp?.agent.memoryConsolidate(docId)
    if (result) {
      const r = result as { consolidated: number; summary: string }
      if (r.consolidated > 0) {
        addToast('success', `Consolidated ${r.consolidated} entries`)
        loadMemory()
      } else {
        addToast('info', r.summary || 'Nothing to consolidate')
      }
    }
  }

  const handleApplyTemplate = async () => {
    if (!template) return
    if (isProtected) return // §11: no persistence for protected documents
    const result = await window.wordapp?.agent.memoryTemplate(docId, template)
    if (result) {
      const r = result as { success: boolean; count: number }
      if (r.count > 0) {
        addToast('success', `Applied ${r.count} memory entries from template`)
        setTemplate('')
        loadMemory()
      }
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" sx={{ mr: 'auto', fontWeight: 600 }}>
          Agent Memory ({approvedCount})
          {pendingCount > 0 && (
            <Typography component="span" variant="caption" sx={{ ml: 0.5, color: '#f9e2af' }}>
              · {pendingCount} to review
            </Typography>
          )}
          {rejectedCount > 0 && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              · {rejectedCount} archived
            </Typography>
          )}
        </Typography>
        {entries.length > 20 && (
          <Button size="small" variant="outlined" onClick={handleConsolidate} sx={{ fontSize: 12, mr: 0.5 }}>Consolidate</Button>
        )}
        {entries.length > 0 && (
          <Button size="small" color="error" onClick={handleClearAll} sx={{ fontSize: 12 }}>Clear All</Button>
        )}
      </Box>

      {entries.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
          {([
            ['all', `All (${entries.length})`],
            ['review', `Suggestions (${pendingCount})`],
            ['approved', `Approved (${approvedCount})`],
            ['archived', `Archived (${rejectedCount})`]
          ] as Array<[MemoryView, string]>).map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              size="small"
              onClick={() => setView(key)}
              sx={{
                height: 18,
                fontSize: 12,
                cursor: 'pointer',
                bgcolor: view === key ? 'var(--accent)' : 'var(--bg-surface)',
                color: view === key ? '#fff' : 'var(--text-secondary)'
              }}
            />
          ))}
        </Box>
      )}

      {forgetNotice && (
        <Card variant="outlined" sx={{ mt: 1, mb: 1, bgcolor: 'var(--bg-surface)', borderColor: 'var(--warning)' }}>
          <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
            <Typography variant="caption" sx={{ fontSize: 12, display: 'block', color: 'var(--warning)' }}>
              What "forget" did and did not erase (§11)
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 12, display: 'block', whiteSpace: 'pre-wrap', mt: 0.25 }}>
              The memory ledger entry, its derived summaries, automatic re-learning, and this
              document's conversation projection were purged (projection rebuilt without it).
              NOT erased: the document text itself, version-control history, backups or exported
              bundles you created, and anything a remote AI provider may have retained from
              earlier requests. Re-learning stays blocked until you save the same preference
              again explicitly.
            </Typography>
            <Button size="small" sx={{ fontSize: 12, mt: 0.5, p: '2px 8px' }} onClick={() => setForgetNotice(false)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      {entries.length === 0 ? (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 2 }}>
            No memories yet. The agent saves preferences, decisions, and facts as you chat.
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
            <FormControl size="small" fullWidth>
              <Select
                value={template}
                displayEmpty
                onChange={(e) => setTemplate(e.target.value)}
                sx={{ fontSize: 12, height: 28 }}
              >
                <MenuItem value="" sx={{ fontSize: 12 }}>Apply template...</MenuItem>
                <MenuItem value="novel" sx={{ fontSize: 12 }}>Novel</MenuItem>
                <MenuItem value="research" sx={{ fontSize: 12 }}>Research Paper</MenuItem>
                <MenuItem value="blog" sx={{ fontSize: 12 }}>Blog Post</MenuItem>
              </Select>
            </FormControl>
            <Button size="small" variant="contained" disabled={!template} onClick={handleApplyTemplate} sx={{ fontSize: 12, height: 28 }}>Apply</Button>
          </Box>
        </>
      ) : visibleEntries.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 2 }}>
          No entries in this view.
        </Typography>
      ) : (
        visibleEntries.map(entry => (
          <Card key={entry.id} variant="outlined" sx={{ mb: 0.5 }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <Chip label={entry.type} size="small" sx={{ height: 20, fontSize: 12, bgcolor: TYPE_COLORS[entry.type] || 'var(--bg-surface)', color: '#000' }} />
                {entry.scope === 'global' && (
                  <Chip label="G" size="small" sx={{ height: 20, fontSize: 12, bgcolor: 'var(--accent)', color: '#fff', minWidth: 16 }} />
                )}
                {entry.approvalState === 'candidate' && (
                  <Chip label="needs review" size="small" sx={{ height: 20, fontSize: 12, bgcolor: '#f9e2af', color: '#000' }} />
                )}
                {(entry.approvalState === 'rejected' || entry.approvalState === 'superseded') && (
                  <Chip label={entry.approvalState} size="small" sx={{ height: 20, fontSize: 12, bgcolor: 'var(--bg-surface)', color: 'var(--text-secondary)' }} />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>{entry.agentName}</Typography>
                {editingId !== entry.id && entry.approvalState === 'candidate' && (
                  <>
                    <IconButton size="small" color="success" sx={{ p: 0.25 }} onClick={() => handleSetApproval(entry.id, 'approved')}>
                      <CheckIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                    <IconButton size="small" color="error" sx={{ p: 0.25 }} onClick={() => handleSetApproval(entry.id, 'rejected')}>
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </>
                )}
                {editingId !== entry.id && (
                  <>
                    {(!entry.approvalState || entry.approvalState === 'approved') && (
                      <Tooltip title="Stop using this memory — revoked from prompts, kept in Archived. Delete removes it entirely.">
                        <IconButton size="small" sx={{ ml: 'auto', p: 0.25 }} onClick={() => handleForget(entry.id)}>
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <IconButton size="small" sx={{ p: 0.25, ml: (!entry.approvalState || entry.approvalState === 'approved') ? 0 : 'auto' }} onClick={() => handleStartEdit(entry)}>
                      <EditIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                    <Tooltip title="Forget (§11) — removes this memory, its derived summaries, and blocks automatic re-learning; purges the conversation projection. Shows what a forget cannot erase.">
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => handleForgetFully(entry.id)}>
                        <DeleteIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Box>
              {editingId === entry.id ? (
                <Box sx={{ mt: 0.5 }}>
                  <TextField fullWidth size="small" multiline value={editContent} onChange={(e) => setEditContent(e.target.value)} sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                    <IconButton size="small" color="success" onClick={handleSaveEdit} sx={{ p: 0.25 }}><CheckIcon sx={{ fontSize: 14 }} /></IconButton>
                    <IconButton size="small" onClick={handleCancelEdit} sx={{ p: 0.25 }}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
                  </Box>
                </Box>
              ) : (
                <Typography variant="caption" sx={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.4, opacity: entry.approvalState === 'rejected' || entry.approvalState === 'superseded' ? 0.5 : 1 }}>{entry.content}</Typography>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* §11 protected documents: ephemeral mode toggle for this document */}
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1.5, pt: 1, borderTop: '1px solid var(--border)' }}>
        <Tooltip title="Protected documents run in ephemeral mode: no memory is saved or injected, chat turns are not recorded to the context engine, and the document is never persistently indexed. Conversation still works — nothing about it is remembered.">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Switch size="small" checked={isProtected} onChange={() => toggleDocumentProtection(docId)} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
              Protected document (ephemeral mode)
            </Typography>
          </Box>
        </Tooltip>
        {isProtected && (
          <Chip label="no persistence" size="small" sx={{ ml: 'auto', height: 20, fontSize: 12, bgcolor: '#f38ba8', color: '#000' }} />
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1.5, pt: 1, borderTop: '1px solid var(--border)' }}>
        <Tooltip title="Experimental: a Python sidecar (Mnesis) records chat turns and compacts long conversation context. Requires Python 3.12+ with the mnesis package. Off by default; the app works normally without it.">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Switch size="small" checked={mnesisEnabled} onChange={(e) => handleToggleMnesis(e.target.checked)} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
              Conversation context engine (experimental)
            </Typography>
          </Box>
        </Tooltip>
        {memoryStatus ? (
          <Tooltip title={memoryStatus.detail}>
            <Typography variant="caption" sx={{ ml: 'auto', fontSize: 12, color: STATUS_COLOR[memoryStatus.state] }}>
              {STATUS_LABEL[memoryStatus.state]}
            </Typography>
          </Tooltip>
        ) : mnesisEnabled ? (
          <Typography
            variant="caption"
            sx={{ ml: 'auto', fontSize: 12, color: mnesisRunning ? 'var(--text-secondary)' : mnesisError ? '#f38ba8' : '#f9e2af' }}
          >
            {mnesisRunning ? 'worker active' : mnesisError || 'worker not detected'}
          </Typography>
        ) : null}
      </Box>

      {quarantine.length > 0 && (
        <Box sx={{ mt: 1, p: 0.5, border: '1px solid var(--ui-warning)', borderRadius: 0.75 }}>
          <Typography variant="caption" sx={{ fontSize: 12, display: 'block', fontWeight: 600 }}>
            Quarantined legacy memory ({quarantine.length}) — review required
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block', mb: 0.5 }}>
            These records came from an older memory format and couldn't be matched to a document. Keep imports one as a suggestion for the current document; discard removes it permanently.
          </Typography>
          {quarantine.map((q) => (
            <Box key={q.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              <Chip
                label={q.reason === 'default-key' ? 'default' : q.reason === 'missing-key' ? 'no link' : 'unknown key'}
                size="small"
                sx={{ height: 14, fontSize: 7, bgcolor: '#f9e2af', color: '#000' }}
              />
              <Typography variant="caption" sx={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(q.record.content ?? q.record.id ?? q.key)}
              </Typography>
              <Tooltip title={`Import as a suggestion for ${docId ?? 'this document'} (still requires review before use)`}>
                <IconButton size="small" color="success" sx={{ p: 0.25 }} onClick={() => handleResolveQuarantine(q.key, 'keep')}>
                  <CheckIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove this quarantined record permanently">
                <IconButton size="small" color="error" sx={{ p: 0.25 }} onClick={() => handleResolveQuarantine(q.key, 'discard')}>
                  <DeleteIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}

      {/* §12 steps 7/9/12: legacy-session migration tools */}
      <MigrationTools />

      {/* §10.3: per-run "Context used" accounting (collapsible) */}
      <ContextInspector documentId={docId} />
    </Box>
  )
}

// ─── Migration tools (§12 steps 7, 9, 12) ───

const MigrationTools: React.FC = () => {
  const addToast = useAppStore(s => s.addToast)
  const [backups, setBackups] = useState<Array<{ name: string; createdAt: number }>>([])
  const [busy, setBusy] = useState(false)
  const [legacyPlan, setLegacyPlan] = useState<{
    available: boolean
    present: boolean
    attributable: Array<{ sessionId: string; agent: string | null }>
    anonymous: Array<{ sessionId: string; agent: string | null }>
  } | null>(null)

  const loadBackups = () => {
    window.wordapp?.agent.memoryBackups().then(setBackups)
  }
  useEffect(loadBackups, [])

  const migrateSessions = async () => {
    setBusy(true)
    const result = await window.wordapp?.agent.memoryMigrateSessions()
    setBusy(false)
    if (result) {
      addToast(
        'success',
        result.eventsAdded > 0
          ? `Imported ${result.eventsAdded} historical events from ${result.sessionsConsidered} sessions`
          : `Nothing new to import (${result.sessionsConsidered} sessions already covered)`
      )
    }
  }

  const rebuildProjections = async () => {
    setBusy(true)
    const result = await window.wordapp?.agent.memoryRebuildProjections()
    setBusy(false)
    if (result) {
      if (result.sidecarUnavailable) {
        addToast('warning', 'Context engine unavailable — enable it above (and consent for history retention) first')
      } else {
        addToast(
          'success',
          `Rebuilt ${result.documents} document projection(s), ${result.turnsReplayed} turns replayed` +
            (result.skipped.suppressed > 0 ? ` (${result.skipped.suppressed} suppressed events skipped — forgotten content stays forgotten)` : '')
        )
      }
    }
  }

  const removeBackup = async (name: string) => {
    if (!window.confirm(`Remove the migration backup "${name}" permanently? This cannot be undone. The backup stays until you remove it explicitly (§12 step 12).`)) return
    const result = await window.wordapp?.agent.memoryBackupRemove(name)
    if (result?.removed) {
      addToast('success', 'Migration backup removed')
      loadBackups()
    } else {
      addToast('error', 'Backup not found or not removable')
    }
  }

  // §D: the superseded shared context store. Detection/import/removal are all
  // explicit; nothing is imported or deleted automatically.
  const scanLegacy = async () => {
    setBusy(true)
    const plan = await window.wordapp?.agent.legacyMnesisPlan()
    setBusy(false)
    setLegacyPlan(plan ?? null)
  }

  const importLegacy = async () => {
    if (!legacyPlan) return
    if (!window.confirm(`Import history from ${legacyPlan.attributable.length} attributable legacy session(s) into the memory ledger? Existing items are not duplicated.`)) return
    setBusy(true)
    const result = await window.wordapp?.agent.migrateLegacyMnesisStore(true)
    setBusy(false)
    if (!result) return
    if (!result.available) addToast('warning', 'Context engine unavailable — enable it (and history consent) first')
    else addToast('success', result.importedEvents > 0
      ? `Imported ${result.importedEvents} events from ${result.migratedSessions} legacy session(s)`
      : 'Nothing new to import')
    scanLegacy()
  }

  const removeLegacy = async () => {
    if (!window.confirm('Permanently remove the legacy shared context store and its SQLite sidecar files? This cannot be undone. Existing migrated memory stays in the ledger.')) return
    setBusy(true)
    const result = await window.wordapp?.agent.retireLegacyMnesisStore(true)
    setBusy(false)
    if (result) {
      addToast('success', `Removed ${result.removed.length} legacy store file(s)`)
      scanLegacy()
    }
  }

  const purgeAnonymous = async () => {
    if (!legacyPlan || legacyPlan.anonymous.length === 0) return
    if (!window.confirm(`Permanently purge ${legacyPlan.anonymous.length} anonymous legacy session(s) whose owner cannot be determined? This cannot be undone.`)) return
    setBusy(true)
    const result = await window.wordapp?.agent.purgeLegacyAnonymousSessions(true)
    setBusy(false)
    if (!result) return
    if (!result.available) addToast('warning', 'Context engine unavailable — enable it (and history consent) first')
    else {
      addToast('success', `Purged ${result.purgedSessions} anonymous session(s)`)
      scanLegacy()
    }
  }

  return (
    <Box sx={{ mt: 1, p: 0.5, border: '1px solid var(--border)', borderRadius: 0.75 }}>
      <Typography variant="caption" sx={{ fontSize: 12, display: 'block', fontWeight: 600 }}>
        Legacy migration (§12)
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
        <Button size="small" variant="outlined" disabled={busy} onClick={migrateSessions} sx={{ fontSize: 12 }}>
          Import old chats as history
        </Button>
        <Button size="small" variant="outlined" disabled={busy} onClick={rebuildProjections} sx={{ fontSize: 12 }}>
          Rebuild context projections
        </Button>
      </Box>
      {backups.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block' }}>
            Migration backups ({backups.length}) — kept until you remove them explicitly:
          </Typography>
          {backups.map((b) => (
            <Box key={b.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.name}
              </Typography>
              <Tooltip title="Remove this backup permanently (explicit action, §12 step 12)">
                <IconButton size="small" color="error" sx={{ p: 0.25 }} onClick={() => removeBackup(b.name)}>
                  <DeleteIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ mt: 1, pt: 0.75, borderTop: '1px solid var(--border)' }}>
        <Typography variant="caption" sx={{ fontSize: 12, display: 'block', fontWeight: 600 }}>
          Legacy context store (§D)
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block', mt: 0.25 }}>
          The old shared context store. Detected items are never imported or removed automatically — no owner is guessed.
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" disabled={busy} onClick={scanLegacy} sx={{ fontSize: 12 }}>
            Scan legacy store
          </Button>
          {legacyPlan?.present && legacyPlan.available && (
            <Button
              size="small" variant="outlined" disabled={busy || legacyPlan.attributable.length === 0}
              onClick={importLegacy} sx={{ fontSize: 12 }}
            >
              Import attributable ({legacyPlan.attributable.length})
            </Button>
          )}
          {legacyPlan?.present && legacyPlan.available && (
            <Button
              size="small" color="warning" variant="outlined"
              disabled={busy || legacyPlan.anonymous.length === 0}
              onClick={purgeAnonymous} sx={{ fontSize: 12 }}
            >
              Purge anonymous ({legacyPlan.anonymous.length})
            </Button>
          )}
          {legacyPlan?.present && (
            <Button size="small" color="error" variant="outlined" disabled={busy} onClick={removeLegacy} sx={{ fontSize: 12 }}>
              Remove legacy store
            </Button>
          )}
        </Box>
        {legacyPlan && (
          legacyPlan.present
            ? legacyPlan.available
              ? (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block', mt: 0.25 }}>
                  {legacyPlan.attributable.length} attributable, {legacyPlan.anonymous.length} anonymous (review required)
                </Typography>
              )
              : (
                <Typography variant="caption" color="warning.main" sx={{ fontSize: 12, display: 'block', mt: 0.25 }}>
                  Context engine unavailable — enable it (and history consent) to migrate.
                </Typography>
              )
            : (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block', mt: 0.25 }}>
                No legacy store found.
              </Typography>
            )
        )}
      </Box>
    </Box>
  )
}