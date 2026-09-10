/**
 * Live retained turns as canonical ledger events + projection outbox
 * (updates-2.md §A).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'

let dir: string
let file: string
let store: AgentMemoryStore

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-retained-events-'))
  file = join(dir, 'memory.json')
  store = new AgentMemoryStore(file)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('live retained turns (§A)', () => {
  it('commits user+assistant events and a pending outbox item in one write', () => {
    const committed = store.commitRetainedTurn('doc-a', 'doc-a:Writer', 'hello', 'world')
    expect(committed.userEventId).toBeTruthy()
    expect(committed.assistantEventId).toBeTruthy()

    const events = store.historicalEventsFor('doc-a')
    expect(events.map((e) => e.role)).toEqual(['user', 'assistant'])
    expect(events.every((e) => e.provenance === 'live')).toBe(true)
    expect(events.map((e) => e.sequence)).toEqual([1, 2])

    // The outbox item(s) reference the committed events.
    const pending = store.pendingProjectionOutbox()
    expect(pending.map((o) => o.eventId)).toEqual([committed.userEventId, committed.assistantEventId])
  })

  it('clears outbox items when the projection is confirmed', () => {
    store.commitRetainedTurn('doc-a', 'doc-a:Writer', 'a', 'b')
    const ids = store.pendingProjectionOutbox().map((o) => o.id)
    expect(ids).toHaveLength(2)
    expect(store.markProjectionOutboxProcessed(ids)).toBe(2)
    expect(store.pendingProjectionOutbox()).toEqual([])
    // Marking again is a no-op (already done).
    expect(store.markProjectionOutboxProcessed(ids)).toBe(0)
  })

  it('survives a reload and remains replayable via eventsAfter', () => {
    const start = store.latestEventSequence()
    store.commitRetainedTurn('doc-a', 'doc-a:Writer', 'first', 'answer')
    const reloaded = new AgentMemoryStore(file)
    expect(reloaded.historicalEventsFor('doc-a').map((e) => e.content)).toEqual(['first', 'answer'])
    expect(reloaded.eventsAfter('doc-a', start).map((e) => e.content)).toEqual(['first', 'answer'])
    expect(reloaded.pendingProjectionOutbox()).toHaveLength(2)
  })

  it('omits empty sides of a turn', () => {
    const committed = store.commitRetainedTurn('doc-a', 'doc-a:Writer', '', 'only assistant')
    expect(committed.userEventId).toBeNull()
    expect(store.historicalEventsFor('doc-a').map((e) => e.role)).toEqual(['assistant'])
  })
})
