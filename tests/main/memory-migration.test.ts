/**
 * Unit tests for legacy agent-memory migration (memory.md §12 steps 1–12).
 * Pure migration rules + AgentMemoryStore file integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  migrateLegacyData,
  verifyMigrationCounts,
  entriesChecksum,
  classifyKey,
  SCHEMA_VERSION
} from '../../src/main/memory/migration'
import { AgentMemoryStore } from '../../src/main/agent-memory'

let dir: string
let memoryPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memory-migration-test-'))
  memoryPath = join(dir, 'memory.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('classifyKey (§12 step 5)', () => {
  it('recognizes UUIDs, file paths, and ambiguous keys', () => {
    expect(classifyKey('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('uuid')
    expect(classifyKey('C:\\docs\\report.docx')).toBe('path')
    expect(classifyKey('/home/user/notes.md')).toBe('path')
    expect(classifyKey('default')).toBe('quarantine')
    expect(classifyKey('doc-1')).toBe('quarantine')
    expect(classifyKey('tab_3')).toBe('quarantine')
    expect(classifyKey('')).toBe('quarantine')
    expect(classifyKey(undefined)).toBe('quarantine')
  })
})

describe('migrateLegacyData (§12 steps 1, 3, 5, 6)', () => {
  const legacy = {
    entries: [
      // Path-keyed: mappable, preserved with originKey
      { id: 'm1', documentId: 'C:\\docs\\a.docx', type: 'fact', content: 'Fact A', createdAt: 111, source: 'explicit', agentName: 'user' },
      // 'default': quarantined
      { id: 'm2', documentId: 'default', type: 'preference', content: 'Ambiguous pref', createdAt: 222, source: 'inferred', agentName: 'assistant' },
      // Missing key: quarantined
      { id: 'm3', type: 'decision', content: 'No doc', createdAt: 333, source: 'explicit', agentName: 'user' },
      // Invalid type: skipped and reported
      { id: 'm4', documentId: 'C:\\docs\\a.docx', type: 'emoji', content: 'x', createdAt: 444 },
      // Legacy inferred GLOBAL: held as candidate (§12 step 6)
      { id: 'm5', documentId: '__global__', type: 'preference', content: 'Global inferred pref', createdAt: 555, source: 'inferred', scope: 'global', agentName: 'assistant' },
      // Legacy explicit GLOBAL: keeps legacy eligibility
      { id: 'm6', documentId: '__global__', type: 'preference', content: 'Global explicit pref', createdAt: 666, source: 'explicit', scope: 'global', agentName: 'user' }
    ]
  }

  it('migrates valid entries verbatim, quarantines ambiguous keys, counts invalid', () => {
    const result = migrateLegacyData(legacy)
    expect(result.entries.map((e) => e.id)).toEqual(['m1', 'm5', 'm6'])
    // Step 3: preserved verbatim
    const m1 = result.entries[0]
    expect(m1.content).toBe('Fact A')
    expect(m1.createdAt).toBe(111)
    expect(m1.source).toBe('explicit')
    expect(m1.originKey).toBe('C:\\docs\\a.docx')
    // Step 6: inferred global requires review; explicit global stays eligible
    const m5 = result.entries.find((e) => e.id === 'm5')
    expect(m5?.approvalState).toBe('candidate')
    const m6 = result.entries.find((e) => e.id === 'm6')
    expect(m6?.approvalState).toBeUndefined()
    // Step 5: ambiguous keys quarantined with reasons, never merged
    expect(result.quarantined.map((q) => q.reason)).toEqual(['default-key', 'missing-key'])
    expect(result.quarantined[0].record).toEqual(legacy.entries[1])
    // Step 1: invalid records counted with visible errors
    expect(result.skippedInvalid).toBe(1)
    expect(result.errors.length).toBe(1)
    // Step 10: every record accounted for
    expect(verifyMigrationCounts(6, result)).toBe(true)
  })

  it('reports unrecognized shapes without throwing', () => {
    const result = migrateLegacyData({ nope: true })
    expect(result.entries).toEqual([])
    expect(result.errors.length).toBe(1)
    expect(verifyMigrationCounts(0, result)).toBe(true)
  })

  it('checksums deterministically and detects content changes', () => {
    const a = migrateLegacyData(legacy).entries
    const again = migrateLegacyData(legacy).entries
    expect(entriesChecksum(a)).toBe(entriesChecksum(again))
    const mutated = a.map((e) => (e.id === 'm1' ? { ...e, content: 'tampered' } : e))
    expect(entriesChecksum(mutated)).not.toBe(entriesChecksum(a))
  })
})

describe('AgentMemoryStore migration integration (§12 steps 2, 10, 11)', () => {
  it('migrates a legacy file: backup kept, canonical store written, quarantine persisted', () => {
    writeFileSync(memoryPath, JSON.stringify({
      entries: [
        { id: 'm1', documentId: 'C:\\docs\\a.docx', type: 'fact', content: 'Fact A', createdAt: 111, source: 'explicit', agentName: 'user' },
        { id: 'm2', documentId: 'default', type: 'preference', content: 'Ambiguous', createdAt: 222, source: 'inferred', agentName: 'assistant' }
      ]
    }), 'utf-8')
    const store = new AgentMemoryStore(memoryPath)

    // Migrated entry present; ambiguous entry quarantined, not merged
    const migrated = store.getForDocument('C:\\docs\\a.docx')
    expect(migrated).toHaveLength(1)
    expect(store.getQuarantined()).toHaveLength(1)
    expect(store.getQuarantined()[0].reason).toBe('default-key')

    // Backup written verbatim next to the original (steps 2 and 11)
    const backups = readdirSync(dir).filter((f) => f.startsWith('memory.json.backup-'))
    expect(backups).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dir, backups[0]), 'utf-8')).entries).toHaveLength(2)

    // Canonical store written with schema version and checksum (step 10)
    const saved = JSON.parse(readFileSync(memoryPath, 'utf-8'))
    expect(saved.meta.schemaVersion).toBe(SCHEMA_VERSION)
    expect(typeof saved.meta.checksum).toBe('string')
    expect(saved.entries).toHaveLength(1)
    expect(saved.quarantine).toHaveLength(1)
  })

  it('is idempotent: a canonical file is never re-migrated', () => {
    writeFileSync(memoryPath, JSON.stringify({
      entries: [
        { id: 'm1', documentId: 'C:\\docs\\a.docx', type: 'fact', content: 'Fact A', createdAt: 111, source: 'explicit', agentName: 'user' }
      ]
    }), 'utf-8')
    new AgentMemoryStore(memoryPath) // first load migrates
    const backupsAfterFirst = readdirSync(dir).filter((f) => f.startsWith('memory.json.backup-')).length
    new AgentMemoryStore(memoryPath) // second load must not re-migrate
    const backupsAfterSecond = readdirSync(dir).filter((f) => f.startsWith('memory.json.backup-')).length
    expect(backupsAfterSecond).toBe(backupsAfterFirst)
    const saved = JSON.parse(readFileSync(memoryPath, 'utf-8'))
    expect(saved.meta.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('quarantine resolution: keep imports as candidate for the target doc; discard removes', () => {
    writeFileSync(memoryPath, JSON.stringify({
      entries: [
        { id: 'm2', documentId: 'default', type: 'preference', content: 'Ambiguous', createdAt: 222, source: 'inferred', agentName: 'assistant' }
      ]
    }), 'utf-8')
    const store = new AgentMemoryStore(memoryPath)
    const key = store.getQuarantined()[0].key

    expect(store.resolveQuarantine('no-such-key', { type: 'discard' })).toBe(false)
    expect(store.resolveQuarantine(key, { type: 'keep', documentId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' })).toBe(true)
    expect(store.getQuarantined()).toHaveLength(0)
    const imported = store.getForDocument('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    expect(imported).toHaveLength(1)
    // Still requires review before influencing prompts
    expect(imported[0].approvalState).toBe('candidate')
    expect(imported[0].sourceType).toBe('migration')
    expect(imported[0].originKey).toBe('default')
    expect(store.formatForPrompt('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('')

    // Discard path on a fresh quarantine
    writeFileSync(join(dir, 'm2.json'), JSON.stringify({
      entries: [{ id: 'm9', documentId: 'default', type: 'fact', content: 'x', createdAt: 1, source: 'explicit', agentName: 'user' }]
    }), 'utf-8')
    const store2 = new AgentMemoryStore(join(dir, 'm2.json'))
    const key2 = store2.getQuarantined()[0].key
    expect(store2.resolveQuarantine(key2, { type: 'discard' })).toBe(true)
    expect(store2.getQuarantined()).toHaveLength(0)
    expect(store2.getForDocument('default')).toHaveLength(0)
    const saved = JSON.parse(readFileSync(join(dir, 'm2.json'), 'utf-8'))
    expect(saved.quarantine).toHaveLength(0)
  })
})
