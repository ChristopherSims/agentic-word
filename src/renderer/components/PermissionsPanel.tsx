import React, { type FC } from 'react'
import { Box, Typography, Switch, Divider, List, ListItem, ListItemText } from '@mui/material'
import { useAppStore } from '../store/app-store'
import type { AgentPermissionCategory } from '../../shared/types'

interface PermissionEntry {
  category: AgentPermissionCategory
  label: string
  description: string
}

const PERMISSION_ENTRIES: PermissionEntry[] = [
  { category: 'write', label: 'Write', description: 'Insert new content — covers document_write, document_prepend, document_append, streaming insert start' },
  { category: 'edit', label: 'Edit Existing Text', description: 'Replace, delete, or format existing text — covers document_replace, batch replace, delete, format' },
  { category: 'save', label: 'Save Document', description: 'Write document to disk — covers save operations' },
  { category: 'revert', label: 'Revert', description: 'Undo last streaming operation — covers undo' },
  { category: 'storyboard', label: 'Storyboard', description: 'Read and update the storyboard file — covers storyboard_read, storyboard_update' },
  { category: 'vcs', label: 'Version Control', description: 'Commit, log, diff — covers vcs operations' },
  { category: 'streaming', label: 'Streaming', description: 'Stream chunks into document — covers stream chunk/finalize/abort/preview' },
  { category: 'web', label: 'Web', description: 'Fetch URLs and search the web — covers web_fetch, web_search' }
]

export const PermissionsPanel: FC = () => {
  const agentPermissions = useAppStore((s) => s.agentPermissions)
  const setAgentPermissions = useAppStore((s) => s.setAgentPermissions)

  const handleToggle = (category: AgentPermissionCategory, value: boolean) => {
    // 1. Update the renderer store
    setAgentPermissions({ [category]: value })
    // 2. Sync to the main process
    window.wordapp?.agent.setAgentPermissions({ [category]: value }).catch((err: unknown) => {
      console.warn('[PermissionsPanel] Failed to sync permissions to main:', err)
    })
  }

  return (
    <Box>
      <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
        Permissions
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Control which agent tool operations are allowed to run without asking for approval.
      </Typography>
      <List dense sx={{ bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
        {PERMISSION_ENTRIES.map((entry, index) => (
          <React.Fragment key={entry.category}>
            <ListItem
              secondaryAction={
                <Switch
                  edge="end"
                  size="small"
                  checked={agentPermissions[entry.category]}
                  onChange={(e) => handleToggle(entry.category, e.target.checked)}
                />
              }
              disablePadding
              sx={{ pr: 1.5, py: 0.25 }}
            >
              <ListItemText
                primary={<Typography variant="body2" fontWeight={600}>{entry.label}</Typography>}
                secondary={<Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{entry.description}</Typography>}
                sx={{ pl: 1.5 }}
              />
            </ListItem>
            {index < PERMISSION_ENTRIES.length - 1 && <Divider component="li" />}
          </React.Fragment>
        ))}
      </List>
    </Box>
  )
}

export default PermissionsPanel
