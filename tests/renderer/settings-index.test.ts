/**
 * Settings navigation and search index tests (ui-updates.md §6).
 */

import { describe, expect, it } from 'vitest'
import { SETTINGS_INDEX, SETTINGS_NAV, navLabel, searchSettings } from '../../src/renderer/settings/index'

describe('settings nav', () => {
  it('has unique view ids', () => {
    const ids = SETTINGS_NAV.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('maps every view to a label', () => {
    for (const item of SETTINGS_NAV) expect(navLabel(item.id)).toBe(item.label)
  })
})

describe('settings index', () => {
  it('only references real views', () => {
    const valid = new Set(SETTINGS_NAV.map((item) => item.id))
    for (const entry of SETTINGS_INDEX) expect(valid.has(entry.view)).toBe(true)
  })

  it('returns nothing for an empty query', () => {
    expect(searchSettings('   ')).toEqual([])
  })

  it('finds settings by label and keyword', () => {
    expect(searchSettings('spell').some((e) => e.id === 'spellcheck')).toBe(true)
    expect(searchSettings('api key').some((e) => e.id === 'api-key')).toBe(true)
    expect(searchSettings('dark').some((e) => e.id === 'theme')).toBe(true)
  })

  it('returns the matching view for a hit', () => {
    const [hit] = searchSettings('line spacing')
    expect(hit.view).toBe('editor')
  })
})
