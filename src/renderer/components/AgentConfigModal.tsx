import React, { useState, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const AgentConfigModal: FC = () => {
  const { agentConfig, setAgentConfig, setAgentConfigOpen, availableTools } = useAppStore()
  const [localConfig, setLocalConfig] = useState(agentConfig)

  const handleSave = async () => {
    setAgentConfig(localConfig)
    await window.wordapp?.agent.configure(localConfig)
    setAgentConfigOpen(false)
  }

  return (
    <div className="modal-overlay" onClick={() => setAgentConfigOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>AI Agent Configuration</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Configure the AI endpoint for the chat assistant. Compatible with Hermes Agent, Ollama, OpenAI, and any OpenAI-compatible API.
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
