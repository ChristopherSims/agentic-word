/**
 * §D: legacy shared Mnesis store detection + confined, gated retirement.
 */

import { describe, expect, it } from 'vitest'
import { classifyLegacySessions, legacyMnesisDbPath, removeLegacyMnesisStore, legacyMessagesToEvents } from '../../src/main/memory/legacy-mnesis'

describe('legacy Mnesis store (§D)', () => {
  it('classifies sessions as attributable or anonymous without guessing', () => {
    const plan = classifyLegacySessions(
      [
        { sessionId: 's1', agent: 'doc-known' },
        { sessionId: 's2', agent: 'Writer' },       // legacy agent name, no document
        { sessionId: 's3', agent: null },
        { sessionId: 's4', agent: 'doc-known' }
      ],
      ['doc-known']
    )
    expect(plan.attributable.map((s) => s.sessionId)).toEqual(['s1', 's4'])
    expect(plan.anonymous.map((s) => s.sessionId)).toEqual(['s2', 's3'])
  })

  it('resolves the conventional shared-store path', () => {
    expect(legacyMnesisDbPath('C:/users/x').replace(/\\/g, '/')).toBe('C:/users/x/mnesis/sessions.db')
  })

  it('removes the store and its sidecars', () => {
    const present = new Set([
      'C:/u/mnesis/sessions.db',
      'C:/u/mnesis/sessions.db-wal',
      'C:/u/mnesis/sessions.db-shm'
    ])
    const removed: string[] = []
    const result = removeLegacyMnesisStore('C:/u/mnesis/sessions.db', {
      exists: (p) => present.has(p.replace(/\\/g, '/')),
      remove: (p) => removed.push(p.replace(/\\/g, '/'))
    })
    expect(result.removed.map((p) => p.replace(/\\/g, '/')).sort()).toEqual([
      'C:/u/mnesis/sessions.db',
      'C:/u/mnesis/sessions.db-shm',
      'C:/u/mnesis/sessions.db-wal'
    ])
    expect(removed).toHaveLength(3)
  })

  it('refuses to remove a store outside a mnesis directory', () => {
    expect(() => removeLegacyMnesisStore('C:/u/important/sessions.db', { exists: () => true, remove: () => {} }))
      .toThrow(/outside a mnesis directory/)
  })

  it('converts legacy messages to deterministic, turn-paired events', () => {
    const messages = [
      { role: 'system', content: 'config' },
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' }
    ]
    const events = legacyMessagesToEvents('doc-1', 'sess-1', messages, 5)
    expect(events.map((e) => e.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(events[0].eventId).toBe('legacy_sess-1_1') // index 0 was the system message
    expect(events[0].provenance).toBe('legacy-session')
    expect(events[0].turnId).toBe('legacy_turn_sess-1_0')
    expect(events[1].turnId).toBe('legacy_turn_sess-1_0')
    expect(events[2].turnId).toBe('legacy_turn_sess-1_1')
    // Deterministic ids → idempotent re-import.
    expect(legacyMessagesToEvents('doc-1', 'sess-1', messages, 9).map((e) => e.eventId))
      .toEqual(events.map((e) => e.eventId))
  })
})
