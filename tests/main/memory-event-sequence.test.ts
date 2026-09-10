/**
 * Event sequence assignment + catch-up window (updates-2.md §E).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import { sessionToHistoricalEvents } from '../../src/main/memory/migration-sessions'
import type { AgentSession } from '../../src/shared/types'

const session = (id: string, documentId: string, turns: string[]): AgentSession => ({
  id,
  documentId,
  agentName: 'Writer',
  systemPrompt: '',
  messages: turns.map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content })),
  createdAt: 1,
  updatedAt: 2
})

let dir: string
let store: AgentMemoryStore
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-event-sequence-'))
  file = join(dir, 'memory.json')
  store = new AgentMemoryStore(file)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('event sequences (§E)', () => {
  it('assigns monotonic sequences and exposes the catch-up window', () => {
    store.importHistoricalEvents(sessionToHistoricalEvents(session('s1', 'doc-a', ['a1', 'a2'])))
    store.importHistoricalEvents(sessionToHistoricalEvents(session('s2', 'doc-b', ['b1', 'b2'])))

    const docA = store.historicalEventsFor('doc-a')
    const docB = store.historicalEventsFor('doc-b')
    expect(docA.map((e) => e.sequence)).toEqual([1, 2])
    expect(docB.map((e) => e.sequence)).toEqual([3, 4])
    expect(store.latestEventSequence()).toBe(4)
    expect(store.latestEventSequence('doc-a')).toBe(2)

    // Only events scoped to the document and after the sequence.
    expect(store.eventsAfter('doc-a', 0).map((e) => e.eventId)).toEqual(docA.map((e) => e.eventId))
    expect(store.eventsAfter('doc-a', 1).map((e) => e.sequence)).toEqual([2])

    // Events committed after the window are the catch-up set.
    const start = store.latestEventSequence('doc-a')
    store.importHistoricalEvents(sessionToHistoricalEvents(session('s3', 'doc-a', ['a3', 'a4'])))
    expect(store.eventsAfter('doc-a', start).map((e) => e.sequence)).toEqual([5, 6])
  })

  it('persists sequences across a reload', () => {
    store.importHistoricalEvents(sessionToHistoricalEvents(session('s1', 'doc-a', ['a1', 'a2'])))
    const reloaded = new AgentMemoryStore(file)
    expect(reloaded.historicalEventsFor('doc-a').map((e) => e.sequence)).toEqual([1, 2])
    expect(reloaded.latestEventSequence()).toBe(2)
    // New imports continue from the persisted maximum.
    reloaded.importHistoricalEvents(sessionToHistoricalEvents(session('s2', 'doc-a', ['a3', 'a4'])))
    expect(reloaded.latestEventSequence('doc-a')).toBe(4)
  })

  it('is idempotent — re-importing assigns no new sequences', () => {
    const events = sessionToHistoricalEvents(session('s1', 'doc-a', ['a1', 'a2']))
    store.importHistoricalEvents(events)
    expect(store.importHistoricalEvents(events)).toBe(0)
    expect(store.latestEventSequence()).toBe(2)
  })
})
