import { useEffect, useState } from 'react'
import { Box, Typography, Chip, Tooltip, IconButton, Divider, LinearProgress } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import type { ContextRunReport, ContextPartKey } from '../../shared/types'

// Context inspector (memory.md §10.3): lightweight "Context used" accounting
// for each run — counts, sources, and degraded-fallback disclosures only,
// never a second copy of the assembled prompt.

const PART_LABELS: Record<ContextPartKey, string> = {
  documentContent: 'Document',
  selection: 'Selection',
  cursorContext: 'Cursor context',
  storyboardContent: 'Storyboard',
  scratchpad: 'Scratchpad',
  memoryContext: 'Memory'
}

const FALLBACK_LABELS: Record<string, string> = {
  'mnesis-worker-unavailable': 'Mnesis worker unavailable — raw transcript used',
  'mnesis-history-stale': 'Mnesis history behind local transcript — raw transcript used',
  'mnesis-request-failed': 'Mnesis request failed — raw transcript used',
  'memory-unavailable': 'No document identity — memory not included',
  'document-retrieval-partial': 'Document too large for the budget — query-relevant sections shown (partial view)'
}

function formatK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function timeLabel(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function ContextInspector({ documentId }: { documentId?: string }) {
  const [reports, setReports] = useState<ContextRunReport[]>([])
  const [selected, setSelected] = useState(0)
  const [open, setOpen] = useState(false)

  const load = async () => {
    const result = await window.wordapp?.agent.contextReports()
    if (result) {
      setReports(result)
      setSelected(0)
    }
  }

  useEffect(() => { load() }, [documentId])

  if (reports.length === 0) return null

  const report = reports[Math.min(selected, reports.length - 1)]
  const usage = Math.min(1, report.totalChars / report.budgetChars)
  const includedParts = report.parts.filter((p) => p.included)

  return (
    <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid var(--border)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{ cursor: 'pointer', mr: 'auto', fontSize: 10 }}
          onClick={() => setOpen(!open)}
        >
          Context used {open ? '▾' : '▸'} ({timeLabel(report.timestamp)})
        </Typography>
        <Tooltip title="Refresh from the most recent runs">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={load}>
            <RefreshIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {open && (
        <Box sx={{ mt: 0.5 }}>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
            {reports.map((r, i) => (
              <Chip
                key={r.timestamp}
                label={timeLabel(r.timestamp)}
                size="small"
                onClick={() => setSelected(i)}
                sx={{
                  height: 16,
                  fontSize: 8,
                  cursor: 'pointer',
                  bgcolor: i === selected ? 'var(--accent)' : 'var(--bg-surface)',
                  color: i === selected ? '#fff' : 'var(--text-secondary)'
                }}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
            <Chip
              label={report.local ? 'local' : 'remote'}
              size="small"
              sx={{ height: 16, fontSize: 8, bgcolor: report.local ? '#a6e3a1' : '#f9e2af', color: '#000' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
              {report.model || 'model unset'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontSize: 9 }}>
              ~{report.estimatedInputTokens} input tokens (est.)
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={usage * 100}
              sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: 'var(--bg-surface)' }}
              color={usage > 0.9 ? 'warning' : 'primary'}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
              {formatK(report.totalChars)}/{formatK(report.budgetChars)} chars
            </Typography>
          </Box>

          {includedParts.length > 0 ? (
            includedParts.map((p) => (
              <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                <Typography variant="caption" sx={{ fontSize: 9, width: 80, flexShrink: 0 }}>
                  {PART_LABELS[p.key]}
                </Typography>
                <Box sx={{ flex: 1, height: 3, borderRadius: 2, bgcolor: 'var(--bg-surface)' }}>
                  <Box
                    sx={{
                      height: '100%',
                      borderRadius: 2,
                      width: `${Math.min(100, (p.chars / Math.max(1, report.budgetChars)) * 100)}%`,
                      bgcolor: p.truncated ? '#f9e2af' : 'var(--accent)'
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                  {formatK(p.chars)}
                  {p.truncated && ` of ${formatK(p.originalChars)}`}
                </Typography>
                {p.truncated && (
                  <Tooltip title="Truncated to fit the shared context budget — the model can fetch full content with document_read">
                    <Chip label="cut" size="small" sx={{ height: 14, fontSize: 7, bgcolor: '#f9e2af', color: '#000' }} />
                  </Tooltip>
                )}
              </Box>
            ))
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: 'block', mt: 0.5 }}>
              No context parts were sent for this run.
            </Typography>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
              History: {report.history.source === 'curated' ? 'Mnesis curated' : 'raw transcript'} ({report.history.turns} messages)
            </Typography>
            {report.documentId && (
              <Tooltip title={`Memory/session identity: ${report.documentId}`}>
                <Chip label="doc-linked" size="small" sx={{ height: 14, fontSize: 7, bgcolor: 'var(--bg-surface)' }} />
              </Tooltip>
            )}
          </Box>

          {report.fallbacks.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Divider sx={{ my: 0.5 }} />
              {report.fallbacks.map((f) => (
                <Typography key={f} variant="caption" sx={{ fontSize: 9, display: 'block', color: '#f9e2af' }}>
                  ⚠ {FALLBACK_LABELS[f] ?? f}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
