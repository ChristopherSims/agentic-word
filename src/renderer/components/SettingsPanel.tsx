import React, { useState, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'
import { THEMES, ACCENT_SWATCHES, EDITOR_FONTS, SPELL_CHECK_LANGUAGES, LINE_SPACINGS, AUTO_SAVE_OPTIONS } from '../themes'

interface Preset {
  id: string
  name: string
  endpoint: string
  apiKey: string
  model: string
}

export const SettingsPanel: FC = () => {
  const {
    settingsPanelOpen, settingsPanelView,
    theme, accentColor, uiFontSize, editorFont,
    agentConfig, setAgentConfig, availableTools, agentPresets, setAgentPresets,
    agentMaxToolTurns, agentAutoApplyThreshold, agentTemperature,
    spellCheckLang, defaultFontFamily, defaultFontSize, showWordCount, lineSpacing,
    vcsDefaultBranch, vcsAutoCommitOnSave, vcsMaxCommits,
    collabDisplayName, collabCursorColor, collabMcpPort,
    setSettingsPanelOpen, setSettingsPanelView,
    setTheme, setAccentColor, setUiFontSize, setEditorFont,
    setAgentMaxToolTurns, setAgentAutoApplyThreshold, setAgentTemperature,
    setSpellCheckLang, setDefaultFontFamily, setDefaultFontSize, setShowWordCount, setLineSpacing,
    setVcsDefaultBranch, setVcsAutoCommitOnSave, setVcsMaxCommits,
    setCollabDisplayName, setCollabCursorColor, setCollabMcpPort
  } = useAppStore()

  const [localAgentConfig, setLocalAgentConfig] = useState(agentConfig)
  const [newPresetName, setNewPresetName] = useState('')

  useEffect(() => { setLocalAgentConfig(agentConfig) }, [agentConfig])

  useEffect(() => {
    window.wordapp?.agent.getPresets().then((p) => { if (p) setAgentPresets(p as Preset[]) }).catch(() => {})
  }, [])

  // Apply theme + accent color + font size to DOM
  useEffect(() => {
    const themeDef = THEMES.find((t) => t.name === theme)
    if (themeDef) {
      for (const [key, value] of Object.entries(themeDef.vars)) {
        document.documentElement.style.setProperty(key, value)
      }
    }
    if (accentColor) {
      document.documentElement.style.setProperty('--accent', accentColor)
    }
    document.documentElement.style.setProperty('font-size', `${uiFontSize}px`)
  }, [theme, accentColor, uiFontSize])

  // Apply editor font + line spacing
  useEffect(() => {
    const editor = document.querySelector('.tiptap') as HTMLElement | null
    if (editor) {
      editor.style.fontFamily = `"${editorFont}", monospace`
      editor.style.lineHeight = lineSpacing
    }
  }, [editorFont, lineSpacing])

  const handleAgentSave = async () => {
    setAgentConfig(localAgentConfig)
    await window.wordapp?.agent.configure(localAgentConfig)
  }

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return
    await window.wordapp?.agent.addPreset({ name: newPresetName, endpoint: localAgentConfig.endpoint, apiKey: localAgentConfig.apiKey, model: localAgentConfig.model })
    const presets = await window.wordapp?.agent.getPresets()
    if (presets) setAgentPresets(presets as Preset[])
    setNewPresetName('')
  }

  const handleApplyPreset = async (id: string) => {
    const config = await window.wordapp?.agent.applyPreset(id)
    if (config) {
      const c = config as { endpoint: string; apiKey: string; model: string }
      setLocalAgentConfig(c)
      setAgentConfig(c)
    }
  }

  const handleDeletePreset = async (id: string) => {
    await window.wordapp?.agent.deletePreset(id)
    const presets = await window.wordapp?.agent.getPresets()
    if (presets) setAgentPresets(presets as Preset[])
  }

  const tabs = ['appearance', 'agent', 'editor', 'vcs', 'collab', 'keybindings'] as const
  const tabLabels: Record<string, string> = { appearance: 'Appearance', agent: 'Agent', editor: 'Editor', vcs: 'VCS', collab: 'Collab', keybindings: 'Keys' }

  if (!settingsPanelOpen) return null

  return (
    <div className="vcs-panel open">
      <div className="vcs-panel-header">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`btn ${settingsPanelView === tab ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSettingsPanelView(tab)}
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
        <button className="toolbar-btn" onClick={() => setSettingsPanelOpen(false)} style={{ width: 24, height: 24 }}>✕</button>
      </div>

      <div className="vcs-panel-body">
        {settingsPanelView === 'appearance' && (
          <div>
            <SectionTitle>Theme</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {THEMES.map((t) => (
                <div
                  key={t.name}
                  className={`template-card${theme === t.name ? ' selected' : ''}`}
                  onClick={() => setTheme(t.name)}
                >
                  <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.vars['--bg-primary'] }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.vars['--accent'] }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.vars['--success'] }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.vars['--danger'] }} />
                  </div>
                  <div className="template-card-name" style={{ fontSize: 11 }}>{t.label}</div>
                </div>
              ))}
            </div>

            <SectionTitle>Accent Color</SectionTitle>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {ACCENT_SWATCHES.map((s) => (
                <button
                  key={s.name}
                  className="toolbar-btn"
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: s.color,
                    border: accentColor === s.color ? '2px solid var(--text-primary)' : '2px solid transparent',
                    flexShrink: 0
                  }}
                  onClick={() => setAccentColor(accentColor === s.color ? '' : s.color)}
                  title={s.name}
                />
              ))}
              <label className="toolbar-color-picker" title="Custom accent color" style={{ width: 28, height: 28 }}>
                <span className="toolbar-color-icon" style={{ fontSize: 14, color: accentColor || 'var(--accent)' }}>◆</span>
                <input type="color" value={accentColor || '#89b4fa'} onChange={(e) => setAccentColor(e.target.value)} />
              </label>
            </div>

            <SectionTitle>UI Font Size</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input type="range" min={12} max={18} step={1} value={uiFontSize} onChange={(e) => setUiFontSize(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 30 }}>{uiFontSize}px</span>
            </div>

            <SectionTitle>Editor Font</SectionTitle>
            <select className="toolbar-select" style={{ width: '100%' }} value={editorFont} onChange={(e) => setEditorFont(e.target.value)}>
              {EDITOR_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}

        {settingsPanelView === 'agent' && (
          <div>
            <SectionTitle>API Configuration</SectionTitle>
            <label style={fieldLabelStyle}>Endpoint</label>
            <input style={fieldInputStyle} value={localAgentConfig.endpoint} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, endpoint: e.target.value })} placeholder="http://localhost:11434/v1" />

            <label style={fieldLabelStyle}>API Key</label>
            <input style={fieldInputStyle} type="password" value={localAgentConfig.apiKey} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, apiKey: e.target.value })} placeholder="Leave empty for local models" />

            <label style={fieldLabelStyle}>Model</label>
            <input style={fieldInputStyle} value={localAgentConfig.model} onChange={(e) => setLocalAgentConfig({ ...localAgentConfig, model: e.target.value })} placeholder="hermes3, gpt-4, llama3" />

            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleAgentSave}>Save Agent Config</button>

            <SectionTitle>Presets</SectionTitle>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input className="chat-input" style={{ flex: 1, fontSize: 12 }} value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Preset name..." onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset() }} />
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleSavePreset}>Save</button>
            </div>
            {agentPresets.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--bg-surface)' }}>
                <span style={{ flex: 1, fontSize: 12 }}><strong>{p.name}</strong> <span style={{ color: 'var(--text-muted)' }}>{p.model}</span></span>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleApplyPreset(p.id)}>Apply</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)' }} onClick={() => handleDeletePreset(p.id)}>✕</button>
              </div>
            ))}

            <SectionTitle>Tool Chain Turns</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="range" min={1} max={10} step={1} value={agentMaxToolTurns} onChange={(e) => setAgentMaxToolTurns(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agentMaxToolTurns}</span>
            </div>

            <SectionTitle>Auto-Apply Threshold</SectionTitle>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Auto-apply agent changes without review when confidence exceeds this value. 0 = always require review.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="range" min={0} max={100} step={5} value={agentAutoApplyThreshold} onChange={(e) => setAgentAutoApplyThreshold(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agentAutoApplyThreshold}%</span>
            </div>

            <SectionTitle>Temperature</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="range" min={0} max={2} step={0.1} value={agentTemperature} onChange={(e) => setAgentTemperature(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agentTemperature.toFixed(1)}</span>
            </div>

            <SectionTitle>Tools ({availableTools.length})</SectionTitle>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', maxHeight: 100, overflow: 'auto', background: 'var(--bg-surface)', padding: 8, borderRadius: 4 }}>
              {availableTools.map((t) => <div key={t.name}><span style={{ color: 'var(--accent)' }}>{t.name}</span> — {t.description}</div>)}
            </div>
          </div>
        )}

        {settingsPanelView === 'editor' && (
          <div>
            <SectionTitle>Auto-Save Interval</SectionTitle>
            <select className="toolbar-select" style={{ width: '100%', marginBottom: 12 }} value={useAppStore.getState().autoSaveIntervalMs} onChange={(e) => setAutoSaveInterval(Number(e.target.value))}>
              {AUTO_SAVE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <SectionTitle>Spell Check Language</SectionTitle>
            <select className="toolbar-select" style={{ width: '100%', marginBottom: 12 }} value={spellCheckLang} onChange={(e) => setSpellCheckLang(e.target.value)}>
              {SPELL_CHECK_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>

            <SectionTitle>Default Font Family</SectionTitle>
            <select className="toolbar-select" style={{ width: '100%', marginBottom: 12 }} value={defaultFontFamily} onChange={(e) => setDefaultFontFamily(e.target.value)}>
              <option value="">(inherit from toolbar)</option>
              {['Arial', 'Calibri', 'Cambria', 'Consolas', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana'].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>

            <SectionTitle>Default Font Size</SectionTitle>
            <select className="toolbar-select" style={{ width: '100%', marginBottom: 12 }} value={defaultFontSize} onChange={(e) => setDefaultFontSize(e.target.value)}>
              {['12px', '14px', '16px', '18px', '20px', '24px'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <SectionTitle>Line Spacing</SectionTitle>
            <select className="toolbar-select" style={{ width: '100%', marginBottom: 12 }} value={lineSpacing} onChange={(e) => setLineSpacing(e.target.value)}>
              {LINE_SPACINGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>

            <SectionTitle>Show Word Count</SectionTitle>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={showWordCount} onChange={(e) => setShowWordCount(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Display word/char count in footer</span>
            </label>
          </div>
        )}

        {settingsPanelView === 'vcs' && (
          <div>
            <SectionTitle>Default Branch Name</SectionTitle>
            <input style={fieldInputStyle} value={vcsDefaultBranch} onChange={(e) => setVcsDefaultBranch(e.target.value)} placeholder="main" />

            <SectionTitle>Auto-Commit on Save</SectionTitle>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={vcsAutoCommitOnSave} onChange={(e) => setVcsAutoCommitOnSave(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Automatically create a VCS commit when saving</span>
            </label>

            <SectionTitle>Max Commits Retained</SectionTitle>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Prune oldest commits when exceeded. 0 = unlimited.</p>
            <input type="number" style={fieldInputStyle} value={vcsMaxCommits || ''} onChange={(e) => setVcsMaxCommits(Number(e.target.value) || 0)} placeholder="0 = unlimited" min={0} />
          </div>
        )}

        {settingsPanelView === 'collab' && (
          <div>
            <SectionTitle>Display Name</SectionTitle>
            <input style={fieldInputStyle} value={collabDisplayName} onChange={(e) => setCollabDisplayName(e.target.value)} placeholder="Your name" />

            <SectionTitle>Cursor Color</SectionTitle>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="color" value={collabCursorColor} onChange={(e) => setCollabCursorColor(e.target.value)} style={{ width: 40, height: 28 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{collabCursorColor}</span>
            </div>

            <SectionTitle>MCP Server Port</SectionTitle>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>For future WebSocket-based real-time collaboration. 0 = disabled.</p>
            <input type="number" style={fieldInputStyle} value={collabMcpPort || ''} onChange={(e) => setCollabMcpPort(Number(e.target.value) || 0)} placeholder="0 = disabled" min={0} max={65535} />
          </div>
        )}

        {settingsPanelView === 'keybindings' && (
          <div>
            <SectionTitle>Keyboard Shortcuts</SectionTitle>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Customizable keybindings coming in v0.3.0+</p>
            <div style={{ fontSize: 11, maxHeight: 300, overflow: 'auto' }}>
              {[
                ['Ctrl+N', 'New Document'],
                ['Ctrl+O', 'Open File'],
                ['Ctrl+S', 'Save'],
                ['Ctrl+Shift+S', 'Save As'],
                ['Ctrl+Shift+E', 'Export PDF'],
                ['Ctrl+P', 'Print'],
                ['Ctrl+F', 'Find'],
                ['Ctrl+H', 'Find & Replace'],
                ['Ctrl+Shift+P', 'Command Palette'],
                ['Ctrl+,', 'Settings'],
                ['Ctrl+Shift+G', 'VCS Commit'],
                ['Enter', 'Accept pending change'],
                ['Escape', 'Reject pending change / close panel'],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--bg-surface)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
                  <span style={{ fontFamily: "'Cascadia Code', monospace", color: 'var(--accent)' }}>{key}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 6 }}>{children}</div>
}

const fieldLabelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2, marginTop: 8 }
const fieldInputStyle: React.CSSProperties = { width: '100%', fontSize: 12, padding: '4px 8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 8, outline: 'none' }
