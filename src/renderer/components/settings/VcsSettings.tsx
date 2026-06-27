import React, { type FC } from 'react'
import { Typography, TextField, Switch, FormControlLabel } from '@mui/material'
import { useAppStore } from '../../store/app-store'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const VcsSettings: FC = () => {
  const { vcsDefaultBranch, vcsAutoCommitOnSave, vcsMaxCommits, setVcsDefaultBranch, setVcsAutoCommitOnSave, setVcsMaxCommits } = useAppStore()

  return (
    <>
      <SectionTitle>Default Branch Name</SectionTitle>
      <TextField fullWidth value={vcsDefaultBranch} onChange={(e) => setVcsDefaultBranch(e.target.value)} placeholder="main" />
      <FormControlLabel control={<Switch checked={vcsAutoCommitOnSave} onChange={(e) => setVcsAutoCommitOnSave(e.target.checked)} />} label={<Typography variant="caption">Auto-commit on save</Typography>} sx={{ mt: 1 }} />
      <SectionTitle>Max Commits Retained</SectionTitle>
      <Typography variant="caption" color="text.secondary">0 = unlimited</Typography>
      <TextField fullWidth type="number" value={vcsMaxCommits || ''} onChange={(e) => setVcsMaxCommits(Number(e.target.value) || 0)} placeholder="0" />
    </>
  )
}
