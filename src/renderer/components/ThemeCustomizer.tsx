import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormGroup,
  Checkbox,
  Box,
  Typography,
  Stack,
  TextField,
  Alert,
  Paper,
  Divider,
  Grid
} from '@mui/material'
import { useStore } from '../store/app-store'
import { getContrastRatio, isWCAGAACompliant, isWCAGAAACompliant } from '../utils/theme-manager'
import { getColorPalette } from '../utils/accessibility-utils'

interface ThemeCustomizerProps {
  open: boolean
  onClose: () => void
}

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({ open, onClose }) => {
  const {
    themeMode,
    useSystemThemePreference,
    scheduledDarkModeEnabled,
    scheduledDarkModeStart,
    scheduledDarkModeEnd,
    accessibilityMode,
    setThemeMode,
    setUseSystemThemePreference,
    setScheduledDarkMode
  } = useStore()

  const [startHour, setStartHour] = useState(scheduledDarkModeStart.toString().padStart(2, '0'))
  const [endHour, setEndHour] = useState(scheduledDarkModeEnd.toString().padStart(2, '0'))

  const handleThemeModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setThemeMode(event.target.value as any)
  }

  const handleScheduledDarkModeToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setScheduledDarkMode(event.target.checked, parseInt(startHour), parseInt(endHour))
  }

  const handleStartHourChange = (value: string) => {
    const hour = Math.min(23, Math.max(0, parseInt(value) || 0))
    setStartHour(hour.toString().padStart(2, '0'))
    if (scheduledDarkModeEnabled) {
      setScheduledDarkMode(true, hour, parseInt(endHour))
    }
  }

  const handleEndHourChange = (value: string) => {
    const hour = Math.min(23, Math.max(0, parseInt(value) || 0))
    setEndHour(hour.toString().padStart(2, '0'))
    if (scheduledDarkModeEnabled) {
      setScheduledDarkMode(true, parseInt(startHour), hour)
    }
  }

  // Get current color palette for WCAG preview
  const theme = themeMode === 'auto' ? (useSystemThemePreference ? 'dark' : 'light') : (themeMode as any)
  const palette = getColorPalette(theme, accessibilityMode)

  // Calculate contrast ratios for preview
  const textContrast = getContrastRatio(palette.text, palette.background)
  const isAACompliant = isWCAGAACompliant(palette.text, palette.background)
  const isAAACompliant = isWCAGAAACompliant(palette.text, palette.background)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Theme Customization</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={3}>
          {/* Theme Mode Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Theme Mode
            </Typography>
            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend" sx={{ mb: 2 }}>
                Color Scheme
              </FormLabel>
              <RadioGroup value={themeMode} onChange={handleThemeModeChange} sx={{ ml: 2 }}>
                <FormControlLabel value="light" control={<Radio />} label="Light" />
                <FormControlLabel value="dark" control={<Radio />} label="Dark" />
                <FormControlLabel value="auto" control={<Radio />} label="Auto (System Setting)" />
              </RadioGroup>
            </FormControl>
          </Box>

          <Divider />

          {/* System Preference Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              System Integration
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useSystemThemePreference}
                    onChange={(e) => setUseSystemThemePreference(e.target.checked)}
                    disabled={themeMode !== 'auto'}
                  />
                }
                label="Use System Dark Mode Preference"
              />
              <Typography variant="body2" color="textSecondary" sx={{ ml: 4 }}>
                Follow your OS dark mode setting when theme mode is set to Auto
              </Typography>
            </FormGroup>
          </Box>

          <Divider />

          {/* Scheduled Dark Mode Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Scheduled Dark Mode
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={scheduledDarkModeEnabled}
                    onChange={handleScheduledDarkModeToggle}
                  />
                }
                label="Enable Scheduled Dark Mode"
              />
            </FormGroup>

            {scheduledDarkModeEnabled && (
              <Box sx={{ ml: 4, mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Dark mode will be active between:
                </Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <TextField
                      type="number"
                      label="Start Time (Hour)"
                      inputProps={{ min: 0, max: 23 }}
                      value={startHour}
                      onChange={(e) => handleStartHourChange(e.target.value)}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      type="number"
                      label="End Time (Hour)"
                      inputProps={{ min: 0, max: 23 }}
                      value={endHour}
                      onChange={(e) => handleEndHourChange(e.target.value)}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                </Grid>
                <Typography variant="caption" color="textSecondary">
                  Supports overnight schedules (e.g., 22:00 to 07:00 = 10 PM to 7 AM)
                </Typography>
              </Box>
            )}
          </Box>

          <Divider />

          {/* WCAG Compliance Preview */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              WCAG Compliance Preview
            </Typography>
            <Paper
              sx={{
                p: 2,
                backgroundColor: palette.background,
                color: palette.text,
                border: `2px solid ${palette.primary}`,
                borderRadius: 1
              }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                Sample Text Preview
              </Typography>
              <Typography variant="caption" color="inherit">
                This is how text will appear with your selected theme and accessibility mode.
              </Typography>
            </Paper>

            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Contrast Ratio:</strong> {textContrast}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Alert severity={isAACompliant ? 'success' : 'error'} sx={{ flex: 1, minWidth: 150 }}>
                  <Typography variant="caption">
                    WCAG AA: {isAACompliant ? '✓ Pass' : '✗ Fail'}
                  </Typography>
                </Alert>
                <Alert severity={isAAACompliant ? 'success' : 'warning'} sx={{ flex: 1, minWidth: 150 }}>
                  <Typography variant="caption">
                    WCAG AAA: {isAAACompliant ? '✓ Pass' : '✗ Fail'}
                  </Typography>
                </Alert>
              </Box>
            </Stack>
          </Box>

          <Alert severity="info">Changes are applied immediately and saved to your preferences.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
