import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  Slider,
  Paper,
  Grid,
  Divider,
  Alert
} from '@mui/material'
import { useStore } from '../store/app-store'
import {
  validateFontConfig,
  getAccessibilityNote,
  accessibleFontConfigs
} from '../utils/font-manager'

interface FontManagerProps {
  open: boolean
  onClose: () => void
}

export const FontManager: React.FC<FontManagerProps> = ({ open, onClose }) => {
  const {
    globalFontSize,
    globalLineHeight,
    globalLetterSpacing,
    setGlobalFontSize,
    setGlobalLineHeight,
    setGlobalLetterSpacing
  } = useStore()

  // Validate current config
  const currentConfig = {
    size: Math.round((16 * globalFontSize) / 100),
    lineHeight: globalLineHeight,
    letterSpacing: globalLetterSpacing
  }

  const validation = validateFontConfig(currentConfig)
  const a11yNote = getAccessibilityNote(currentConfig)

  const handlePresetClick = (preset: keyof typeof accessibleFontConfigs) => {
    const config = accessibleFontConfigs[preset]
    setGlobalFontSize((config.size / 16) * 100)
    setGlobalLineHeight(config.lineHeight)
    setGlobalLetterSpacing(config.letterSpacing)
  }

  const handleFontSizeChange = (_: Event, value: number | number[]) => {
    setGlobalFontSize(Array.isArray(value) ? value[0] : value)
  }

  const handleLineHeightChange = (_: Event, value: number | number[]) => {
    setGlobalLineHeight(Array.isArray(value) ? value[0] : value)
  }

  const handleLetterSpacingChange = (_: Event, value: number | number[]) => {
    setGlobalLetterSpacing(Array.isArray(value) ? value[0] : value)
  }

  // Calculate actual pixel sizes for display
  const baseFontSize = 16 // 16px base
  const actualFontSize = Math.round((baseFontSize * globalFontSize) / 100)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Font & Text Settings</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={3}>
          {/* Font Size Section */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Font Size</Typography>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 'bold' }}>
                {globalFontSize.toFixed(0)}% ({actualFontSize}px)
              </Typography>
            </Box>
            <Slider
              value={globalFontSize}
              onChange={handleFontSizeChange}
              min={50}
              max={200}
              step={5}
              marks={[
                { value: 50, label: '50%' },
                { value: 100, label: '100%' },
                { value: 150, label: '150%' },
                { value: 200, label: '200%' }
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}%`}
            />
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
              Adjust base font size for all text elements
            </Typography>
          </Box>

          <Divider />

          {/* Line Height Section */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Line Height</Typography>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 'bold' }}>
                {globalLineHeight.toFixed(1)}
              </Typography>
            </Box>
            <Slider
              value={globalLineHeight}
              onChange={handleLineHeightChange}
              min={1.2}
              max={3}
              step={0.1}
              marks={[
                { value: 1.2, label: '1.2' },
                { value: 1.6, label: '1.6' },
                { value: 2, label: '2.0' },
                { value: 2.4, label: '2.4' },
                { value: 3, label: '3.0' }
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => value.toFixed(1)}
            />
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
              Space between lines (1.2-3.0 range, WCAG recommends 1.5 minimum)
            </Typography>
          </Box>

          <Divider />

          {/* Letter Spacing Section */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Letter Spacing</Typography>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 'bold' }}>
                {globalLetterSpacing > 0 ? '+' : ''}{globalLetterSpacing.toFixed(2)}px
              </Typography>
            </Box>
            <Slider
              value={globalLetterSpacing}
              onChange={handleLetterSpacingChange}
              min={-1}
              max={2}
              step={0.05}
              marks={[
                { value: -1, label: '-1' },
                { value: 0, label: '0' },
                { value: 1, label: '+1' },
                { value: 2, label: '+2' }
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => value.toFixed(2)}
            />
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
              Space between characters (negative tightens, positive loosens)
            </Typography>
          </Box>

          <Divider />

          {/* Presets Section */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Accessibility Presets
            </Typography>
            <Grid container spacing={1}>
              {(Object.keys(accessibleFontConfigs) as Array<keyof typeof accessibleFontConfigs>).map(
                (preset) => (
                  <Grid item xs={6} key={preset}>
                    <Button
                      variant={
                        globalFontSize === (accessibleFontConfigs[preset].size / 16) * 100 &&
                        globalLineHeight === accessibleFontConfigs[preset].lineHeight &&
                        globalLetterSpacing === accessibleFontConfigs[preset].letterSpacing
                          ? 'contained'
                          : 'outlined'
                      }
                      onClick={() => handlePresetClick(preset)}
                      fullWidth
                      size="small"
                      sx={{ textTransform: 'capitalize' }}
                    >
                      {preset}
                    </Button>
                  </Grid>
                )
              )}
            </Grid>
          </Box>

          <Divider />

          {/* Live Preview */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Live Preview
            </Typography>
            <Paper
              sx={{
                p: 2,
                fontSize: `${actualFontSize}px`,
                lineHeight: globalLineHeight,
                letterSpacing: `${globalLetterSpacing}px`,
                backgroundColor: '#f5f5f5',
                borderRadius: 1
              }}
            >
              <Typography variant="body2">
                This is a preview of your text with the current font settings applied. You can see how the font
                size, line height, and letter spacing work together to affect readability.
              </Typography>
            </Paper>
          </Box>

          {/* Accessibility Note */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Accessibility Assessment
            </Typography>
            <Alert severity={validation.valid ? 'success' : 'warning'}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {validation.valid ? '✓ Configuration is accessible' : 'Configuration may impact accessibility'}
              </Typography>
              <Typography variant="caption">{a11yNote}</Typography>
            </Alert>
            {!validation.valid && validation.errors.length > 0 && (
              <Box sx={{ mt: 1 }}>
                {validation.errors.map((error, idx) => (
                  <Typography key={idx} variant="caption" color="error" sx={{ display: 'block' }}>
                    • {error}
                  </Typography>
                ))}
              </Box>
            )}
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
