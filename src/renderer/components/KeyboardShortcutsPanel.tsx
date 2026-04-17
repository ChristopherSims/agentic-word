import React, { useState, useMemo } from 'react'
import { useAppStore } from '../store/app-store'
import { detectConflicts, searchShortcuts, formatKeybinding, getShortcutsByCategory, validateKeybinding } from '../utils/keyboard-shortcuts'
import { getAllPresets, getPresetById } from '../utils/shortcut-presets'
import type { ShortcutBinding, ShortcutConflict } from '../utils/keyboard-shortcuts'
import './styles/keyboard-shortcuts-panel.css'

/**
 * v0.4.3 Keyboard Shortcuts Panel
 * Complete shortcut customization with presets and conflict detection
 */
export const KeyboardShortcutsPanel: React.FC = () => {
  const {
    keyboardShortcutsOpen,
    keyboardShortcuts,
    currentShortcutPreset,
    setKeyboardShortcutsOpen,
    setKeyboardShortcuts,
    setCurrentShortcutPreset,
    addToast
  } = useAppStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [editingShortcut, setEditingShortcut] = useState<ShortcutBinding | null>(null)
  const [newKeybinding, setNewKeybinding] = useState('')
  const [recordingKeys, setRecordingKeys] = useState(false)

  // Filter shortcuts
  const filteredShortcuts = useMemo(() => {
    let results = keyboardShortcuts

    // Search
    if (searchQuery) {
      results = searchShortcuts(results, searchQuery)
    }

    // Category filter
    if (selectedCategory) {
      results = getShortcutsByCategory(results, selectedCategory)
    }

    // Sort by label
    return results.sort((a, b) => a.label.localeCompare(b.label))
  }, [keyboardShortcuts, searchQuery, selectedCategory])

  // Detect conflicts
  const conflicts = useMemo(() => detectConflicts(keyboardShortcuts), [keyboardShortcuts])

  // Get unique categories
  const categories = useMemo(() => {
    return Array.from(new Set(keyboardShortcuts.map((s) => s.category))).sort()
  }, [keyboardShortcuts])

  // Apply preset
  const handleApplyPreset = (presetId: string) => {
    const preset = getPresetById(presetId)
    if (preset) {
      setKeyboardShortcuts(preset.bindings)
      setCurrentShortcutPreset(presetId)
      addToast('success', `Applied "${preset.name}" preset`)
    }
  }

  // Start editing shortcut
  const handleEditShortcut = (shortcut: ShortcutBinding) => {
    setEditingShortcut(shortcut)
    setNewKeybinding(shortcut.keybinding)
    setRecordingKeys(false)
  }

  // Record keys by listening to keyboard
  const handleStartRecording = () => {
    setRecordingKeys(true)
  }

  // Save shortcut customization
  const handleSaveShortcut = () => {
    if (!editingShortcut) return

    // Validate
    const validation = validateKeybinding(newKeybinding)
    if (!validation.valid) {
      addToast('error', `Invalid keybinding: ${validation.error}`)
      return
    }

    // Update shortcut
    const updated = keyboardShortcuts.map((s) =>
      s.id === editingShortcut.id
        ? { ...s, keybinding: newKeybinding.toLowerCase(), customized: true }
        : s
    )
    setKeyboardShortcuts(updated)

    // Check for conflicts after update
    const newConflicts = detectConflicts(updated)
    if (newConflicts.length > 0) {
      addToast('warning', `Shortcut conflict detected with ${newConflicts.length} command(s)`)
    }

    setEditingShortcut(null)
    addToast('success', `Shortcut updated: ${formatKeybinding(newKeybinding)}`)
  }

  // Reset shortcut to default
  const handleResetShortcut = (shortcut: ShortcutBinding) => {
    const updated = keyboardShortcuts.map((s) =>
      s.id === shortcut.id
        ? { ...s, keybinding: shortcut.keybinding, customized: false }
        : s
    )
    setKeyboardShortcuts(updated)
    setEditingShortcut(null)
    addToast('info', `Reset shortcut to default`)
  }

  // Handle keyboard recording
  React.useEffect(() => {
    if (!recordingKeys || !editingShortcut) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      const keys: string[] = []

      if (e.ctrlKey) keys.push('ctrl')
      if (e.shiftKey) keys.push('shift')
      if (e.altKey) keys.push('alt')
      if (e.metaKey) keys.push('cmd')

      keys.push(e.key.toLowerCase())
      setNewKeybinding(keys.join('+'))
      setRecordingKeys(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [recordingKeys, editingShortcut])

  if (!keyboardShortcutsOpen) return null

  return (
    <div className="keyboard-shortcuts-panel">
      <div className="shortcuts-header">
        <h3>Keyboard Shortcuts</h3>
        <button className="close-btn" onClick={() => setKeyboardShortcutsOpen(false)}>
          ✕
        </button>
      </div>

      <div className="shortcuts-presets">
        <h4>Preset Schemes</h4>
        <div className="preset-buttons">
          {getAllPresets().map((preset) => (
            <button
              key={preset.id}
              className={`btn btn-preset ${currentShortcutPreset === preset.id ? 'active' : ''}`}
              onClick={() => handleApplyPreset(preset.id)}
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="conflicts-warning">
          <h4>⚠️ Shortcut Conflicts ({conflicts.length})</h4>
          <ul className="conflicts-list">
            {conflicts.slice(0, 5).map((conflict) => (
              <li key={conflict.keybinding}>
                <strong>{formatKeybinding(conflict.keybinding)}</strong>
                <span className="conflict-commands">
                  {conflict.commands.map((c) => c.label).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="shortcuts-controls">
        <input
          type="text"
          placeholder="Search shortcuts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />

        <select
          value={selectedCategory || ''}
          onChange={(e) => setSelectedCategory(e.target.value || null)}
          className="category-select"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="shortcuts-list">
        {filteredShortcuts.length === 0 ? (
          <div className="empty-state">
            <p>No shortcuts found</p>
          </div>
        ) : (
          <div className="shortcuts-grid">
            {filteredShortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className={`shortcut-item ${editingShortcut?.id === shortcut.id ? 'editing' : ''}`}
              >
                {editingShortcut?.id === shortcut.id ? (
                  <div className="shortcut-editor">
                    <div className="editor-header">
                      <h5>{editingShortcut.label}</h5>
                      <button className="close-btn" onClick={() => setEditingShortcut(null)}>
                        ✕
                      </button>
                    </div>

                    <div className="editor-body">
                      <div className="keybinding-input-group">
                        <input
                          type="text"
                          value={newKeybinding}
                          onChange={(e) => setNewKeybinding(e.target.value)}
                          placeholder="e.g., ctrl+shift+s"
                          className="keybinding-input"
                        />
                        <button
                          className={`btn btn-record ${recordingKeys ? 'recording' : ''}`}
                          onClick={handleStartRecording}
                        >
                          {recordingKeys ? 'Recording...' : 'Record'}
                        </button>
                      </div>

                      <div className="editor-actions">
                        <button className="btn btn-sm btn-primary" onClick={handleSaveShortcut}>
                          Save
                        </button>
                        <button
                          className="btn btn-sm btn-link"
                          onClick={() => handleResetShortcut(editingShortcut)}
                        >
                          Reset to Default
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="shortcut-display" onClick={() => handleEditShortcut(shortcut)}>
                    <div className="shortcut-info">
                      <h5 className="shortcut-label">{shortcut.label}</h5>
                      {shortcut.description && <p className="shortcut-description">{shortcut.description}</p>}
                    </div>
                    <div className="shortcut-binding">
                      <code className={shortcut.customized ? 'customized' : ''}>
                        {formatKeybinding(shortcut.keybinding)}
                      </code>
                      {shortcut.customized && <span className="custom-badge">custom</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shortcuts-footer">
        <p className="shortcuts-tip">💡 Click any shortcut to customize it. Use Record button to capture keys.</p>
      </div>
    </div>
  )
}
