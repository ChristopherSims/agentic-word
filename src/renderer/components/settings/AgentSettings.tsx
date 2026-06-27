import React, { useState, useEffect, useRef, type FC } from 'react'
import { Box, Typography, TextField, Button, Slider, Switch, FormControlLabel, List, ListItem, ListItemText, IconButton, Select, MenuItem, FormControl, InputLabel, CircularProgress, Alert, Tooltip, Divider } from '@mui/material'
import ApplyIcon from '@mui/icons-material/Check'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import SpeedIcon from '@mui/icons-material/Speed'
import { useAppStore } from '../../store/app-store'
import { validateInput } from '../../utils'
import { PermissionsPanel } from '../PermissionsPanel'
import { getBuiltinProviders as getProviders, type ProviderDef, type ModelInfo } from '../../../shared/providers'

interface Preset { id: any; name: any; endpoint: any; apiKey: any; model: any }

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} sx={{ mt: 1.5, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{children}</Typography>
)

export const AgentSettings: FC = () => {
  const {
    agentConfig, ollamaFormat, setAgentConfig, setOllamaFormat, availableTools, agentPresets, setAgentPresets,
    agentMaxToolTurns, agentAutoApplyThreshold, agentTemperature,
    setAgentMaxToolTurns, setAgentAutoApplyThreshold, setAgentTemperature,
    selectedProviderId, setSelectedProviderId,
    availableModels, modelsLoading, modelsError,
    setAvailableModels, setModelsLoading, setModelsError,
    connectionTestResult, connectionTesting,
    setConnectionTestResult, setConnectionTesting,
    manualConfigMode, setManualConfigMode,
    addToast
  } = useAppStore()

  const [localAgentConfig, setLocalAgentConfig] = useState(agentConfig)
  const [newPresetName, setNewPresetName] = useState('')
  const [providers] = useState<ProviderDef[]>(() => getProviders())
  const [selectedModel, setSelectedModel] = useState(agentConfig.model)
  const lastFetchedProviderRef = useRef<string | null>(null)

  const currentProvider = providers.find(p => p.id === selectedProviderId) || providers[0]

  useEffect(() => { setLocalAgentConfig(agentConfig) }, [agentConfig])

  useEffect(() => {
    window.wordapp?.agent.getConfig?.().then((config: any) => {
      if (config && (config.endpoint || config.apiKey || config.model)) setLocalAgentConfig(config)
    }).catch((err: any) => console.warn('[AgentSettings] Failed to load config:', err))
    if (agentPresets.length === 0) {
      window.wordapp?.agent.getPresets().then((p) => { if (p && p.length > 0) setAgentPresets(p as Preset[]) }).catch((err) => addToast('warning', `Failed to load agent presets: ${(err as Error).message}`))
    }
  }, [])

  const fetchModels = async () => {
    if (!currentProvider) return
    lastFetchedProviderRef.current = selectedProviderId
    setModelsLoading(true)
    setModelsError(null)
    try {
      const result = await window.wordapp?.agent.fetchModels(
        selectedProviderId,
        currentProvider.baseUrl,
        localAgentConfig.apiKey
      )
      if (result?.error) {
        setModelsError(result.error)
        setAvailableModels([])
      } else {
        setAvailableModels(result?.models || [])
      }
    } catch (err: any) {
      setModelsError(err.message || 'Failed to fetch models')
      setAvailableModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  // Only auto-fetch when user manually changes provider via dropdown
  const handleProviderChange = (providerId: any) => {
    setSelectedProviderId(providerId)
    const provider = providers.find(p => p.id === providerId)
    if (provider) {
      // Update endpoint based on provider's chat URL
      const newConfig = { ...localAgentConfig, endpoint: provider.baseUrl + provider.chatUrl }
      setLocalAgentConfig(newConfig)
    }
    // Fetch models for the newly selected provider (only if not in manual mode)
    if (!manualConfigMode && providerId !== lastFetchedProviderRef.current) {
      // Use setTimeout to let the store update propagate first
      setTimeout(() => fetchModelsForProvider(providerId), 0)
    }
  }

  const fetchModelsForProvider = async (providerId: any) => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider) return
    lastFetchedProviderRef.current = providerId
    setModelsLoading(true)
    setModelsError(null)
    try {
      const result = await window.wordapp?.agent.fetchModels(
        providerId,
        provider.baseUrl,
        localAgentConfig.apiKey
      )
      if (result?.error) {
        setModelsError(result.error)
        setAvailableModels([])
      } else {
        setAvailableModels(result?.models || [])
      }
    } catch (err: any) {
      setModelsError(err.message || 'Failed to fetch models')
      setAvailableModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!currentProvider) return
    setConnectionTesting(true)
    setConnectionTestResult(null)
    try {
      const result = await window.wordapp?.agent.testConnection(
        selectedProviderId,
        currentProvider.baseUrl,
        localAgentConfig.apiKey
      )
      setConnectionTestResult(result)
      if (result?.success) {
        addToast('success', 'Connection successful!')
      } else {
        addToast('error', result?.error || 'Connection failed')
      }
    } catch (err: any) {
      setConnectionTestResult({ success: false, error: err.message })
      addToast('error', err.message)
    } finally {
      setConnectionTesting(false)
    }
  }

  const handleModelChange = (modelId: any) => {
    setSelectedModel(modelId)
    setLocalAgentConfig({ ...localAgentConfig, model: modelId })
  }

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

  const handleApplyPreset = async (id: any) => {
    const config = await window.wordapp?.agent.applyPreset(id)
    if (config) { const c = config as any; setLocalAgentConfig(c); setAgentConfig(c) }
  }

  const handleDeletePreset = async (id: any) => {
    await window.wordapp?.agent.deletePreset(id)
    const p = await window.wordapp?.agent.getPresets(); if (p) setAgentPresets(p as Preset[])
  }

  return (
    <>
      <SectionTitle>Provider</SectionTitle>
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Provider</InputLabel>
          <Select value={selectedProviderId} onChange={(e) => handleProviderChange(e.target.value)} label="Provider">
            {providers.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2">{p.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.description}</Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Test Connection">
          <IconButton onClick={handleTestConnection} disabled={connectionTesting} size="small" sx={{ mt: 0.5 }}>
            {connectionTesting ? <CircularProgress size={20} /> : <SpeedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {connectionTestResult && (
        <Alert severity={connectionTestResult.success ? 'success' : 'error'} sx={{ mb: 1, py: 0.5 }} onClose={() => setConnectionTestResult(null)}>
          {connectionTestResult.success ? connectionTestResult.message : connectionTestResult.error}
        </Alert>
      )}

      <FormControlLabel
        control={<Switch checked={manualConfigMode} onChange={(e) => setManualConfigMode(e.target.checked)} size="small" />}
        label={<Typography variant="caption">Manual configuration mode (bypass model browser)</Typography>}
        sx={{ mb: 1 }}
      />

      {!manualConfigMode && (
        <>
          <SectionTitle>Model</SectionTitle>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Model</InputLabel>
              <Select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                label="Model"
                disabled={modelsLoading || availableModels.length === 0}
              >
                {availableModels.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2">{m.name}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Refresh models">
              <IconButton onClick={fetchModels} disabled={modelsLoading} size="small" sx={{ mt: 0.5 }}>
                {modelsLoading ? <CircularProgress size={20} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
          {modelsError && <Alert severity="warning" sx={{ mb: 1, py: 0.5 }}>{modelsError}</Alert>}
          {availableModels.length === 0 && !modelsLoading && !modelsError && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              No models found. Click refresh or switch to manual mode.
            </Typography>
          )}
        </>
      )}

      {manualConfigMode && (
        <>
          <SectionTitle>Manual Configuration</SectionTitle>
          <TextField fullWidth size="small" label="Endpoint" value={localAgentConfig.endpoint} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, endpoint: e.target.value })} placeholder="http://localhost:11434/v1/chat/completions" sx={{ mb: 1 }} />
          <TextField fullWidth size="small" label="Model" value={localAgentConfig.model} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, model: e.target.value })} placeholder="hermes3, gpt-4, llama3" sx={{ mb: 1 }} />
        </>
      )}

      <TextField fullWidth size="small" label="API Key" type="password" value={localAgentConfig.apiKey} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, apiKey: e.target.valueue })} placeholder="Leave empty for local models" sx={{ mb: 1 }} />
      <FormControlLabel control={<Switch checked={ollamaFormat} onChange={(e) => setOllamaFormat(e.target.checked)} size="small" />} label={<Typography variant="caption">Ollama native API format</Typography>} sx={{ mb: 1 }} />

      <TextField fullWidth size="small" label="Fast Model (grammar/suggestions)" value={localAgentConfig.fastModel || ''} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, fastModel: e.target.value || undefined })} placeholder="e.g. qwen3:3b" sx={{ mb: 1 }} />
      <TextField fullWidth size="small" label="Smart Model (chat/writing)" value={localAgentConfig.smartModel || ''} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, smartModel: e.target.value || undefined })} placeholder="e.g. qwen3.5:27b" sx={{ mb: 1 }} />

      <Button fullWidth variant="contained" size="small" onClick={handleAgentSave}>Save Agent Config</Button>

      <Divider sx={{ my: 1 }} />

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
      <TextField type="number" size="small" fullWidth value={agentMaxToolTurns} onChange={(e) => { const v = parseInt(e.target.value) || 1; setAgentMaxToolTurns(Math.min(Math.max(v, 1), 99)) }} inputProps={{ min: 1, max: 99, defaultValue: 10 }} sx={{ mb: 1 }} />

      <SectionTitle>Auto-Apply Threshold</SectionTitle>
      <TextField type="number" size="small" fullWidth value={agentAutoApplyThreshold} onChange={(e) => { const v = parseInt(e.target.value) || 0; setAgentAutoApplyThreshold(Math.min(Math.max(v, 0), 100)) }} inputProps={{ min: 0, max: 100, step: 1 }} helperText="(0 = always require review, 100 = never review)" sx={{ mb: 1 }} />

      <SectionTitle>Temperature</SectionTitle>
      <TextField type="number" size="small" fullWidth value={agentTemperature} onChange={(e) => { const v = parseFloat(e.target.value) || 0.01; setAgentTemperature(Math.min(Math.max(v, 0.01), 1)) }} inputProps={{ min: 0.01, max: 1, step: 0.01 }} sx={{ mb: 1 }} />

      <SectionTitle>Tools ({availableTools.length})</SectionTitle>
      <Box sx={{ fontSize: 11, color: 'text.secondary', maxHeight: 100, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
        {availableTools.map((t) => <div key={t.name}><Typography component="span" color="primary" fontWeight={600}>{t.name}</Typography> — {t.description}</div>)}
      </Box>

      <PermissionsPanel />
    </>
  )
}
