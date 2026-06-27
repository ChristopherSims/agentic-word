import React, { type FC } from 'react'
import { Typography, Switch, FormControlLabel, FormControl, Select, MenuItem, Divider, Button, Stack } from '@mui/material'
import { useAppStore } from '../../store/app-store'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
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
