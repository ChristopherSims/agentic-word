import React, { type FC } from 'react'
import { Box, Tab, Tabs, IconButton, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { useAppStore } from '../store/app-store'

export const TabBar: FC = () => {
  const { docTabs, activeTabId, switchDocTab, closeDocTab, addDocTab } = useAppStore()

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', minHeight: 34, px: 0.5, flexShrink: 0 }}>
      <Tabs
        value={activeTabId}
        onChange={(_, v) => switchDocTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 30, flex: 1, '& .MuiTab-root': { minHeight: 30, py: 0, px: 1.5, fontSize: 11, gap: 0.5 } }}
      >
        {docTabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {tab.isDirty && <FiberManualRecordIcon sx={{ fontSize: 7, color: 'warning.main' }} />}
                <span>{tab.title}</span>
                {docTabs.length > 1 && (
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); closeDocTab(tab.id) }}
                    sx={{ ml: 0.5, p: 0.15, fontSize: 10, '&:hover': { color: 'error.main' } }}
                  >
                    <CloseIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                )}
              </Box>
            }
          />
        ))}
      </Tabs>
      <Tooltip title="New Tab (Ctrl+T)">
        <IconButton size="small" onClick={() => addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })}>
          <AddIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
