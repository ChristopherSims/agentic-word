/**
 * §12 steps 7/9/12 (migration sessions + backups) and §11 consent tests.
 */

import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { sessionToHistoricalEvents, planProjectionRebuild, LEGACY_SESSION_PROVENANCE, type HistoricalEvent } from '../../src/main/memory/migration-sessions'
import { CONSENT_BOUNDARIES, DEFAULT_CONSENT, effectiveConsent, isLocalEndpoint } from '../../src/main/memory/consent'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import type { AgentSession } from '../../src/shared/types'

const makeSession = (overrides: Partial<AgentSession> = {}): AgentSession => ({
  id: 'doc-1:Writer',
  documentId: 'doc-1',
  agentName: 'Writer',
  systemPrompt: 'You are a writer.',
  messages: [
    { role: 'system', content: 'You are a writer.' },
    { role: 'user', content: 'Continue the chapter' },
    { role: 'assistant', content: 'The keeper wrote the tide ledger.' },
    { role: 'user', content: '' },
    { role: 'assistant', content: 'Orphaned reply without a user turn' },
    { role: 'tool', content: '{"result": "not executable anyway"}' }
  ],
  createdAt: 1_000,
  updatedAt: 2_000
})

describe('migration step 7 — sessions as historical events', () => {
  it('converts messages to provenance-labeled events and skips empties/system', () => {
    const events = sessionToHistoricalEvents(makeSession())
    // system prompt, empty user turn excluded; tool role kept as an event
    // (text payload only — nothing executable) but not projection-eligible.
    expect(events.map((e) => e.role)).toEqual(['user', 'assistant', 'assistant', 'tool'])
    for (const event of events) {
      expect(event.provenance).toBe(LEGACY_SESSION_PROVENANCE)
      expect(event.revisionKnown).toBe(false)
      expect(event.toolEvidence).toBe(false)
      expect(event.documentId).toBe('doc-1')
      expect(event.timestamp).toBe(2_000) // session-level bound, honestly labeled
    }
  })

  it('is idempotent by deterministic event ids', () => {
    const a = sessionToHistoricalEvents(makeSession())
    const b = sessionToHistoricalEvents(makeSession())
    expect(a.map((e) => e.eventId)).toEqual(b.map((e) => e.eventId))
    expect(new Set(a.map((e) => e.eventId)).size).toBe(a.length)
  })

  it('store import dedupes by eventId and persists', () => {
    const file = path.join(os.tmpdir(), `agent-memory-hist-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    try {
      const store = new AgentMemoryStore(file)
      const events = sessionToHistoricalEvents(makeSession())
      expect(store.importHistoricalEvents(events)).toBe(events.length)
      expect(store.importHistoricalEvents(events)).toBe(0) // idempotent
      expect(store.historicalEventsFor('doc-1')).toHaveLength(events.length)
      // Persists across reload.
      const reloaded = new AgentMemoryStore(file)
      expect(reloaded.historicalEventsFor('doc-1')).toHaveLength(events.length)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
})

describe('migration step 9 — projection rebuild planning', () => {
  it('pairs user/assistant turns in order and counts every skip', () => {
    const events = sessionToHistoricalEvents(makeSession())
    const { turns, skipped, projectedEventIds } = planProjectionRebuild(events)
    expect(turns).toEqual([{ user: 'Continue the chapter', assistant: 'The keeper wrote the tide ledger.' }])
    // orphaned assistant + tool role are skipped and counted
    expect(skipped.orphan).toBe(1)
    expect(skipped.unexpectedRole).toBe(1)
    expect(projectedEventIds).toHaveLength(2)
  })

  it('never rebuilds suppressed content (§11: forgotten stays forgotten)', () => {
    const events = sessionToHistoricalEvents(makeSession())
    const { turns, skipped } = planProjectionRebuild(events, (content) => content.includes('tide ledger'))
    expect(turns).toHaveLength(0)
    expect(skipped.suppressed).toBeGreaterThanOrEqual(2) // user turn + suppressed pair
  })

  it('does not replay already-projected events', () => {
    const events = sessionToHistoricalEvents(makeSession()).map((e) =>
      e.role === 'user' ? { ...e, projected: true } : e
    )
    const { turns, skipped } = planProjectionRebuild(events)
    expect(turns).toHaveLength(0)
    expect(skipped.projected).toBeGreaterThanOrEqual(1)
  })

  it('store marks events projected and survives reload', () => {
    const file = path.join(os.tmpdir(), `agent-memory-proj-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    try {
      const store = new AgentMemoryStore(file)
      const events = sessionToHistoricalEvents(makeSession())
      store.importHistoricalEvents(events)
      const { projectedEventIds } = planProjectionRebuild(store.historicalEventsFor('doc-1'))
      store.markEventsProjected(projectedEventIds)
      expect(store.allHistoricalEvents().filter((e) => e.projected)).toHaveLength(projectedEventIds.length)
      // Re-planning now finds nothing new.
      const second = planProjectionRebuild(store.historicalEventsFor('doc-1'))
      expect(second.turns).toHaveLength(0)
      const reloaded = new AgentMemoryStore(file)
      expect(reloaded.allHistoricalEvents().filter((e) => e.projected)).toHaveLength(projectedEventIds.length)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
})

describe('R15 — explicit turn identity', () => {
  const event = (overrides: Partial<HistoricalEvent>): HistoricalEvent => ({
    eventId: 'e', documentId: 'doc-1', sessionId: 's', agentName: 'a', role: 'user',
    content: 'x', timestamp: 1, provenance: 'live', revisionKnown: false, toolEvidence: false,
    ...overrides
  })

  it('assigns one shared turn id to a user/assistant pair', () => {
    const events = sessionToHistoricalEvents(makeSession())
    const user = events.find((e) => e.role === 'user' && e.content.includes('Continue'))
    const assistant = events.find((e) => e.content.includes('tide ledger'))
    expect(user?.turnId).toBeTruthy()
    expect(assistant?.turnId).toBe(user?.turnId)
  })

  it('pairs by turn id, never by array position', () => {
    // Turn t1's assistant is missing; without identity, adjacency would pair
    // Q2 (t2) with A1 (t1). Explicit turn ids must refuse that.
    const events = [
      event({ eventId: 'u1', role: 'user', content: 'Q1', turnId: 't1' }),
      event({ eventId: 'u2', role: 'user', content: 'Q2', turnId: 't2' }),
      event({ eventId: 'a1', role: 'assistant', content: 'A1', turnId: 't1' }),
      event({ eventId: 'a2', role: 'assistant', content: 'A2', turnId: 't2' })
    ]
    const { turns } = planProjectionRebuild(events)
    expect(turns).toEqual([]) // no cross-turn misassociation
  })

  it('pairs explicit-turn user/assistant even when reordered into a pair', () => {
    const events = [
      event({ eventId: 'u2', role: 'user', content: 'Q2', turnId: 't2' }),
      event({ eventId: 'a2', role: 'assistant', content: 'A2', turnId: 't2' })
    ]
    expect(planProjectionRebuild(events).turns).toEqual([{ user: 'Q2', assistant: 'A2' }])
  })

  it('falls back to adjacency only for events without turn ids', () => {
    const events = [
      event({ eventId: 'u', role: 'user', content: 'Q' }),
      event({ eventId: 'a', role: 'assistant', content: 'A' })
    ]
    expect(planProjectionRebuild(events).turns).toEqual([{ user: 'Q', assistant: 'A' }])
  })

  it('retains only user/assistant events for a live turn (tool groups not retained)', () => {
    const file = path.join(os.tmpdir(), `agent-memory-turnlive-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    try {
      const store = new AgentMemoryStore(file)
      // commitRetainedTurn has no tool-output parameter: live tool calls/results
      // are never retained as canonical events, so tool-group identity cannot be
      // misassociated — turn identity fully covers R15 for live history.
      const { userEventId, assistantEventId } = store.commitRetainedTurn('doc-1', 'doc-1:Writer', 'Q', 'A')
      const roles = store.historicalEventsFor('doc-1').map((e) => e.role).sort()
      expect(roles).toEqual(['assistant', 'user'])
      expect(planProjectionRebuild(store.historicalEventsFor('doc-1')).turns).toEqual([{ user: 'Q', assistant: 'A' }])
      expect(userEventId).toBeTruthy()
      expect(assistantEventId).toBeTruthy()
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  it('round-trips turnId through the ledger', () => {    const file = path.join(os.tmpdir(), `agent-memory-turnid-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    try {
      const store = new AgentMemoryStore(file)
      const { userEventId, assistantEventId } = store.commitRetainedTurn('doc-1', 'doc-1:Writer', 'hi', 'there')
      const all = store.allHistoricalEvents()
      const user = all.find((e) => e.eventId === userEventId)
      const assistant = all.find((e) => e.eventId === assistantEventId)
      expect(user?.turnId).toBeTruthy()
      expect(assistant?.turnId).toBe(user?.turnId)

      const reloaded = new AgentMemoryStore(file)
      const persisted = reloaded.allHistoricalEvents()
      expect(persisted.find((e) => e.eventId === userEventId)?.turnId).toBe(user?.turnId)
      expect(persisted.find((e) => e.eventId === assistantEventId)?.turnId).toBe(user?.turnId)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
})

describe('migration step 12 — explicit backup removal', () => {
  it('lists and removes only strictly-named backup files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'))
    const file = path.join(dir, 'agent-memory.json')
    try {
      fs.writeFileSync(file, '{"meta":{"schemaVersion":2},"entries":[]}')
      const backup = `${file}.backup-1700000000000`
      fs.writeFileSync(backup, 'legacy data')
      const impostor = `${file}.backup-evil`
      fs.writeFileSync(impostor, 'not a real backup')

      const store = new AgentMemoryStore(file)
      expect(store.listMigrationBackups().map((b) => b.name)).toEqual(['agent-memory.json.backup-1700000000000'])
      // Impostor names are refused…
      expect(store.removeMigrationBackup('agent-memory.json.backup-evil')).toBe(false)
      expect(store.removeMigrationBackup('agent-memory.json')).toBe(false)
      expect(store.removeMigrationBackup('../agent-memory.json.backup-1')).toBe(false)
      // …the real one is removed by explicit action.
      expect(store.removeMigrationBackup('agent-memory.json.backup-1700000000000')).toBe(true)
      expect(fs.existsSync(backup)).toBe(false)
      expect(fs.existsSync(file)).toBe(true) // canonical store untouched
      expect(store.listMigrationBackups()).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('§11 consolidated consent', () => {
  it('defines exactly the seven plan boundaries in order', () => {
    expect(CONSENT_BOUNDARIES).toHaveLength(7)
    expect(CONSENT_BOUNDARIES.map((b) => b.key)).toEqual([
      'retainLocalChatHistory',
      'rememberDocumentFacts',
      'automaticMemoryInference',
      'backgroundSummarization',
      'crossDocumentPreferences',
      'shareMemoryWithCollaborators',
      'remoteInference'
    ])
    for (const b of CONSENT_BOUNDARIES) {
      expect(b.title.length).toBeGreaterThan(0)
      expect(b.description.length).toBeGreaterThan(20)
      expect(b.whenOff.length).toBeGreaterThan(10)
    }
  })

  it('defaults preserve shipped behavior except sharing/summarization (off)', () => {
    expect(DEFAULT_CONSENT.retainLocalChatHistory).toBe(true)
    expect(DEFAULT_CONSENT.rememberDocumentFacts).toBe(true)
    expect(DEFAULT_CONSENT.automaticMemoryInference).toBe(true)
    expect(DEFAULT_CONSENT.backgroundSummarization).toBe(false) // sidecar off by default
    expect(DEFAULT_CONSENT.crossDocumentPreferences).toBe(true)
    expect(DEFAULT_CONSENT.shareMemoryWithCollaborators).toBe(false) // private profile never leaves by default
    expect(DEFAULT_CONSENT.remoteInference).toBe(true)
  })

  it('merges partial stored settings over defaults', () => {
    expect(effectiveConsent(undefined)).toEqual(DEFAULT_CONSENT)
    expect(effectiveConsent({ remoteInference: false })).toEqual({ ...DEFAULT_CONSENT, remoteInference: false })
  })

  it('classifies local endpoints (boundary 7 exempts them)', () => {
    expect(isLocalEndpoint('http://localhost:11434/v1')).toBe(true)
    expect(isLocalEndpoint('http://127.0.0.1:1234/v1')).toBe(true)
    expect(isLocalEndpoint('http://[::1]:8080/v1')).toBe(true)
    expect(isLocalEndpoint('https://api.openai.com/v1')).toBe(false)
    expect(isLocalEndpoint('not a url')).toBe(false)
  })
})
