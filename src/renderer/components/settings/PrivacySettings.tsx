import React, { type FC, useEffect, useState } from 'react'
import { Typography, Switch, FormControlLabel, FormControl, Select, MenuItem, Divider, Button, Stack, Box } from '@mui/material'
import { useAppStore } from '../../store/app-store'
import { CONSENT_BOUNDARIES } from '../../../shared/consent-boundaries'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" sx={{ mt: 2, mb: 0.75, display: 'block', color: 'text.secondary', fontWeight: 600, fontSize: 12 }}>{children}</Typography>
)

export const PrivacySettings: FC = () => {
  const {
    privacyMode, dnsOverHttps, dataResidency, gdprConsent, analyticsEnabled,
    setPrivacyMode, setDnsOverHttps, setDataResidency, setGdprConsent, setAnalyticsEnabled,
    addToast
  } = useAppStore()

  return (
    <>
      <SectionTitle>Privacy Mode</SectionTitle>
      <FormControlLabel control={<Switch checked={privacyMode} onChange={(e) => setPrivacyMode(e.target.checked)} />} label="Enable Privacy Mode (disables analytics, crash reports, telemetry)" />

      <SectionTitle>DNS over HTTPS</SectionTitle>
      <FormControlLabel control={<Switch checked={dnsOverHttps} onChange={(e) => setDnsOverHttps(e.target.checked)} />} label="Enable DNS over HTTPS (prevents ISP snooping)" />

      <SectionTitle>Data Residency</SectionTitle>
      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <Select value={dataResidency} onChange={(e) => setDataResidency(e.target.value as any)}>
          <MenuItem value="us">United States (Default)</MenuItem>
          <MenuItem value="eu">European Union (GDPR-Compliant)</MenuItem>
          <MenuItem value="local">Local Only (No Cloud)</MenuItem>
          <MenuItem value="canada">Canada</MenuItem>
          <MenuItem value="australia">Australia</MenuItem>
        </Select>
      </FormControl>

      <SectionTitle>Analytics & Telemetry</SectionTitle>
      <FormControlLabel control={<Switch checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)} />} label="Enable analytics (helps us improve the app)" />

      <SectionTitle>GDPR Compliance</SectionTitle>
      <FormControlLabel control={<Switch checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} />} label="I consent to GDPR-compliant data processing" />
      <Typography variant="caption" sx={{ display: 'block', mt: 1, mb: 1.5, color: 'text.secondary' }}>
        By enabling GDPR mode, you agree to our privacy policy. Your data will be processed according to GDPR regulations with explicit consent management.
      </Typography>

      <Divider sx={{ my: 2 }} />

      <SectionTitle>Agent Memory Retention</SectionTitle>
      <MemoryRetentionControls />

      <SectionTitle>AI Consent Boundaries</SectionTitle>
      <ConsentControls />

      <SectionTitle>Data Management</SectionTitle>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" size="small" onClick={() => {
          const data = { exportDate: new Date().toISOString(), privacySettings: { privacyMode, dnsOverHttps, dataResidency, gdprConsent } }
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = `privacy-data-${Date.now()}.json`; a.click()
          URL.revokeObjectURL(url); addToast('success', 'Data exported successfully')
        }}>Export Data</Button>
        <Button variant="outlined" color="error" size="small" onClick={() => {
          if (window.confirm('This will delete all your personal data. Are you sure?')) { localStorage.clear(); addToast('success', 'All data deleted') }
        }}>Delete All Data</Button>
      </Stack>
    </>
  )
}

// ─── Agent memory retention (memory.md §11) ───

const RETENTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'forever', label: 'Keep until I delete it myself' },
  { value: '30', label: 'Delete after 30 days' },
  { value: '90', label: 'Delete after 90 days' },
  { value: '365', label: 'Delete after 1 year' }
]

const MemoryRetentionControls: FC = () => {
  const addToast = useAppStore(s => s.addToast)
  const [rejectedDays, setRejectedDays] = useState<number | null>(null)
  const [candidateDays, setCandidateDays] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.wordapp?.agent.memoryPolicyGet().then((policy) => {
      if (policy) {
        setRejectedDays(policy.rejectedDays)
        setCandidateDays(policy.candidateDays)
        setLoaded(true)
      }
    })
  }, [])

  if (!loaded) return null

  const apply = async (next: { rejectedDays: number | null; candidateDays: number | null }) => {
    setRejectedDays(next.rejectedDays)
    setCandidateDays(next.candidateDays)
    const result = await window.wordapp?.agent.memoryPolicySet(next)
    const removed = result ? result.removedRejected + result.removedCandidates : 0
    addToast('success', removed > 0 ? `Retention policy saved — ${removed} expired entries deleted` : 'Retention policy saved')
  }

  const selectValue = (days: number | null) => (days === null ? 'forever' : String(days))

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.25, display: 'block' }}>
            Revoked &amp; archived memories
          </Typography>
          <Select
            value={selectValue(rejectedDays)}
            onChange={(e) => {
              const v = e.target.value as string
              apply({ rejectedDays: v === 'forever' ? null : parseInt(v, 10), candidateDays })
            }}
          >
            {RETENTION_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.25, display: 'block' }}>
            Unreviewed suggestions
          </Typography>
          <Select
            value={selectValue(candidateDays)}
            onChange={(e) => {
              const v = e.target.value as string
              apply({ rejectedDays, candidateDays: v === 'forever' ? null : parseInt(v, 10) })
            }}
          >
            {RETENTION_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 1, mb: 1.5, color: 'text.secondary' }}>
        "Keep until I delete it myself" never removes anything automatically. Deleting memory does not remove the text
        from your document, rewrite VCS history, or erase backups you created — and it cannot remove data a remote AI
        provider may have retained.
      </Typography>
    </>
  )
}

// ─── Consolidated consent boundaries (memory.md §11) ───
// The boundary metadata (titles, descriptions, what-off notes) is the same
// pure module the main process enforces its gates with.

const ConsentControls: FC = () => {
  const addToast = useAppStore(s => s.addToast)
  const [consent, setConsentState] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    window.wordapp?.agent.consentGet().then((c) => setConsentState(c))
  }, [])

  if (!consent) return null

  const toggle = async (key: string, value: boolean) => {
    setConsentState({ ...consent, [key]: value })
    const result = await window.wordapp?.agent.consentSet({ [key]: value })
    if (result) {
      setConsentState(result)
      addToast('success', 'Consent preference saved')
    }
  }

  return (
    <>
      {CONSENT_BOUNDARIES.map((boundary, i) => (
        <Box key={boundary.key} sx={{ mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={consent[boundary.key] !== false} onChange={(e) => toggle(boundary.key, e.target.checked)} />}
            label={<Typography variant="body2">{i + 1}. {boundary.title}</Typography>}
          />
          <Typography variant="caption" sx={{ display: 'block', ml: 4, color: 'text.secondary' }}>
            {boundary.description}
          </Typography>
          {!consent[boundary.key] && (
            <Typography variant="caption" sx={{ display: 'block', ml: 4, color: 'var(--warning)' }}>
              {boundary.whenOff}
            </Typography>
          )}
        </Box>
      ))}
      <Typography variant="caption" sx={{ display: 'block', mb: 1.5, color: 'text.secondary' }}>
        Each boundary is an independent decision. Granting a tool permission (e.g. "save memory") is never treated as
        consent for the others — automatic inference, background summarization, and sharing stay off until you enable
        them here.
      </Typography>
    </>
  )
}
