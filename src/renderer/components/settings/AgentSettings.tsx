import React, { useState, useEffect, type FC } from 'react'
import { Box, Typography, TextField, Button, Slider, Switch, FormControlLabel, List, ListItem, ListItemText, IconButton } from '@mui/material'
import ApplyIcon from '@mui/icons-material/Check'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../../store/app-store'
import { validateInput } from '../../utils'
import { PermissionsPanel } from '../PermissionsPanel'

interface Preset { id: string; name: string; endpoint: string; apiKey: string; model: string }

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const AgentSettings: FC = () => {
  const {
    agentConfig, ollamaFormat, setAgentConfig, setOllamaFormat, availableTools, agentPresets, setAgentPresets,
    agentMaxToolTurns, agentAutoApplyThreshold, agentTemperature,
    setAgentMaxToolTurns, setAgentAutoApplyThreshold, setAgentTemperature,
    addToast
  } = useAppStore()

  const [localAgentConfig, setLocalAgentConfig] = useState(agentConfig)
  const [newPresetName, setNewPresetName] = useState('')

  useEffect(() => { setLocalAgentConfig(agentConfig) }, [agentConfig])

  useEffect(() => {
    window.wordapp?.agent.getConfig?.().then((config: any) => {
      if (config && (config.endpoint || config.apiKey || config.model)) setLocalAgentConfig(config)
    }).catch((err: any) => console.warn('[AgentSettings] Failed to load config:', err))
    if (agentPresets.length === 0) {
      window.wordapp?.agent.getPresets().then((p) => { if (p && p.length > 0) setAgentPresets(p as Preset[]) }).catch((err) => addToast('warning', `Failed to load agent presets: ${(err as Error).message}`))
    }
  }, [])

  const handleAgentSave = async () => {
    setAgentConfig(localAgentConfig)
    await window.wordapp?.agent.configure(localAgentConfig)
    addToast('success', 'Agent configuration saved!')
  }

  const handleSavePreset = async () => {
    if (!validateInput(newPresetName)) return
    await window.wordapp?.agent.addPreset({ name: newPresetName, endpoint: localAgentConfig.endpoint, apiKey: localAgentConfig.apiKey, model: localAgentConfig.model })
    const p = await window.wordapp?.agent.getPresets(); if (p) setAgentPresets(p as Preset[]); setNewPresetName('')
  }

  const handleApplyPreset = async (id: string) => {
    const config = await window.wordapp?.agent.applyPreset(id)
    if (config) { const c = config as { endpoint: string; apiKey: string; model: string }; setLocalAgentConfig(c); setAgentConfig(c) }
  }

  const handleDeletePreset = async (id: string) => {
    await window.wordapp?.agent.deletePreset(id)
    const p = await window.wordapp?.agent.getPresets(); if (p) setAgentPresets(p as Preset[])
  }

  return (
    <>
      <SectionTitle>API Configuration</SectionTitle>
      <TextField fullWidth label="Endpoint" value={localAgentConfig.endpoint} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, endpoint: e.target.value })} placeholder="http://localhost:11434/v1/chat/completions" sx={{ mb: 1 }} />
      <TextField fullWidth label="API Key" type="password" value={localAgentConfig.apiKey} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, apiKey: e.target.value })} placeholder="Leave empty for local models" sx={{ mb: 1 }} />
      <TextField fullWidth label="Model" value={localAgentConfig.model} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, model: e.target.value })} placeholder="hermes3, gpt-4, llama3" sx={{ mb: 1 }} />
      <FormControlLabel control={<Switch checked={ollamaFormat} onChange={(e) => setOllamaFormat(e.target.checked)} size="small" />} label={<Typography variant="caption">Ollama native API format</Typography>} sx={{ mb: 1 }} />
      <TextField fullWidth size="small" label="Fast Model (grammar/suggestions)" value={localAgentConfig.fastModel || ''} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, fastModel: e.target.value || undefined })} placeholder="e.g. qwen3:3b" sx={{ mb: 1 }} />
      <TextField fullWidth size="small" label="Smart Model (chat/writing)" value={localAgentConfig.smartModel || ''} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, smartModel: e.target.value || undefined })} placeholder="e.g. qwen3.5:27b" sx={{ mb: 1 }} />
      <Button fullWidth variant="contained" size="small" onClick={handleAgentSave}>Save Agent Config</Button>

      <SectionTitle>Presets</SectionTitle>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
        <TextField size="small" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Preset name..." onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset() }} sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" onClick={handleSavePreset}>Save</Button>
      </Box>
      <List dense>{agentPresets.map((p) => (
        <ListItem key={p.id} secondaryAction={<Box sx={{ display: 'flex', gap: 0.25 }}><IconButton size="small" onClick={() => handleApplyPreset(p.id)}><ApplyIcon sx={{ fontSize: 14 }} /></IconButton><IconButton size="small" onClick={() => handleDeletePreset(p.id)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton></Box>}>
          <ListItemText primary={p.name} secondary={p.model} slotProps={{ primary: { sx: { fontSize: 12 } }, secondary: { sx: { fontSize: 10 } } }} />
        </ListItem>
      ))}</List>

      <SectionTitle>Tool Chain Turns</SectionTitle>
      <Slider value={agentMaxToolTurns} onChange={(_, v) => setAgentMaxToolTurns(v as number)} min={1} max={10} step={1} valueLabelDisplay="auto" size="small" />

      <SectionTitle>Auto-Apply Threshold</SectionTitle>
      <Typography variant="caption" color="text.secondary">0 = always require review</Typography>
      <Slider value={agentAutoApplyThreshold} onChange={(_, v) => setAgentAutoApplyThreshold(v as number)} min={0} max={100} step={5} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} size="small" />

      <SectionTitle>Temperature</SectionTitle>
      <Slider value={agentTemperature} onChange={(_, v) => setAgentTemperature(v as number)} min={0} max={2} step={0.1} valueLabelDisplay="auto" size="small" />

      <SectionTitle>Tools ({availableTools.length})</SectionTitle>
      <Box sx={{ fontSize: 11, color: 'text.secondary', maxHeight: 100, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
        {availableTools.map((t) => <div key={t.name}><Typography component="span" color="primary" fontWeight={600}>{t.name}</Typography> — {t.description}</div>)}
      </Box>

      <PermissionsPanel />
    </>
  )
}
