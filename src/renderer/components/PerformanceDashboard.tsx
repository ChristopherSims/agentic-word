import React, { useState, useEffect, FC } from 'react'
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Stack,
  Card,
  CardContent,
  CardHeader
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteIcon from '@mui/icons-material/Delete'
import type { PerformanceStats, MemoryMetrics, LoadTimeMetric, SaveMetric } from '../../../main/performance-monitor'

interface PerformanceDashboardProps {
  stats: PerformanceStats
  onRefresh?: () => void
  onExport?: () => void
  onClear?: () => void
}

/**
 * Performance Metrics Dashboard
 * Displays memory usage, load times, save times, and analytics
 */
export const PerformanceDashboard: FC<PerformanceDashboardProps> = ({
  stats,
  onRefresh,
  onExport,
  onClear
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'memory' | 'load' | 'save'>('memory')

  // Convert bytes to MB
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
  }

  // Format time
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  // Memory percentage
  const memoryPercentage = stats.memoryMetrics.length > 0
    ? (stats.memoryMetrics[stats.memoryMetrics.length - 1]?.percentage ?? 0)
    : 0

  const getMemoryStatus = (percentage: number): 'success' | 'warning' | 'error' => {
    if (percentage < 50) return 'success'
    if (percentage < 80) return 'warning'
    return 'error'
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header with Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Performance Dashboard</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            variant="outlined"
          >
            Refresh
          </Button>
          <Button
            size="small"
            startIcon={<DownloadIcon />}
            onClick={onExport}
            variant="outlined"
          >
            Export
          </Button>
          <Button
            size="small"
            startIcon={<DeleteIcon />}
            onClick={onClear}
            variant="outlined"
            color="error"
          >
            Clear
          </Button>
        </Stack>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2}>
        {/* Memory Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardHeader title="Memory Usage" subheader={formatBytes(stats.avgMemoryUsage)} />
            <CardContent>
              <LinearProgress
                variant="determinate"
                value={memoryPercentage}
                color={getMemoryStatus(memoryPercentage)}
                sx={{ mb: 1, height: 8 }}
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Peak: {formatBytes(stats.peakMemoryUsage)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Current: {memoryPercentage.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Load Time Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardHeader title="Avg Load Time" subheader={formatTime(stats.avgLoadTime)} />
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {stats.loadMetrics.length} measurements
              </Typography>
              <Chip
                size="small"
                label={`${stats.totalDocumentsProcessed} docs`}
                variant="outlined"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Save Time Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardHeader title="Avg Save Time" subheader={formatTime(stats.avgSaveTime)} />
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {stats.saveMetrics.length} measurements
              </Typography>
              <Chip
                size="small"
                label="Optimized"
                variant="outlined"
                color="success"
                size="small"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Total Metrics Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardHeader title="Metrics Collected" subheader={stats.totalMetrics} />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Memory checks: {stats.memoryMetrics.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Load events: {stats.loadMetrics.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Save events: {stats.saveMetrics.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Details Button */}
      <Button
        variant="text"
        onClick={() => setDetailsOpen(true)}
        sx={{ alignSelf: 'flex-end' }}
      >
        View Details →
      </Button>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Performance Details</DialogTitle>
        <DialogContent sx={{ minHeight: 400 }}>
          {/* Tab-like selector */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
            <Chip
              label="Memory"
              onClick={() => setSelectedTab('memory')}
              variant={selectedTab === 'memory' ? 'filled' : 'outlined'}
              color={selectedTab === 'memory' ? 'primary' : 'default'}
            />
            <Chip
              label="Load Times"
              onClick={() => setSelectedTab('load')}
              variant={selectedTab === 'load' ? 'filled' : 'outlined'}
              color={selectedTab === 'load' ? 'primary' : 'default'}
            />
            <Chip
              label="Save Times"
              onClick={() => setSelectedTab('save')}
              variant={selectedTab === 'save' ? 'filled' : 'outlined'}
              color={selectedTab === 'save' ? 'primary' : 'default'}
            />
          </Box>

          {/* Memory Table */}
          {selectedTab === 'memory' && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell>Time</TableCell>
                    <TableCell align="right">Heap Used</TableCell>
                    <TableCell align="right">Heap Total</TableCell>
                    <TableCell align="right">Percent</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.memoryMetrics.slice(-20).map((metric, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontSize: 12 }}>
                        {new Date(metric.timestamp).toLocaleTimeString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {formatBytes(metric.heapUsed)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {formatBytes(metric.heapTotal)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {metric.percentage.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {/* Load Times Table */}
          {selectedTab === 'load' && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell>Document</TableCell>
                    <TableCell align="right">Load Time</TableCell>
                    <TableCell align="right">File Size</TableCell>
                    <TableCell align="right">Compression</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.loadMetrics.map((metric, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontSize: 12 }}>{metric.documentName}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {formatTime(metric.loadTime)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {formatBytes(metric.fileSizeBytes)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {metric.compressionRatio.toFixed(2)}x
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {/* Save Times Table */}
          {selectedTab === 'save' && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell>Document</TableCell>
                    <TableCell align="right">Save Time</TableCell>
                    <TableCell align="right">Changes Size</TableCell>
                    <TableCell align="right">Compression</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.saveMetrics.map((metric, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontSize: 12 }}>{metric.documentName}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {formatTime(metric.saveTime)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {formatBytes(metric.changesSizeBytes)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>
                        {metric.compressionRatio.toFixed(2)}x
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
