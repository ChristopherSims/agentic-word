/**
 * §A: migration backups are uniquely named and created exclusively, so a
 * timestamp collision cannot overwrite an existing backup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'

let dir: string
let memoryPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-backup-exclusive-'))
  memoryPath = join(dir, 'memory.json')
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('migration backup exclusivity (§A)', () => {
  it('never overwrites an existing backup on a timestamp collision', () => {
    const fixed = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(fixed)
    // Pre-existing backup at the same timestamp.
    const base = `${memoryPath}.backup-${fixed}`
    fs.writeFileSync(base, 'previous backup', 'utf-8')

    fs.writeFileSync(memoryPath, JSON.stringify({
      entries: [{ id: 'm1', documentId: 'C:\\docs\\a.docx', type: 'fact', content: 'Fact A', createdAt: 1, source: 'explicit' }]
    }), 'utf-8')

    const store = new AgentMemoryStore(memoryPath)

    // The original backup is untouched; a distinct one was created.
    expect(fs.readFileSync(base, 'utf-8')).toBe('previous backup')
    const backups = store.listMigrationBackups().map((b) => b.name)
    expect(backups).toContain(`memory.json.backup-${fixed}`)
    expect(backups).toContain(`memory.json.backup-${fixed}-1`)
    expect(store.getForDocument('C:\\docs\\a.docx')).toHaveLength(1)
  })

  it('still refuses impostor backup names and removes real ones', () => {
    const store = new AgentMemoryStore(memoryPath)
    const name = store.writeUniqueBackup('x')
    const base = name.split(/[\\/]/).pop()!
    expect(store.removeMigrationBackup(base)).toBe(true)
    expect(store.removeMigrationBackup('memory.json.backup-evil')).toBe(false)
  })
})
