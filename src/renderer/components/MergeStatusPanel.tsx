import React, { FC, useState } from 'react'
import { Box, Paper, Typography, Button, Chip, Stack, Divider, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Card, CardHeader, CardContent, LinearProgress } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import PendingIcon from '@mui/icons-material/Pending'
import MergeIcon from '@mui/icons-material/Merge'
import AddIcon from '@mui/icons-material/Add'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import type { VcsMergeRequest } from '../types'

interface MergeStatusPanelProps {
  currentBranch: string
  branches: { name: string; current: boolean }[]
  mergeRequests: VcsMergeRequest[]
  onCreateMR?: (sourceBranch: string, targetBranch: string, title: string, description: string) => void
  onApproveMR?: (mrId: string, reviewer: string) => void
  onRejectMR?: (mrId: string, reviewer: string, comment?: string) => void
  onMergeMR?: (mrId: string) => void
  onCloseMR?: (mrId: string) => void
}

export const MergeStatusPanel: FC<MergeStatusPanelProps> = ({
  currentBranch,
  branches,
  mergeRequests,
  onCreateMR,
  onApproveMR,
  onRejectMR,
  onMergeMR,
  onCloseMR
}) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [sourceBranch, setSourceBranch] = useState('')
  const [mrTitle, setMrTitle] = useState('')
  const [mrDescription, setMrDescription] = useState('')
  const [selectedMR, setSelectedMR] = useState<VcsMergeRequest | null>(null)

  const handleCreateMR = () => {
    if (!onCreateMR || !sourceBranch || !mrTitle) return
    onCreateMR(sourceBranch, currentBranch, mrTitle, mrDescription)
    setSourceBranch('')
    setMrTitle('')
    setMrDescription('')
    setCreateDialogOpen(false)
  }

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'open':
        return 'info'
      case 'approved':
        return 'success'
      case 'rejected':
        return 'error'
      case 'merged':
        return 'success'
      case 'closed':
        return 'default'
      default:
        return 'default'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
      case 'merged':
        return <CheckCircleIcon sx={{ color: 'success.main' }} />
      case 'rejected':
        return <CloseIcon sx={{ color: 'error.main' }} />
      case 'open':
        return <PendingIcon sx={{ color: 'info.main' }} />
      default:
        return null
    }
  }

  const openMRs = mergeRequests.filter(mr => mr.status === 'open' && mr.targetBranch === currentBranch)
  const approvedMRs = mergeRequests.filter(mr => mr.status === 'approved' && mr.targetBranch === currentBranch)
  const otherMRs = mergeRequests.filter(mr => !['open', 'approved'].includes(mr.status) && mr.targetBranch === currentBranch)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Create MR Button */}
      <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
        Create Merge Request
      </Button>

      {/* Create MR Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Merge Request</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Target Branch: <code>{currentBranch}</code>
            </Typography>
          </Box>
          <TextField
            select
            label="Source Branch"
            value={sourceBranch}
            onChange={e => setSourceBranch(e.target.value)}
            fullWidth
          >
            {branches
              .filter(b => b.name !== currentBranch)
              .map(b => (
                <MenuItem key={b.name} value={b.name}>
                  {b.name}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="Title"
            value={mrTitle}
            onChange={e => setMrTitle(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Description"
            value={mrDescription}
            onChange={e => setMrDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateMR} variant="contained" disabled={!sourceBranch || !mrTitle}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Open MRs */}
      {openMRs.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
            Open Merge Requests ({openMRs.length})
          </Typography>
          {openMRs.map(mr => (
            <Card key={mr.id} sx={{ mb: 2 }}>
              <CardHeader
                title={mr.title}
                subheader={`${mr.sourceBranch} → ${mr.targetBranch} • Created by ${mr.creator}`}
                avatar={getStatusIcon('open')}
                action={
                  <Chip
                    label="Open"
                    color={getStatusColor('open')}
                    variant="outlined"
                    size="small"
                  />
                }
              />
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {mr.description}
                </Typography>

                {/* Approval Progress */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Approvals: {mr.currentApprovals}/{mr.requiredApprovals}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(mr.currentApprovals / mr.requiredApprovals) * 100}
                    sx={{ mt: 0.5 }}
                  />
                </Box>

                {/* Reviews */}
                {mr.reviews.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                      Reviews
                    </Typography>
                    {mr.reviews.map(review => (
                      <Box key={review.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {review.status === 'approved' ? (
                          <ThumbUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                        ) : (
                          <ThumbDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                        )}
                        <Typography variant="caption">
                          {review.reviewer}: {review.status === 'approved' ? 'Approved' : 'Requested changes'}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Action Buttons */}
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" color="success" startIcon={<ThumbUpIcon />} onClick={() => onApproveMR?.(mr.id, 'current-user')}>
                    Approve
                  </Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<ThumbDownIcon />} onClick={() => onRejectMR?.(mr.id, 'current-user')}>
                    Request Changes
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Paper>
      )}

      {/* Approved MRs (Ready to Merge) */}
      {approvedMRs.length > 0 && (
        <Paper sx={{ p: 2, bgcolor: 'success.lighter' }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
            Ready to Merge ({approvedMRs.length})
          </Typography>
          {approvedMRs.map(mr => (
            <Card key={mr.id} sx={{ mb: 2 }}>
              <CardHeader
                title={mr.title}
                subheader={`${mr.sourceBranch} → ${mr.targetBranch}`}
                avatar={getStatusIcon('approved')}
                action={
                  <Button size="small" variant="contained" startIcon={<MergeIcon />} onClick={() => onMergeMR?.(mr.id)}>
                    Merge
                  </Button>
                }
              />
            </Card>
          ))}
        </Paper>
      )}

      {/* Other MRs */}
      {otherMRs.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
            Other ({otherMRs.length})
          </Typography>
          {otherMRs.map(mr => (
            <Box key={mr.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
              {getStatusIcon(mr.status)}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2">{mr.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {mr.sourceBranch} → {mr.targetBranch}
                </Typography>
              </Box>
              <Chip label={mr.status} color={getStatusColor(mr.status)} variant="outlined" size="small" />
            </Box>
          ))}
        </Paper>
      )}

      {/* Empty State */}
      {mergeRequests.filter(mr => mr.targetBranch === currentBranch).length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'action.hover' }}>
          <MergeIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No merge requests for this branch
          </Typography>
        </Paper>
      )}
    </Box>
  )
}
