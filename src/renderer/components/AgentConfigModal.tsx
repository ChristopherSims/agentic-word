import React, { useState, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

interface Preset {
  id: string
  name: string
  endpoint: string
  apiKey: string
  model: string
}

export const AgentConfigModal: FC = () => {
  const { agentConfig, setAgentConfig, setAgentConfigOpen, availableTools, agentPresets, setAgentPresets } = useAppStore()
  const [localConfig, setLocalConfig] = useState(agentConfig)
  const [newPresetName, setNewPresetName] = useState('')

  useEffect(() => {
    window.wordapp?.agent.getPresets().then((presets) => {
      if (presets) setAgentPresets(presets as Preset[])
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setAgentConfig(localConfig)
    await window.wordapp?.agent.configure(localConfig)
    setAgentConfigOpen(false)
  }

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return
    const preset = await window.wordapp?.agent.addPreset({
      name: newPresetName,
      endpoint: localConfig.endpoint,
      apiKey: localConfig.apiKey,
      model: localConfig.model
    })
    if (preset) {
      const presets = await window.wordapp?.agent.getPresets()
      if (presets) setAgentPresets(presets as Preset[])
      setNewPresetName('')
    }
  }

  const handleApplyPreset = async (id: string) => {
    const config = await window.wordapp?.agent.applyPreset(id)
    if (config) {
      setLocalConfig(config as { endpoint: string; apiKey: string; model: string })
      setAgentConfig(config as { endpoint: string; apiKey: string; model: string })
    }
  }

  const handleDeletePreset = async (id: string) => {
    await window.wordapp?.agent.deletePreset(id)
    const presets = await window.wordapp?.agent.getPresets()
    if (presets) setAgentPresets(presets as Preset[])
  }

  return (
    <div className="modal-overlay" onClick={() => setAgentConfigOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>AI Agent Configuration</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Configure the AI endpoint. Compatible with Hermes Agent, Ollama, OpenAI, and any OpenAI-compatible API.
        </p>

        <label>API Endpoint</label>
        <input
          value={localConfig.endpoint}
          onChange={(e) => setLocalConfig({ ...localConfig, endpoint: e.target.value })}
          placeholder="http://localhost:11434/v1"
        />

        <label>API Key (optional)</label>
        <input
          type="password"
          value={localConfig.apiKey}
          onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
          placeholder="Leave empty for local models"
        />

        <label>Model Name</label>
        <input
          value={localConfig.model}
          onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
          placeholder="hermes3, gpt-4, llama3, etc."
        />

        {/* Presets */}
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Presets</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 8 }}>
            <input
              className="chat-input"
              style={{ flex: 1, fontSize: 12 }}
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Preset name..."
              onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset() }}
            />
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleSavePreset}>
              Save Preset
            </button>
          </div>
          {agentPresets.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--bg-surface)' }}>
              <span style={{ flex: 1, fontSize: 12 }}>
                <strong>{p.name}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{p.model}</span>
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleApplyPreset(p.id)}>
                Apply
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)' }} onClick={() => handleDeletePreset(p.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, padding: 10, background: 'var(--bg-surface)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Available Tools ({availableTools.length}):
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxHeight: 120, overflow: 'auto' }}>
            {availableTools.map((t) => (
              <div key={t.name} style={{ marginBottom: 2 }}>
                <span style={{ color: 'var(--accent)' }}>{t.name}</span> — {t.description}
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setAgentConfigOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
