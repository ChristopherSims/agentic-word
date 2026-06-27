import React, { type FC } from 'react'
import { Typography, Switch, FormControlLabel, FormControl, Select, MenuItem, Divider } from '@mui/material'
import { useAppStore } from '../../store/app-store'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const BehaviorSettings: FC = () => {
  const {
    autoSaveOnFocusLoss, autoFormatOnPaste, scrollPastEnd, rememberLastDocument, sessionRestoration,
    autocorrectAggressiveLevel,
    setAutoSaveOnFocusLoss, setAutoFormatOnPaste, setScrollPastEnd, setRememberLastDocument, setSessionRestoration,
    setAutocorrectAggressiveLevel
  } = useAppStore()

  return (
    <>
      <SectionTitle>Auto-Save</SectionTitle>
      <FormControlLabel control={<Switch checked={autoSaveOnFocusLoss} onChange={(e) => setAutoSaveOnFocusLoss(e.target.checked)} />} label={<Typography variant="caption">Auto-save on focus loss</Typography>} sx={{ mb: 1.5 }} />

      <SectionTitle>Formatting</SectionTitle>
      <FormControlLabel control={<Switch checked={autoFormatOnPaste} onChange={(e) => setAutoFormatOnPaste(e.target.checked)} />} label={<Typography variant="caption">Auto-format on paste</Typography>} sx={{ mb: 1.5 }} />

      <SectionTitle>Scrolling</SectionTitle>
      <FormControlLabel control={<Switch checked={scrollPastEnd} onChange={(e) => setScrollPastEnd(e.target.checked)} />} label={<Typography variant="caption">Scroll past end of document</Typography>} sx={{ mb: 1.5 }} />

      <SectionTitle>Document Handling</SectionTitle>
      <FormControlLabel control={<Switch checked={rememberLastDocument} onChange={(e) => setRememberLastDocument(e.target.checked)} />} label={<Typography variant="caption">Remember last document</Typography>} sx={{ mb: 1 }} />
      <FormControlLabel control={<Switch checked={sessionRestoration} onChange={(e) => setSessionRestoration(e.target.checked)} />} label={<Typography variant="caption">Restore session on startup</Typography>} sx={{ mb: 1.5 }} />

      <Divider sx={{ my: 1.5 }} />

      <SectionTitle>Autocorrect Level</SectionTitle>
      <FormControl fullWidth size="small">
        <Select value={autocorrectAggressiveLevel} onChange={(e) => setAutocorrectAggressiveLevel(e.target.value as any)}>
          <MenuItem value="off" sx={{ fontSize: 11 }}>Off</MenuItem>
          <MenuItem value="conservative" sx={{ fontSize: 11 }}>Conservative (only obvious mistakes)</MenuItem>
          <MenuItem value="aggressive" sx={{ fontSize: 11 }}>Aggressive (suggest alternatives)</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Higher levels apply more corrections automatically</Typography>
    </>
  )
}
