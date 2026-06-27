import React, { useState, useEffect, type FC } from 'react'
import { Box, Typography, Button, Switch, IconButton, Chip, List, ListItem, ListItemText, Divider } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../../store/app-store'
import type { PluginManifest, PluginMarketplaceEntry } from '../../types'

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const PluginsSettings: FC = () => {
  const { pluginList, pluginMarketplace, setPluginList, setPluginMarketplace, addToast } = useAppStore()
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await window.wordapp?.plugin.list()
      if (list) setPluginList(list as PluginManifest[])
      const market = await window.wordapp?.plugin.marketplace()
      if (market) setPluginMarketplace(market as PluginMarketplaceEntry[])
    } catch (err) { addToast('error', `Failed to load plugins: ${(err as Error).message}`) }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const handleInstall = async (entry: PluginMarketplaceEntry) => {
    const code = await window.wordapp?.plugin.builtinCode(entry.name)
    const manifest = { ...entry, installed: false, enabled: true }
    const result = await window.wordapp?.plugin.install(manifest, code || '')
    if (result) { addToast('success', `Plugin "${entry.name}" installed`); refresh() }
  }

  const handleUninstall = async (name: string) => {
    const result = await window.wordapp?.plugin.uninstall(name)
    if (result) { addToast('success', `Plugin "${name}" uninstalled`); refresh() }
  }

  const handleEnable = async (name: string) => {
    const result = await window.wordapp?.plugin.enable(name)
    if (result) { addToast('success', `Plugin "${name}" enabled`); refresh() }
  }

  const handleDisable = async (name: string) => {
    const result = await window.wordapp?.plugin.disable(name)
    if (result) { addToast('success', `Plugin "${name}" disabled`); refresh() }
  }

  const installedNames = new Set(pluginList.map((p) => p.name))

  return (
    <>
      <SectionTitle>Installed Plugins</SectionTitle>
      {pluginList.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ py: 1, display: 'block' }}>No plugins installed.</Typography>}
      <List dense sx={{ mb: 2 }}>
        {pluginList.map((p) => (
          <ListItem key={p.name} secondaryAction={<Box sx={{ display: 'flex', gap: 0.25 }}>
            <Switch size="small" checked={p.enabled} onChange={() => p.enabled ? handleDisable(p.name) : handleEnable(p.name)} />
            <IconButton size="small" color="error" onClick={() => handleUninstall(p.name)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
          </Box>}>
            <ListItemText
              primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontWeight={600}>{p.name}</Typography>
                <Chip label={`v${p.version}`} size="small" variant="outlined" sx={{ fontSize: 8, height: 14 }} />
                {p.lastError && <Chip label="ERROR" size="small" color="error" sx={{ fontSize: 7, height: 12 }} />}
              </Box>}
              secondary={p.description}
              secondaryTypographyProps={{ fontSize: 10 }}
            />
          </ListItem>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />

      <SectionTitle>Plugin Marketplace</SectionTitle>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Built-in plugins available for installation</Typography>
      <List dense>
        {pluginMarketplace.map((p) => (
          <ListItem key={p.name} secondaryAction={
            installedNames.has(p.name) ? (
              <Chip label="Installed" size="small" color="success" variant="outlined" sx={{ fontSize: 9, height: 20 }} />
            ) : (
              <Button size="small" variant="outlined" onClick={() => handleInstall(p)} sx={{ fontSize: 10 }}>Install</Button>
            )
          }>
            <ListItemText
              primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontWeight={600}>{p.name}</Typography>
                <Chip label={`v${p.version}`} size="small" variant="outlined" sx={{ fontSize: 8, height: 14 }} />
                <Chip label={p.author} size="small" sx={{ fontSize: 8, height: 14 }} />
              </Box>}
              secondary={p.description}
              secondaryTypographyProps={{ fontSize: 10 }}
            />
          </ListItem>
        ))}
      </List>
    </>
  )
}
