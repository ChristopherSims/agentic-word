import React, { type FC } from 'react'
import { Typography, TextField } from '@mui/material'
import { useAppStore } from '../../store/app-store'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const CollabSettings: FC = () => {
  const { collabDisplayName, collabCursorColor, collabMcpPort, setCollabDisplayName, setCollabCursorColor, setCollabMcpPort } = useAppStore()

  return (
    <>
      <SectionTitle>Display Name</SectionTitle>
      <TextField fullWidth value={collabDisplayName} onChange={(e) => setCollabDisplayName(e.target.value)} placeholder="Your name" />
      <SectionTitle>Cursor Color</SectionTitle>
      <input type="color" value={collabCursorColor} onChange={(e) => setCollabCursorColor(e.target.value)} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer' }} />
      <SectionTitle>Server Port</SectionTitle>
      <TextField fullWidth type="number" value={collabMcpPort || ''} onChange={(e) => setCollabMcpPort(Number(e.target.value))} placeholder="ws://localhost:PORT (default: 0 / off)" />
    </>
  )
}
