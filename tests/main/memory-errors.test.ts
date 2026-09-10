/**
 * Typed memory errors (updates-2.md §A/R13): a failed durable commit is
 * distinguishable from a consent refusal or a missing record.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>()
  return {
    ...original,
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      if (String(args[0]).endsWith('memory.json')) throw new Error('Synthetic disk failure')
      return original.writeFileSync(...args)
    }
  }
})

import { AgentMemoryStore } from '../../src/main/agent-memory'
import { MemoryError, isMemoryError } from '../../src/main/memory/errors'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-memory-errors-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('typed memory errors (§A)', () => {
  it('reports a failed canonical write as a typed write-failed error', () => {
    const store = new AgentMemoryStore(join(dir, 'memory.json'))
    let caught: unknown
    try {
      store.add('doc-1', 'user', 'fact', 'cannot commit', 'explicit', 'document')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MemoryError)
    expect(isMemoryError(caught, 'write-failed')).toBe(true)
    if (caught instanceof MemoryError) {
      // Diagnostics carry a code and a short message, not document content.
      expect(caught.message).not.toContain('cannot commit')
    }
  })

  it('classifies errors by code', () => {
    expect(isMemoryError(new MemoryError('consent-required', 'nope'), 'consent-required')).toBe(true)
    expect(isMemoryError(new MemoryError('consent-required', 'nope'), 'write-failed')).toBe(false)
    expect(isMemoryError(new Error('plain'))).toBe(false)
  })
})
