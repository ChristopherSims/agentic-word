import React from 'react'
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
  Alert,
  Divider
} from '@mui/material'
import { useStore } from '../store/app-store'

interface AccessibilityPanelProps {
  open: boolean
  onClose: () => void
}

const ACCESSIBILITY_MODE_DESCRIPTIONS: Record<string, string> = {
  normal: 'Standard color scheme with WCAG AA contrast ratios',
  'high-contrast': 'Maximized contrast for vision impairment - WCAG AAA compliant',
  'eye-comfort': 'Warm colors with reduced blue light',
  deuteranopia: 'Color scheme optimized for red-green color blindness (deuteranopia)',
  protanopia: 'Color scheme optimized for red-green color blindness (protanopia)',
  tritanopia: 'Color scheme optimized for blue-yellow color blindness (tritanopia)'
}

export const AccessibilityPanel: React.FC<AccessibilityPanelProps> = ({ open, onClose }) => {
  const {
    accessibilityMode,
    reducedMotion,
    screenReaderOptimized,
    keyboardNavigationEnabled,
    highlightFocusIndicators,
    setAccessibilityMode,
    setReducedMotion,
    setScreenReaderOptimized,
    setKeyboardNavigationEnabled,
    setHighlightFocusIndicators
  } = useStore()

  const handleAccessibilityModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAccessibilityMode(event.target.value as any)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Accessibility Settings</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={3}>
          {/* Color & Vision Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Color & Vision
            </Typography>
            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend" sx={{ mb: 2 }}>
                Accessibility Mode
              </FormLabel>
              <RadioGroup value={accessibilityMode} onChange={handleAccessibilityModeChange} sx={{ ml: 2 }}>
                {Object.entries(ACCESSIBILITY_MODE_DESCRIPTIONS).map(([mode, desc]) => (
                  <Box key={mode} sx={{ mb: 2 }}>
                    <FormControlLabel value={mode} control={<Radio />} label={mode.charAt(0).toUpperCase() + mode.slice(1)} />
                    <Typography variant="body2" color="textSecondary" sx={{ ml: 4 }}>
                      {desc}
                    </Typography>
                  </Box>
                ))}
              </RadioGroup>
            </FormControl>
          </Box>

          <Divider />

          {/* Motion & Animation Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Motion & Animation
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={<Checkbox checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />}
                label="Reduce Motion"
              />
              <Typography variant="body2" color="textSecondary" sx={{ ml: 4 }}>
                Minimizes animations and transitions for users sensitive to motion
              </Typography>
            </FormGroup>
          </Box>

          <Divider />

          {/* Navigation & Input Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Navigation & Input
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={keyboardNavigationEnabled}
                    onChange={(e) => setKeyboardNavigationEnabled(e.target.checked)}
                  />
                }
                label="Enable Keyboard Navigation"
              />
              <Typography variant="body2" color="textSecondary" sx={{ ml: 4, mb: 2 }}>
                Full keyboard support for all UI elements (Tab, Arrow keys, Enter, Escape)
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={highlightFocusIndicators}
                    onChange={(e) => setHighlightFocusIndicators(e.target.checked)}
                  />
                }
                label="Highlight Focus Indicators"
              />
              <Typography variant="body2" color="textSecondary" sx={{ ml: 4, mb: 2 }}>
                Enhanced visual feedback when navigating with keyboard
              </Typography>
            </FormGroup>
          </Box>

          <Divider />

          {/* Assistive Technology Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Assistive Technology
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={screenReaderOptimized}
                    onChange={(e) => setScreenReaderOptimized(e.target.checked)}
                  />
                }
                label="Optimize for Screen Readers"
              />
              <Typography variant="body2" color="textSecondary" sx={{ ml: 4 }}>
                Enhanced ARIA labels and descriptions for better screen reader experience
              </Typography>
            </FormGroup>
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
