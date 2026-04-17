import React, { type FC } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Card, CardContent, Stack, Chip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import StarIcon from '@mui/icons-material/Star'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import { useAppStore } from '../store/app-store'

interface Feature {
  id: string
  version: string
  title: string
  description: string
  category: 'new' | 'improved' | 'fixed'
  details: string[]
  icon: string
}

export const FeatureHighlights: FC = () => {
  const { featureHighlightsOpen, setFeatureHighlightsOpen, markFeatureHighlightShown, featureHighlightsShown } = useAppStore()
  const [currentIndex, setCurrentIndex] = React.useState(0)

  const features: Feature[] = [
    {
      id: 'v0.4.5-collab',
      version: '0.4.5',
      title: 'Collaboration 2.0',
      category: 'new',
      description: 'Real-time multi-user editing with conflict resolution and activity timeline',
      details: [
        'Live collaboration with cursor sharing',
        'Conflict detection and resolution',
        'Edit history with full attribution',
        '@mention support in comments',
        'Document snapshots for version history'
      ],
      icon: '👥'
    },
    {
      id: 'v0.4.6-help',
      version: '0.4.6',
      title: 'Documentation & Help System',
      category: 'new',
      description: 'Interactive tutorials, FAQ, and contextual help',
      details: [
        'Interactive step-by-step tutorials',
        'Comprehensive FAQ section',
        'Developer resources and API docs',
        'Context-sensitive help',
        'Keyboard shortcuts reference'
      ],
      icon: '📚'
    },
    {
      id: 'v0.4.5-comments',
      version: '0.4.5',
      title: 'Enhanced Comments',
      category: 'improved',
      description: 'Better commenting with @mentions and thread management',
      details: [
        '@mention teammates for feedback',
        'Reply attribution with timestamps',
        'Comment permissions (private/shared)',
        'Thread resolution tracking',
        'Mention notifications'
      ],
      icon: '💬'
    }
  ]

  const unshownFeatures = features.filter((f) => !featureHighlightsShown.includes(f.id))

  React.useEffect(() => {
    if (featureHighlightsOpen && unshownFeatures.length > 0) {
      setCurrentIndex(0)
    }
  }, [featureHighlightsOpen, unshownFeatures])

  if (!featureHighlightsOpen || unshownFeatures.length === 0) {
    return null
  }

  const currentFeature = unshownFeatures[currentIndex]

  const handleNext = () => {
    markFeatureHighlightShown(currentFeature.id)
    if (currentIndex < unshownFeatures.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setFeatureHighlightsOpen(false)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleClose = () => {
    markFeatureHighlightShown(currentFeature.id)
    setFeatureHighlightsOpen(false)
  }

  const categoryColors = {
    new: 'success',
    improved: 'info',
    fixed: 'warning'
  } as const

  return (
    <Dialog open={featureHighlightsOpen} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <StarIcon sx={{ color: 'warning.main' }} />
        What's New in WordApp {currentFeature.version}
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Card sx={{ backgroundColor: 'action.hover', border: '2px solid', borderColor: 'primary.light' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
              <Typography sx={{ fontSize: 40 }}>{currentFeature.icon}</Typography>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 16 }}>
                  {currentFeature.title}
                </Typography>
                <Chip
                  label={currentFeature.category.toUpperCase()}
                  size="small"
                  color={categoryColors[currentFeature.category]}
                  variant="outlined"
                  sx={{ mt: 0.5, height: 18, fontSize: 8 }}
                />
              </Box>
            </Box>

            <Typography variant="body2" sx={{ mb: 2, fontSize: 12 }}>
              {currentFeature.description}
            </Typography>

            <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, textTransform: 'uppercase', display: 'block', mb: 0.75 }}>
              Key Features
            </Typography>

            <Stack spacing={0.5}>
              {currentFeature.details.map((detail, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                  <Typography sx={{ color: 'success.main', fontWeight: 700, fontSize: 12, mt: 0.25 }}>✓</Typography>
                  <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.4 }}>
                    {detail}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center', fontSize: 10 }}>
          Feature {currentIndex + 1} of {unshownFeatures.length}
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} size="small">
          Skip All
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handlePrev}
          size="small"
          disabled={currentIndex === 0}
          startIcon={<NavigateBeforeIcon />}
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          variant="contained"
          size="small"
          endIcon={currentIndex === unshownFeatures.length - 1 ? <CloseIcon /> : <NavigateNextIcon />}
        >
          {currentIndex === unshownFeatures.length - 1 ? 'Done' : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
