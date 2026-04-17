import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  Tabs,
  Tab,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import '../styles/contribution-analytics.css'

interface ContributionData {
  userId: string
  userName: string
  email: string
  insertCount: number
  deleteCount: number
  charInserted: number
  charDeleted: number
  commentCount: number
  suggestionsAccepted: number
  suggestionsRejected: number
  lastEditTime: number
}

interface Metrics {
  userId: string
  wordsAdded: number
  wordsRemoved: number
  editsPerHour: number
  commentsPerEdit: number
  suggestionAcceptanceRate: number
  averageSessionDuration: number
  mostActiveHour: number
  contributionPercentage: number
}

export function ContributionAnalyticsPanel() {
  const [tabIndex, setTabIndex] = useState(0)
  const [contributions, setContributions] = useState<ContributionData[]>([])
  const [metrics, setMetrics] = useState<Map<string, Metrics>>(new Map())
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    setLoading(true)
    // In real implementation, fetch from backend
    // For now, use mock data
    const mockContributions: ContributionData[] = [
      {
        userId: 'user1',
        userName: 'Alice',
        email: 'alice@example.com',
        insertCount: 156,
        deleteCount: 23,
        charInserted: 8420,
        charDeleted: 1240,
        commentCount: 12,
        suggestionsAccepted: 8,
        suggestionsRejected: 2,
        lastEditTime: Date.now() - 3600000,
      },
      {
        userId: 'user2',
        userName: 'Bob',
        email: 'bob@example.com',
        insertCount: 89,
        deleteCount: 15,
        charInserted: 5230,
        charDeleted: 680,
        commentCount: 7,
        suggestionsAccepted: 5,
        suggestionsRejected: 1,
        lastEditTime: Date.now() - 7200000,
      },
    ]
    setContributions(mockContributions)
    setLoading(false)
  }

  const getContributionPercentage = (contrib: ContributionData): number => {
    const total = contributions.reduce(
      (sum, c) => sum + c.insertCount + c.deleteCount,
      0
    )
    return total > 0
      ? ((contrib.insertCount + contrib.deleteCount) / total) * 100
      : 0
  }

  const getSuggestionAcceptanceRate = (
    contrib: ContributionData
  ): number => {
    const total = contrib.suggestionsAccepted + contrib.suggestionsRejected
    return total > 0 ? (contrib.suggestionsAccepted / total) * 100 : 0
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h6">Contribution Analytics</Typography>
        <Button
          startIcon={<RefreshIcon />}
          size="small"
          onClick={loadAnalytics}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{ mb: 2 }}
      >
        <Tab label="Overview" />
        <Tab label="Contributions" />
        <Tab label="Activity" />
      </Tabs>

      {tabIndex === 0 && (
        <Grid container spacing={2}>
          {/* Summary Cards */}
          {contributions.map((contrib) => (
            <Grid item xs={12} sm={6} md={4} key={contrib.userId}>
              <Card sx={{ cursor: 'pointer' }}>
                <CardContent
                  onClick={() => {
                    setSelectedUser(contrib.userId)
                    setDetailDialogOpen(true)
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <Avatar sx={{ width: 32, height: 32 }}>
                      {contrib.userName.charAt(0)}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {contrib.userName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {contrib.email}
                      </Typography>
                    </Box>
                  </Stack>

                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
                      Edits: {contrib.insertCount + contrib.deleteCount}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={getContributionPercentage(contrib)}
                    />
                  </Box>

                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
                      Suggestion Acceptance:{' '}
                      {getSuggestionAcceptanceRate(contrib).toFixed(0)}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={getSuggestionAcceptanceRate(contrib)}
                      color={
                        getSuggestionAcceptanceRate(contrib) > 70
                          ? 'success'
                          : 'warning'
                      }
                    />
                  </Box>

                  <Stack direction="row" spacing={0.5}>
                    <Chip
                      label={`${contrib.commentCount} comments`}
                      size="small"
                    />
                    <Chip
                      label={`${contrib.charInserted} chars`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {tabIndex === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table sx={{ '& td, & th': { fontSize: 12, py: 1 } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell>User</TableCell>
                <TableCell align="right">Inserts</TableCell>
                <TableCell align="right">Deletes</TableCell>
                <TableCell align="right">Chars Added</TableCell>
                <TableCell align="right">Comments</TableCell>
                <TableCell align="right">Suggestions ✓</TableCell>
                <TableCell align="right">Last Edit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contributions.map((contrib) => (
                <TableRow
                  key={contrib.userId}
                  hover
                  onClick={() => {
                    setSelectedUser(contrib.userId)
                    setDetailDialogOpen(true)
                  }}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{contrib.userName}</TableCell>
                  <TableCell align="right">{contrib.insertCount}</TableCell>
                  <TableCell align="right">{contrib.deleteCount}</TableCell>
                  <TableCell align="right">{contrib.charInserted}</TableCell>
                  <TableCell align="right">{contrib.commentCount}</TableCell>
                  <TableCell align="right">
                    {contrib.suggestionsAccepted}/
                    {contrib.suggestionsAccepted +
                      contrib.suggestionsRejected}
                  </TableCell>
                  <TableCell align="right">
                    {new Date(contrib.lastEditTime).toLocaleTimeString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {tabIndex === 2 && (
        <Box>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Activity timeline visualization would appear here with time-series
            data of edits, comments, and suggestions over time.
          </Typography>
          <Card sx={{ p: 2, minHeight: 300, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary">
              [Activity Timeline Component]
            </Typography>
          </Card>
        </Box>
      )}

      {/* Details Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {contributions.find((c) => c.userId === selectedUser)?.userName ||
            'User Details'}
        </DialogTitle>
        <DialogContent>
          {contributions
            .filter((c) => c.userId === selectedUser)
            .map((contrib) => (
              <Box key={contrib.userId} sx={{ mt: 2 }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Email
                    </Typography>
                    <Typography variant="body2">{contrib.email}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Edits (Inserts/Deletes)
                    </Typography>
                    <Typography variant="body2">
                      {contrib.insertCount} / {contrib.deleteCount}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Content Added
                    </Typography>
                    <Typography variant="body2">
                      {Math.floor(contrib.charInserted / 5)} words (~
                      {contrib.charInserted} characters)
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Comments
                    </Typography>
                    <Typography variant="body2">{contrib.commentCount}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Suggestion Acceptance
                    </Typography>
                    <Typography variant="body2">
                      {contrib.suggestionsAccepted}/
                      {contrib.suggestionsAccepted +
                        contrib.suggestionsRejected}{' '}
                      (
                      {getSuggestionAcceptanceRate(contrib).toFixed(0)}%)
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
