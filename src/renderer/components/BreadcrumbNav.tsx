import React, { useEffect } from 'react'
import { Box, Breadcrumbs, Typography, Button, Stack, Paper } from '@mui/material'
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material'
import { useAppStore } from '../store/app-store'
import { extractHeadings, getBreadcrumbTrail, formatBreadcrumb } from '../utils/breadcrumb-utils'

export const BreadcrumbNav: React.FC = () => {
  const { documentContent, breadcrumbItems, setBreadcrumbItems } = useAppStore()

  // Extract headings on content change (debounced to avoid per-keystroke processing)
  useEffect(() => {
    const timer = setTimeout(() => {
      const headings = extractHeadings(documentContent)
      setBreadcrumbItems(headings)
    }, 300)
    return () => clearTimeout(timer)
  }, [documentContent, setBreadcrumbItems])

  // Get current breadcrumb trail (simplified - in real use would track cursor position)
  const currentTrail = breadcrumbItems.slice(0, Math.min(3, breadcrumbItems.length))

  if (breadcrumbItems.length === 0) {
    return null
  }

  const handleNavigate = (heading: any) => {
    const element = document.getElementById(heading.id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <Paper
      sx={{
        padding: '8px 12px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        maxHeight: '40px',
        overflowX: 'auto',
        '&::-webkit-scrollbar': {
          height: '4px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'var(--bg-primary)'
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'var(--border)',
          borderRadius: '2px'
        }
      }}
    >
      <Breadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: '16px', color: 'var(--text-muted)' }} />}
        aria-label="document navigation"
        sx={{
          '& .MuiBreadcrumbs-li': {
            display: 'flex',
            alignItems: 'center'
          }
        }}
      >
        <Button
          size="small"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          sx={{
            textTransform: 'none',
            color: 'var(--accent)',
            fontSize: '12px',
            padding: '2px 6px',
            minWidth: 'auto',
            '&:hover': {
              backgroundColor: 'var(--bg-surface)'
            }
          }}
        >
          Document
        </Button>

        {currentTrail.map((item) => (
          <Button
            key={item.id}
            size="small"
            onClick={() => handleNavigate(item)}
            sx={{
              textTransform: 'none',
              color: 'var(--text-primary)',
              fontSize: '12px',
              padding: '2px 6px',
              minWidth: 'auto',
              '&:hover': {
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--accent)'
              }
            }}
            title={item.label}
          >
            <Typography
              variant="body2"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '150px',
                fontSize: '12px'
              }}
            >
              {item.label || `Heading ${item.level}`}
            </Typography>
          </Button>
        ))}
      </Breadcrumbs>
    </Paper>
  )
}
