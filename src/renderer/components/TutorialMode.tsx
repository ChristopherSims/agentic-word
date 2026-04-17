import React, { type FC } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Stepper, Step, StepLabel, StepContent, Card, CardContent } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import { useAppStore } from '../store/app-store'

interface TutorialStep {
  title: string
  description: string
  action: string
  hint: string
  illustration?: string
}

interface Tutorial {
  id: string
  title: string
  description: string
  steps: TutorialStep[]
}

export const TutorialMode: FC = () => {
  const { tutorialMode, tutorialCurrentStep, setTutorialMode, setTutorialCurrentStep } = useAppStore()

  const tutorials: Record<string, Tutorial> = {
    intro: {
      id: 'intro',
      title: 'Getting Started with WordApp',
      description: 'Learn the basics of WordApp in 5 minutes',
      steps: [
        {
          title: 'Welcome to WordApp!',
          description: 'WordApp is a powerful document editor with real-time collaboration, version control, and intelligent writing features.',
          action: 'Click "Next" to continue',
          hint: 'This is the first step of the tutorial'
        },
        {
          title: 'Creating Documents',
          description: 'Create new documents using File → New or Ctrl+N. Your work is automatically saved.',
          action: 'Try creating a new document',
          hint: 'Use the File menu to create a new document'
        },
        {
          title: 'Editing Text',
          description: 'Simply click in the editor and start typing. Use common shortcuts like Ctrl+B for bold and Ctrl+I for italic.',
          action: 'Type some text in the editor',
          hint: 'The editor supports standard text formatting'
        },
        {
          title: 'Real-Time Collaboration',
          description: 'Invite others to collaborate using View → Collaboration. Share the room code with your team.',
          action: 'Explore the Collaboration menu',
          hint: 'Collaboration features are in the View menu'
        },
        {
          title: 'Version Control',
          description: 'Track changes with integrated version control. Use Ctrl+K or View → VCS to access git-like features.',
          action: 'Open the VCS panel',
          hint: 'VCS features are available in the View menu'
        }
      ]
    },
    editing: {
      id: 'editing',
      title: 'Document Editing',
      description: 'Master text editing features',
      steps: [
        {
          title: 'Text Formatting',
          description: 'Use the toolbar or keyboard shortcuts for formatting:\n• Ctrl+B for bold\n• Ctrl+I for italic\n• Ctrl+U for underline',
          action: 'Format some text',
          hint: 'Try selecting text and using keyboard shortcuts'
        },
        {
          title: 'Find & Replace',
          description: 'Use Ctrl+H to open Find & Replace. Search across your entire document and replace text with ease.',
          action: 'Try Find & Replace',
          hint: 'Ctrl+H opens the Find & Replace dialog'
        },
        {
          title: 'Document Outline',
          description: 'Navigate large documents using the Outline panel. It automatically extracts headings from your document.',
          action: 'Open the Outline panel',
          hint: 'Click the outline icon or use the View menu'
        }
      ]
    }
  }

  const currentTutorial = tutorials.intro
  const currentStep = currentTutorial.steps[tutorialCurrentStep]

  const handleNext = () => {
    if (tutorialCurrentStep < currentTutorial.steps.length - 1) {
      setTutorialCurrentStep(tutorialCurrentStep + 1)
    } else {
      setTutorialMode(false)
    }
  }

  const handlePrev = () => {
    if (tutorialCurrentStep > 0) {
      setTutorialCurrentStep(tutorialCurrentStep - 1)
    }
  }

  const handleClose = () => {
    setTutorialMode(false)
    setTutorialCurrentStep(0)
  }

  return (
    <Dialog open={tutorialMode} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {currentTutorial.title}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 3, minHeight: 400 }}>
        {/* Stepper on the left */}
        <Box sx={{ minWidth: 200, maxWidth: 200 }}>
          <Stepper activeStep={tutorialCurrentStep} orientation="vertical">
            {currentTutorial.steps.map((step, idx) => (
              <Step key={idx}>
                <StepLabel
                  sx={{
                    '& .MuiStepLabel-label': { fontSize: 11, cursor: 'pointer' },
                    '& .MuiStepLabel-label.Mui-active': { fontWeight: 600 }
                  }}
                  onClick={() => setTutorialCurrentStep(idx)}
                >
                  {step.title}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Content on the right */}
        <Box sx={{ flex: 1 }}>
          <Card sx={{ backgroundColor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: 14 }}>
                {currentStep?.title}
              </Typography>

              <Typography variant="body2" sx={{ mb: 2, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {currentStep?.description}
              </Typography>

              <Box sx={{ p: 1.5, bgcolor: 'primary.light', borderRadius: 1, mb: 1.5 }}>
                <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, color: 'primary.dark', display: 'block' }}>
                  ✓ Your Task
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 11, color: 'primary.dark' }}>
                  {currentStep?.action}
                </Typography>
              </Box>

              <Box sx={{ p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, color: 'warning.dark', display: 'block' }}>
                  💡 Hint
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 10, color: 'warning.dark' }}>
                  {currentStep?.hint}
                </Typography>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, fontSize: 9 }}>
                Step {tutorialCurrentStep + 1} of {currentTutorial.steps.length}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} size="small">
          Skip
        </Button>
        <Button onClick={handlePrev} size="small" disabled={tutorialCurrentStep === 0} startIcon={<NavigateBeforeIcon />}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          variant="contained"
          size="small"
          endIcon={tutorialCurrentStep === currentTutorial.steps.length - 1 ? <CloseIcon /> : <NavigateNextIcon />}
        >
          {tutorialCurrentStep === currentTutorial.steps.length - 1 ? 'Finish' : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
