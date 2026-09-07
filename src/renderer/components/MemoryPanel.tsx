import { useState, useEffect } from 'react'
import { Box, Typography, Chip, IconButton, Card, CardContent, Button, TextField, Select, MenuItem, FormControl, Switch, Tooltip } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import { useAppStore } from '../store/app-store'
import { ContextInspector } from './ContextInspector'
import type { AgentMemoryEntry } from '../shared/types'

const TYPE_COLORS: Record<string, string> = {
  fact: '#89b4fa',
  preference: '#f9e2af',
  decision: '#a6e3a1',
  correction: '#f38ba8',
  summary: '#cba6f7',
}

type MemoryView = 'all' | 'review' | 'approved' | 'archived'

export function MemoryPanel({ documentId }: { documentId?: string }) {
  // Pinned identity (popup) or live active document (workspace tab) — §10.2
  const liveDocId = useAppStore(s => s.getActiveDocumentId())
  const docId = documentId ?? liveDocId
  const addToast = useAppStore(s => s.addToast)
  const [entries, setEntries] = useState<AgentMemoryEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [template, setTemplate] = useState('')
  const [mnesisEnabled, setMnesisEnabled] = useState(false)
  const [mnesisRunning, setMnesisRunning] = useState(false)
  const [mnesisError, setMnesisError] = useState<string | null>(null)
  const [view, setView] = useState<MemoryView>('all')

  useEffect(() => {
    // Experimental conversation-context sidecar (memory.md Phase 1) — off by default
    window.wordapp?.agent.mnesisStatus().then((s) => {
      if (s) {
        setMnesisEnabled(s.enabled)
        setMnesisRunning(s.running)
        setMnesisError(s.error)
      }
    })
  }, [])

  const handleToggleMnesis = async (enabled: boolean) => {
    setMnesisEnabled(enabled)
    const result = await window.wordapp?.agent.mnesisSetEnabled(enabled)
    if (result) {
      setMnesisRunning(result.running)
      setMnesisError(result.error)
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
        <Typography variant="caption" fontWeight={600} sx={{ mr: 'auto' }}>
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
          <Button size="small" variant="outlined" onClick={handleConsolidate} sx={{ fontSize: 9, mr: 0.5 }}>Consolidate</Button>
        )}
        {entries.length > 0 && (
          <Button size="small" color="error" onClick={handleClearAll} sx={{ fontSize: 9 }}>Clear All</Button>
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
                fontSize: 9,
                cursor: 'pointer',
                bgcolor: view === key ? 'var(--accent)' : 'var(--bg-surface)',
                color: view === key ? '#fff' : 'var(--text-secondary)'
              }}
            />
          ))}
        </Box>
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
                sx={{ fontSize: 10, height: 28 }}
              >
                <MenuItem value="" sx={{ fontSize: 10 }}>Apply template...</MenuItem>
                <MenuItem value="novel" sx={{ fontSize: 10 }}>Novel</MenuItem>
                <MenuItem value="research" sx={{ fontSize: 10 }}>Research Paper</MenuItem>
                <MenuItem value="blog" sx={{ fontSize: 10 }}>Blog Post</MenuItem>
              </Select>
            </FormControl>
            <Button size="small" variant="contained" disabled={!template} onClick={handleApplyTemplate} sx={{ fontSize: 9, height: 28 }}>Apply</Button>
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
                <Chip label={entry.type} size="small" sx={{ height: 16, fontSize: 9, bgcolor: TYPE_COLORS[entry.type] || 'var(--bg-surface)', color: '#000' }} />
                {entry.scope === 'global' && (
                  <Chip label="G" size="small" sx={{ height: 16, fontSize: 8, bgcolor: 'var(--accent)', color: '#fff', minWidth: 16 }} />
                )}
                {entry.approvalState === 'candidate' && (
                  <Chip label="needs review" size="small" sx={{ height: 16, fontSize: 8, bgcolor: '#f9e2af', color: '#000' }} />
                )}
                {(entry.approvalState === 'rejected' || entry.approvalState === 'superseded') && (
                  <Chip label={entry.approvalState} size="small" sx={{ height: 16, fontSize: 8, bgcolor: 'var(--bg-surface)', color: 'var(--text-secondary)' }} />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>{entry.agentName}</Typography>
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
                    <Tooltip title="Delete permanently — removes the stored evidence.">
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => handleDelete(entry.id)}>
                        <DeleteIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Box>
              {editingId === entry.id ? (
                <Box sx={{ mt: 0.5 }}>
                  <TextField fullWidth size="small" multiline value={editContent} onChange={(e) => setEditContent(e.target.value)} sx={{ '& .MuiInputBase-input': { fontSize: 11 } }} />
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                    <IconButton size="small" color="success" onClick={handleSaveEdit} sx={{ p: 0.25 }}><CheckIcon sx={{ fontSize: 14 }} /></IconButton>
                    <IconButton size="small" onClick={handleCancelEdit} sx={{ p: 0.25 }}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
                  </Box>
                </Box>
              ) : (
                <Typography variant="caption" sx={{ fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.4, opacity: entry.approvalState === 'rejected' || entry.approvalState === 'superseded' ? 0.5 : 1 }}>{entry.content}</Typography>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1.5, pt: 1, borderTop: '1px solid var(--border)' }}>
        <Tooltip title="Experimental: a Python sidecar (Mnesis) records chat turns and compacts long conversation context. Requires Python 3.12+ with the mnesis package. Off by default; the app works normally without it.">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Switch size="small" checked={mnesisEnabled} onChange={(e) => handleToggleMnesis(e.target.checked)} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              Conversation context engine (experimental)
            </Typography>
          </Box>
        </Tooltip>
        {mnesisEnabled && (
          <Typography
            variant="caption"
            sx={{ ml: 'auto', fontSize: 9, color: mnesisRunning ? 'var(--text-secondary)' : mnesisError ? '#f38ba8' : '#f9e2af' }}
          >
            {mnesisRunning ? 'worker active' : mnesisError || 'worker not detected'}
          </Typography>
        )}
      </Box>

      {quarantine.length > 0 && (
        <Box sx={{ mt: 1, p: 0.5, border: '1px solid #f9e2af', borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, display: 'block' }}>
            Quarantined legacy memory ({quarantine.length}) — review required
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: 'block', mb: 0.5 }}>
            These records came from an older memory format and couldn't be matched to a document. Keep imports one as a suggestion for the current document; discard removes it permanently.
          </Typography>
          {quarantine.map((q) => (
            <Box key={q.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              <Chip
                label={q.reason === 'default-key' ? 'default' : q.reason === 'missing-key' ? 'no link' : 'unknown key'}
                size="small"
                sx={{ height: 14, fontSize: 7, bgcolor: '#f9e2af', color: '#000' }}
              />
              <Typography variant="caption" sx={{ fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

      {/* §10.3: per-run "Context used" accounting (collapsible) */}
      <ContextInspector documentId={docId} />
    </Box>
  )
}