import React, { useState, FC } from 'react'
import { Box, Paper, Typography, Button, Switch, TextField, FormControlLabel, Stack, Divider, Chip, Select, MenuItem, FormControl, InputLabel } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import AddIcon from '@mui/icons-material/Add'
import type { VcsBranchProtection } from '../types'

interface BranchProtectionPanelProps {
  branches: { name: string; current: boolean }[]
  protections: VcsBranchProtection[]
  onSetProtection?: (branchName: string, protection: Partial<VcsBranchProtection>) => void
  onRemoveProtection?: (branchName: string) => void
}

export const BranchProtectionPanel: FC<BranchProtectionPanelProps> = ({
  branches,
  protections,
  onSetProtection,
  onRemoveProtection
}) => {
  const [selectedBranch, setSelectedBranch] = useState<string>(branches[0]?.name || '')
  const [requireCodeReview, setRequireCodeReview] = useState(false)
  const [requiredReviewCount, setRequiredReviewCount] = useState(1)
  const [dismissStaleReviews, setDismissStaleReviews] = useState(false)
  const [requireStatusChecks, setRequireStatusChecks] = useState(false)
  const [allowForcePush, setAllowForcePush] = useState(false)
  const [allowDeletion, setAllowDeletion] = useState(false)

  const currentProtection = protections.find(p => p.branch === selectedBranch)

  const handleLoadProtection = (branchName: string) => {
    setSelectedBranch(branchName)
    const protection = protections.find(p => p.branch === branchName)
    if (protection) {
      setRequireCodeReview(protection.requireCodeReview || false)
      setRequiredReviewCount(protection.requiredReviewCount || 1)
      setDismissStaleReviews(protection.dismissStaleReviews || false)
      setRequireStatusChecks(protection.requireStatusChecks || false)
      setAllowForcePush(protection.allowForcePush || false)
      setAllowDeletion(protection.allowDeletion || false)
    } else {
      setRequireCodeReview(false)
      setRequiredReviewCount(1)
      setDismissStaleReviews(false)
      setRequireStatusChecks(false)
      setAllowForcePush(false)
      setAllowDeletion(false)
    }
  }

  const handleSaveProtection = () => {
    if (!onSetProtection) return
    onSetProtection(selectedBranch, {
      branch: selectedBranch,
      requireCodeReview,
      requiredReviewCount: requireCodeReview ? requiredReviewCount : 0,
      dismissStaleReviews,
      requireStatusChecks,
      allowForcePush,
      allowDeletion
    })
  }

  const handleRemoveProtection = () => {
    if (!onRemoveProtection || !currentProtection) return
    onRemoveProtection(selectedBranch)
    handleLoadProtection(selectedBranch)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Branch Selector */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          Select Branch to Protect
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {branches.map(branch => (
            <Chip
              key={branch.name}
              label={branch.name}
              onClick={() => handleLoadProtection(branch.name)}
              variant={selectedBranch === branch.name ? 'filled' : 'outlined'}
              color={selectedBranch === branch.name ? 'primary' : 'default'}
              sx={{ mb: 1 }}
            />
          ))}
        </Stack>
      </Paper>

      {/* Protection Rules */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
          Protection Rules for <code>{selectedBranch}</code>
        </Typography>
        <Divider sx={{ mb: 2 }} />

        <Stack spacing={2}>
          {/* Require Code Review */}
          <Box>
            <FormControlLabel
              control={<Switch checked={requireCodeReview} onChange={e => setRequireCodeReview(e.target.checked)} />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Require Code Review
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Merge requests must be approved before merging
                  </Typography>
                </Box>
              }
            />
            {requireCodeReview && (
              <Box sx={{ ml: 4, mt: 1 }}>
                <TextField
                  type="number"
                  size="small"
                  label="Required Approvals"
                  value={requiredReviewCount}
                  onChange={e => setRequiredReviewCount(Math.max(1, parseInt(e.target.value) || 1))}
                  inputProps={{ min: 1, max: 10 }}
                  sx={{ width: 120 }}
                />
                <FormControlLabel
                  control={<Switch checked={dismissStaleReviews} onChange={e => setDismissStaleReviews(e.target.checked)} />}
                  label={
                    <Typography variant="caption">
                      Dismiss stale reviews on new commits
                    </Typography>
                  }
                  sx={{ display: 'block', mt: 1 }}
                />
              </Box>
            )}
          </Box>

          <Divider />

          {/* Require Status Checks */}
          <FormControlLabel
            control={<Switch checked={requireStatusChecks} onChange={e => setRequireStatusChecks(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Require Status Checks to Pass
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All status checks (tests, CI/CD) must pass before merging
                </Typography>
              </Box>
            }
          />

          <Divider />

          {/* Allow Force Push */}
          <FormControlLabel
            control={<Switch checked={allowForcePush} onChange={e => setAllowForcePush(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Allow Force Push
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Allow users to force push to this branch (dangerous)
                </Typography>
              </Box>
            }
          />

          <Divider />

          {/* Allow Deletion */}
          <FormControlLabel
            control={<Switch checked={allowDeletion} onChange={e => setAllowDeletion(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Allow Branch Deletion
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Allow users to delete this branch
                </Typography>
              </Box>
            }
          />
        </Stack>

        {/* Action Buttons */}
        <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
          <Button variant="contained" color="primary" startIcon={<SaveIcon />} onClick={handleSaveProtection}>
            Save Rules
          </Button>
          {currentProtection && (
            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleRemoveProtection}>
              Remove Protection
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Protected Branches Summary */}
      {protections.length > 0 && (
        <Paper sx={{ p: 2, bgcolor: 'info.lighter' }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Protected Branches ({protections.length})
          </Typography>
          <Stack spacing={1}>
            {protections.map(protection => (
              <Box key={protection.branch} sx={{ fontSize: 12 }}>
                <Chip
                  label={protection.branch}
                  size="small"
                  variant="outlined"
                  sx={{ mr: 1 }}
                />
                {protection.requireCodeReview && <Chip label={`${protection.requiredReviewCount} approvals`} size="small" />}
                {protection.requireStatusChecks && <Chip label="Status checks" size="small" />}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  )
}
