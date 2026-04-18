import React, { type FC } from 'react'
import { Box, Typography, Tabs, Tab, IconButton, TextField, List, ListItem, ListItemText, Divider, Chip, Stack, Link, Button } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ExpandIcon from '@mui/icons-material/OpenInNew'
import { useAppStore } from '../store/app-store'
import { SidePanel } from './shared/SidePanel'
import { DocumentationPanel } from './DocumentationPanel'

export const HelpPanel: FC = () => {
  const { helpPanelOpen, helpPanelView, setHelpPanelOpen, setHelpPanelView, setTutorialMode } = useAppStore()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [docsPanelOpen, setDocsPanelOpen] = React.useState(false)
  const chatSidebarOpen = useAppStore((s) => s.chatSidebarOpen)

  if (!helpPanelOpen) return null

  const tutorials = [
    { id: 'intro', title: 'Getting Started', duration: '5 min', description: 'Learn the basics of WordApp' },
    { id: 'editing', title: 'Document Editing', duration: '3 min', description: 'Master text editing features' },
    { id: 'collab', title: 'Real-Time Collaboration', duration: '4 min', description: 'Work together with others' },
    { id: 'vcs', title: 'Version Control', duration: '6 min', description: 'Track document history' },
    { id: 'export', title: 'Export & Share', duration: '3 min', description: 'Export to multiple formats' }
  ]

  const faqs = [
    { q: 'How do I save my document?', a: 'Use Ctrl+S or File → Save to save your work.' },
    { q: 'Can I collaborate with others?', a: 'Yes! Open View → Collaboration to invite others or join a session.' },
    { q: 'What formats can I export to?', a: 'WordApp supports PDF, EPUB, LaTeX, RTF, CSV, and more.' },
    { q: 'How do I enable dark mode?', a: 'Go to Settings → Appearance and select your preferred theme.' },
    { q: 'Is there a mobile version?', a: 'Mobile support is planned for a future release.' }
  ]

  const resources = [
    { title: 'User Guide', url: 'https://github.com/ChristopherSims/agentic-word/docs', icon: '📖' },
    { title: 'API Documentation', url: 'https://github.com/ChristopherSims/agentic-word/api-docs', icon: '⚙️' },
    { title: 'Plugin Development', url: 'https://github.com/ChristopherSims/agentic-word/plugin-guide', icon: '🔌' },
    { title: 'Troubleshooting', url: 'https://github.com/ChristopherSims/agentic-word/troubleshooting', icon: '🆘' },
    { title: 'GitHub Issues', url: 'https://github.com/ChristopherSims/agentic-word/issues', icon: '🐛' }
  ]

  const filteredTutorials = tutorials.filter(
    (t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredFaqs = faqs.filter(
    (f) => f.q.toLowerCase().includes(searchQuery.toLowerCase()) || f.a.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredResources = resources.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <SidePanel
      title="Help & Documentation"
      onClose={() => setHelpPanelOpen(false)}
      width={380}
      right={chatSidebarOpen ? 340 : 0}
    >
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1, pl: 1 }}>
          <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <TextField
            size="small"
            variant="standard"
            placeholder="Search help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{ input: { disableUnderline: true } }}
            sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 12 } }}
          />
        </Box>
      </Box>

      <Tabs
        value={helpPanelView}
        onChange={(_, view) => setHelpPanelView(view)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
      >
        <Tab label="Tutorials" value="tutorials" sx={{ fontSize: 12, textTransform: 'none' }} />
        <Tab label="FAQ" value="faq" sx={{ fontSize: 12, textTransform: 'none' }} />
        <Tab label="Resources" value="resources" sx={{ fontSize: 12, textTransform: 'none' }} />
      </Tabs>

      <Box sx={{ px: 2, py: 1 }}>
        <Button
          size="small"
          variant="contained"
          endIcon={<ExpandIcon sx={{ fontSize: 14 }} />}
          onClick={() => setDocsPanelOpen(true)}
          fullWidth
          disabled
          sx={{ textTransform: 'none', fontSize: 12, py: 0.75 }}
        >
          View Full Documentation (Coming Soon)
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {helpPanelView === 'tutorials' && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>
              Video Tutorials
            </Typography>
            <List dense sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filteredTutorials.map((tut) => (
                <ListItem
                  key={tut.id}
                  sx={{
                    p: 1,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.selected' }
                  }}
                  onClick={() => setTutorialMode(true)}
                >
                  <PlayArrowIcon sx={{ fontSize: 16, mr: 1, color: 'primary.main' }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ fontSize: 11, display: 'block', fontWeight: 600 }}>
                      {tut.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>
                      {tut.description}
                    </Typography>
                  </Box>
                  <Chip label={tut.duration} size="small" variant="outlined" sx={{ fontSize: 8, height: 18 }} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {helpPanelView === 'faq' && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>
              Frequently Asked Questions
            </Typography>
            <Stack spacing={1.5}>
              {filteredFaqs.map((faq, idx) => (
                <Box key={idx} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontSize: 11, display: 'block', mb: 0.5, fontWeight: 600 }}>
                    {faq.q}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', lineHeight: 1.4 }}>
                    {faq.a}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {helpPanelView === 'resources' && (
          <Box>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>
              External Resources
            </Typography>
            <List dense sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {filteredResources.map((res, idx) => (
                <ListItem
                  key={idx}
                  component="a"
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    p: 0.75,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { bgcolor: 'action.selected', borderColor: 'primary.main' }
                  }}
                >
                  <Typography variant="caption" sx={{ fontSize: 10 }}>
                    {res.icon} {res.title}
                  </Typography>
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Box>

      <DocumentationPanel open={docsPanelOpen} onClose={() => setDocsPanelOpen(false)} />
    </SidePanel>
  )
}
