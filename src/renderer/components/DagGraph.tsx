import React, { useState, useRef, useCallback, useMemo } from 'react'
import { Box, Typography, Chip, IconButton } from '@mui/material'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import FitScreenIcon from '@mui/icons-material/FitScreen'
import type { VcsGraphNode } from '../../shared/types'

interface DagGraphProps {
  nodes: VcsGraphNode[]
  edges: Array<{ from: string; to: string }>
  onNodeClick?: (node: VcsGraphNode) => void
  branchColors?: Record<string, string>
}

const DEFAULT_BRANCH_COLORS: Record<string, string> = {
  main: '#89b4fa',
  master: '#89b4fa',
  develop: '#a6e3a9',
  feature: '#f9e2af',
  release: '#f38ba8',
  hotfix: '#fab387'
}

const NODE_HEIGHT = 56
const LANE_WIDTH = 120
const PADDING_X = 80
const PADDING_Y = 24
const MIN_SCALE = 0.4
const MAX_SCALE = 3.0

function getBranchColor(name: string, custom: Record<string, string> = {}): string {
  const lower = name.toLowerCase()
  if (custom[lower]) return custom[lower]
  if (DEFAULT_BRANCH_COLORS[lower]) return DEFAULT_BRANCH_COLORS[lower]
  // Deterministic color from string hash
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 65%, 70%)`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const DagGraph: React.FC<DagGraphProps> = ({ nodes, edges, onNodeClick, branchColors = {} }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: PADDING_X, y: PADDING_Y })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<VcsGraphNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<Set<string>>(new Set())

  const maxLane = useMemo(() => nodes.reduce((m, n) => Math.max(m, n.lane), 0), [nodes])

  const visibleNodes = useMemo(() => {
    if (selectedBranchFilter.size === 0) return nodes
    return nodes.filter(n => selectedBranchFilter.has(n.branch) || n.branches.some(b => selectedBranchFilter.has(b)))
  }, [nodes, selectedBranchFilter])

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes])

  const visibleEdges = useMemo(() => {
    return edges.filter(e => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to))
  }, [edges, visibleNodeIds])

  const svgWidth = Math.max(400, (maxLane + 1) * LANE_WIDTH + PADDING_X * 2)
  const svgHeight = Math.max(300, nodes.length * NODE_HEIGHT + PADDING_Y * 2)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(prev => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * delta)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'circle' || (e.target as HTMLElement).tagName === 'polygon') return
    setDragging(true)
    setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y })
  }, [translate])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) {
      if (hoveredNode) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 })
        }
      }
      return
    }
    setTranslate({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }, [dragging, dragStart, hoveredNode])

  const handleMouseUp = useCallback(() => setDragging(false), [])

  const nodePosition = useCallback((nodeId: string) => {
    const idx = visibleNodes.findIndex(n => n.id === nodeId)
    if (idx === -1) return null
    const node = visibleNodes[idx]
    return {
      x: PADDING_X + node.lane * LANE_WIDTH,
      y: PADDING_Y + idx * NODE_HEIGHT + NODE_HEIGHT / 2
    }
  }, [visibleNodes])

  const allBranches = useMemo(() => {
    const set = new Set<string>()
    nodes.forEach(n => {
      set.add(n.branch)
      n.branches.forEach(b => set.add(b))
    })
    return Array.from(set).sort()
  }, [nodes])

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', bgcolor: 'background.paper', borderRadius: 1 }}>
      {/* Toolbar */}
      <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 0.5, bgcolor: 'background.paper', borderRadius: 1, p: 0.5, boxShadow: 1 }}>
        <IconButton size="small" onClick={() => setScale(s => Math.min(MAX_SCALE, s * 1.2))}><ZoomInIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={() => setScale(s => Math.max(MIN_SCALE, s * 0.8))}><ZoomOutIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={() => { setScale(1); setTranslate({ x: PADDING_X, y: PADDING_Y }) }}><FitScreenIcon fontSize="small" /></IconButton>
      </Box>

      {/* Branch filter legend */}
      <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: '60%' }}>
        {allBranches.map(b => {
          const active = selectedBranchFilter.size === 0 || selectedBranchFilter.has(b)
          return (
            <Chip
              key={b}
              label={b}
              size="small"
              onClick={() => {
                setSelectedBranchFilter(prev => {
                  const next = new Set(prev)
                  if (next.has(b)) next.delete(b)
                  else next.add(b)
                  // If all branches are selected, clear filter to show all
                  if (next.size === allBranches.length) return new Set()
                  return next
                })
              }}
              sx={{
                fontSize: 10,
                height: 20,
                opacity: active ? 1 : 0.4,
                bgcolor: getBranchColor(b, branchColors),
                color: '#1e1e2e',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            />
          )
        })}
        {selectedBranchFilter.size > 0 && (
          <Chip label="Clear" size="small" sx={{ fontSize: 10, height: 20, cursor: 'pointer' }} onClick={() => setSelectedBranchFilter(new Set())} />
        )}
      </Box>

      {/* SVG Canvas */}
      <Box
        ref={containerRef}
        sx={{ width: '100%', height: '100%', cursor: dragging ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
          <g transform={`translate(${translate.x}, ${translate.y}) scale(${scale})`}>
            {/* Lane background guides */}
            {Array.from({ length: maxLane + 1 }).map((_, lane) => (
              <line
                key={`lane-${lane}`}
                x1={PADDING_X + lane * LANE_WIDTH}
                y1={PADDING_Y - 12}
                x2={PADDING_X + lane * LANE_WIDTH}
                y2={svgHeight - PADDING_Y}
                stroke="currentColor"
                strokeOpacity={0.06}
                strokeWidth={1}
              />
            ))}

            {/* Edges */}
            {visibleEdges.map((e, i) => {
              const fromPos = nodePosition(e.from)
              const toPos = nodePosition(e.to)
              if (!fromPos || !toPos) return null
              const isCrossLane = fromPos.x !== toPos.x
              const color = getBranchColor(visibleNodes.find(n => n.id === e.to)?.branch || '', branchColors)
              return (
                <path
                  key={`edge-${i}`}
                  d={isCrossLane
                    ? `M ${toPos.x} ${toPos.y} C ${toPos.x} ${toPos.y - NODE_HEIGHT * 0.4}, ${fromPos.x} ${fromPos.y + NODE_HEIGHT * 0.4}, ${fromPos.x} ${fromPos.y}`
                    : `M ${toPos.x} ${toPos.y} L ${fromPos.x} ${fromPos.y}`
                  }
                  stroke={color}
                  strokeWidth={isCrossLane ? 2.5 : 2}
                  fill="none"
                  opacity={0.7}
                />
              )
            })}

            {/* Nodes */}
            {visibleNodes.map((node, idx) => {
              const x = PADDING_X + node.lane * LANE_WIDTH
              const y = PADDING_Y + idx * NODE_HEIGHT + NODE_HEIGHT / 2
              const color = getBranchColor(node.branch, branchColors)
              const isMerge = node.isMerge

              return (
                <g
                  key={node.id}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={(e) => { e.stopPropagation(); onNodeClick?.(node) }}
                  style={{ cursor: 'pointer' }}
                >
                  {isMerge ? (
                    <polygon
                      points={`${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}`}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle cx={x} cy={y} r={6} fill={color} stroke="#fff" strokeWidth={1.5} />
                  )}

                  {/* Commit message */}
                  <text x={x + 14} y={y + 3} fill="currentColor" fontSize={10} fontFamily="inherit" fontWeight={500}>
                    {node.message.slice(0, 30)}{node.message.length > 30 ? '...' : ''}
                  </text>

                  {/* Hash + time */}
                  <text x={x + 14} y={y + 16} fill="#888" fontSize={8} fontFamily="monospace">
                    {node.id.slice(0, 7)} · {formatTime(node.timestamp)}
                  </text>

                  {/* Branch labels on left */}
                  {node.branches.map((b, bi) => (
                    <g key={`bl-${bi}`}>
                      <rect x={x - 70 - bi * 58} y={y - 8} width={52} height={16} rx={3} fill={getBranchColor(b, branchColors)} opacity={0.9} />
                      <text x={x - 44 - bi * 58} y={y + 3} fill="#1e1e2e" fontSize={8} fontWeight={600} textAnchor="middle">{b}</text>
                    </g>
                  ))}

                  {/* Tags */}
                  {node.tags.map((t, ti) => (
                    <g key={`tag-${ti}`}>
                      <rect x={x + 14} y={y - 22 - ti * 16} width={Math.min(60, t.length * 6 + 10)} height={13} rx={3} fill="#f9e2af" opacity={0.9} />
                      <text x={x + 18} y={y - 12 - ti * 16} fill="#1e1e2e" fontSize={7} fontWeight={600}>{t}</text>
                    </g>
                  ))}
                </g>
              )
            })}
          </g>
        </svg>
      </Box>

      {/* Tooltip (plain div, not Popover) */}
      {hoveredNode && (
        <Box
          sx={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            zIndex: 20,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: 1,
            boxShadow: 3,
            minWidth: 220,
            maxWidth: 320,
            pointerEvents: 'none'
          }}
        >
          <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
            {hoveredNode.message}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace', fontSize: 10 }}>
            {hoveredNode.id}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>
            {formatTime(hoveredNode.timestamp)} · {hoveredNode.branch}
          </Typography>
          {hoveredNode.tags.length > 0 && (
            <Box sx={{ mt: 0.5, display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
              {hoveredNode.tags.map(t => (
                <Chip key={t} label={t} size="small" sx={{ fontSize: 8, height: 14, bgcolor: '#f9e2af', color: '#1e1e2e' }} />
              ))}
            </Box>
          )}
          {hoveredNode.isMerge && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5, fontSize: 10 }}>
              Merge commit ({hoveredNode.parents.length} parents)
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}
