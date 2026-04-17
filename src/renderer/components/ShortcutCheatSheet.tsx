import React, { useState } from 'react'
import { useAppStore } from '../store/app-store'
import { formatKeybinding, getShortcutsByCategory } from '../utils/keyboard-shortcuts'
import type { ShortcutBinding } from '../utils/keyboard-shortcuts'
import './styles/shortcut-cheat-sheet.css'

/**
 * Shortcut Cheat Sheet Modal
 * Displays all shortcuts organized by category
 */
export const ShortcutCheatSheet: React.FC = () => {
  const { shortcutCheatSheetOpen, keyboardShortcuts, setShortcutCheatSheetOpen } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  if (!shortcutCheatSheetOpen) return null

  // Get unique categories
  const categories = Array.from(new Set(keyboardShortcuts.map((s) => s.category))).sort()

  // Get shortcuts for display
  const displayShortcuts = selectedCategory ? getShortcutsByCategory(keyboardShortcuts, selectedCategory) : keyboardShortcuts

  const groupedByCategory: Record<string, ShortcutBinding[]> = {}
  displayShortcuts.forEach((shortcut) => {
    if (!groupedByCategory[shortcut.category]) {
      groupedByCategory[shortcut.category] = []
    }
    groupedByCategory[shortcut.category].push(shortcut)
  })

  return (
    <div className="shortcut-cheat-sheet-overlay" onClick={() => setShortcutCheatSheetOpen(false)}>
      <div className="shortcut-cheat-sheet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cheat-sheet-header">
          <h2>Keyboard Shortcuts Cheat Sheet</h2>
          <button className="close-btn" onClick={() => setShortcutCheatSheetOpen(false)}>
            ✕
          </button>
        </div>

        <div className="cheat-sheet-content">
          {categories.length > 0 && (
            <div className="category-tabs">
              <button
                className={`tab ${!selectedCategory ? 'active' : ''}`}
                onClick={() => setSelectedCategory(null)}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`tab ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          )}

          <div className="shortcuts-grid-cheat">
            {Object.entries(groupedByCategory).map(([category, shortcuts]) => (
              <div key={category} className="category-section">
                <h3 className="category-title">
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </h3>
                <table className="shortcuts-table">
                  <tbody>
                    {shortcuts.map((shortcut) => (
                      <tr key={shortcut.id} className="shortcut-row">
                        <td className="shortcut-cmd">{shortcut.label}</td>
                        <td className="shortcut-key">
                          <code>{formatKeybinding(shortcut.keybinding)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <div className="cheat-sheet-footer">
          <p>Press <code>Ctrl+Shift+K</code> to open this cheat sheet anytime</p>
        </div>
      </div>
    </div>
  )
}
