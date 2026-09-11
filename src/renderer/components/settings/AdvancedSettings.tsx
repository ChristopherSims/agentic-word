import React, { type FC } from 'react'
import { Box, Typography, Slider, Switch, FormControlLabel, FormControl, Select, MenuItem, Divider } from '@mui/material'
import { useAppStore } from '../../store/app-store'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" sx={{ mt: 2, mb: 0.75, display: 'block', color: 'text.secondary', fontWeight: 600, fontSize: 12 }}>{children}</Typography>
)

export const AdvancedSettings: FC = () => {
  const {
    performanceTuning, cacheSize, updateFrequency, enableBackupExport,
    setPerformanceTuning, setCacheSize, setUpdateFrequency, setEnableBackupExport
  } = useAppStore()

  return (
    <>
      <SectionTitle>Performance Tuning</SectionTitle>
      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <Select value={performanceTuning} onChange={(e) => setPerformanceTuning(e.target.value as any)}>
          <MenuItem value="low-power" sx={{ fontSize: 12 }}>Low Power (minimal resources)</MenuItem>
          <MenuItem value="balanced" sx={{ fontSize: 12 }}>Balanced (default)</MenuItem>
          <MenuItem value="high-performance" sx={{ fontSize: 12 }}>High Performance (uses more memory)</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Choose based on your system resources and preferences</Typography>

      <Divider sx={{ my: 1.5 }} />

      <SectionTitle>Cache Size</SectionTitle>
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Memory: {cacheSize} MB</Typography>
        <Slider value={cacheSize} onChange={(_, v) => setCacheSize(v as number)} min={50} max={1000} step={50} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v} MB`} size="small" />
      </Box>

      <SectionTitle>Update Frequency</SectionTitle>
      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <Select value={updateFrequency} onChange={(e) => setUpdateFrequency(e.target.value as any)}>
          <MenuItem value="never" sx={{ fontSize: 12 }}>Never</MenuItem>
          <MenuItem value="daily" sx={{ fontSize: 12 }}>Daily</MenuItem>
          <MenuItem value="weekly" sx={{ fontSize: 12 }}>Weekly (default)</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>How often to check for application updates</Typography>

      <Divider sx={{ my: 1.5 }} />

      <SectionTitle>Backup Management</SectionTitle>
      <FormControlLabel control={<Switch checked={enableBackupExport} onChange={(e) => setEnableBackupExport(e.target.checked)} />} label={<Typography variant="caption">Enable automatic backup export</Typography>} sx={{ mb: 1 }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Automatically export backups of your documents for safekeeping</Typography>
    </>
  )
}
