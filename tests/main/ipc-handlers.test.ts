/**
 * IPC handler integration tests.
 * Validates that wrapped handlers return expected response shapes
 * and handle errors gracefully without throwing exceptions across IPC.
 */

import { describe, it, expect } from 'vitest'
import { errorResponse, wrapIpcHandler } from '../../src/main/error-handler'

// ─── Channel name validation (doesn't need Electron) ───

const VALID_CHANNEL_PATTERN = /^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)*$/

describe('IPC Channel naming', () => {
  it('vcs channels follow convention', () => {
    const channels = [
      'vcs-commit',
      'vcs-log',
      'vcs-diff',
      'vcs-branch-create',
      'vcs-branch-list',
      'vcs-stash-push',
      'vcs-merge',
      'vcs-cherry-pick',
    ]
    for (const ch of channels) {
      expect(ch).toMatch(VALID_CHANNEL_PATTERN)
    }
  })

  it('doc channels follow convention', () => {
    const channels = ['docs-read', 'docs-list', 'doc-stats']
    for (const ch of channels) {
      expect(ch).toMatch(VALID_CHANNEL_PATTERN)
    }
  })

  it('agent channels follow convention', () => {
    const channels = ['agent-chat-stream', 'agent-abort', 'agent-configure-advanced']
    for (const ch of channels) {
      expect(ch).toMatch(VALID_CHANNEL_PATTERN)
    }
  })
})

// ─── Error response shape contract ───

describe('Error response contract', () => {
  it('always has success: false', () => {
    const err = errorResponse('test')
    expect(err.success).toBe(false)
  })

  it('always has a string error message', () => {
    const err = errorResponse(new Error('msg'))
    expect(typeof err.error).toBe('string')
    expect(err.error.length).toBeGreaterThan(0)
  })

  it('handles null/undefined gracefully', () => {
    // @ts-expect-error testing runtime behavior
    const err1 = errorResponse(null)
    expect(err1.success).toBe(false)
    expect(err1.error).toBe('null')

    // @ts-expect-error testing runtime behavior
    const err2 = errorResponse(undefined)
    expect(err2.success).toBe(false)
    expect(err2.error).toBe('undefined')
  })

  it('preserves non-Error objects as strings', () => {
    const err = errorResponse({ code: 500, reason: 'Server Error' })
    expect(err.success).toBe(false)
    expect(err.error).toContain('[object Object]')
  })
})

// ─── Handler result shape contract ───

describe('Handler return type contract', () => {
  it('passes through successful returns unchanged', async () => {
    // Simulating vcs-log handler
    const wrapped = wrapIpcHandler(async () => [
      { id: 'abc', message: 'init', timestamp: 1 },
    ])
    const result = await wrapped({} as any)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('wraps errors for vcs handlers', async () => {
    // Simulating vcs-commit that throws
    const wrapped = wrapIpcHandler(async () => {
      throw new Error('Repository not found')
    })
    const result = await wrapped({} as any)
    expect(result).toHaveProperty('success', false)
    expect(result).toHaveProperty('error', 'Repository not found')
  })

  it('wraps errors for document handlers', async () => {
    // Simulating docs-read that throws
    const wrapped = wrapIpcHandler(async () => {
      throw new Error('File not found')
    })
    const result = await wrapped({} as any)
    expect(result).toHaveProperty('success', false)
    expect(result).toHaveProperty('error', 'File not found')
  })

  it('handles handlers returning void', async () => {
    let sideEffect = false
    const wrapped = wrapIpcHandler(async () => {
      sideEffect = true
    })
    const result = await wrapped({} as any)
    expect(result).toBeUndefined()
    expect(sideEffect).toBe(true)
  })

  it('handles handlers returning null', async () => {
    const wrapped = wrapIpcHandler(async () => null)
    const result = await wrapped({} as any)
    expect(result).toBeNull()
  })

  it('handlers receive event object as first arg', async () => {
    let receivedEvent = false
    const wrapped = wrapIpcHandler(async (event) => {
      if (event && typeof event === 'object') receivedEvent = true
      return 'ok'
    })
    const result = await wrapped({ sender: {} } as any)
    expect(result).toBe('ok')
    expect(receivedEvent).toBe(true)
  })
})

// ─── Path traversal rejection contract ───

describe('Path traversal validation', () => {
  // Regex from the docs-read handler
  const VALID_FILENAME = /^[a-z0-9][a-z0-9\-_.]*\.[a-z0-9]+$/i

  it('accepts valid filenames', () => {
    expect('readme.md').toMatch(VALID_FILENAME)
    expect('getting-started.md').toMatch(VALID_FILENAME)
    expect('api-reference_v2.md').toMatch(VALID_FILENAME)
  })

  it('rejects path traversal attempts', () => {
    expect('../../../etc/passwd').not.toMatch(VALID_FILENAME)
    expect('../.git/config').not.toMatch(VALID_FILENAME)
  })

  it('rejects filenames without extension', () => {
    expect('readme').not.toMatch(VALID_FILENAME)
  })

  it('rejects filenames starting with dot', () => {
    expect('.hidden').not.toMatch(VALID_FILENAME)
  })

  it('rejects absolute paths', () => {
    expect('/etc/passwd.txt').not.toMatch(VALID_FILENAME)
    expect('C:\\Windows\\system.txt').not.toMatch(VALID_FILENAME)
  })
})
