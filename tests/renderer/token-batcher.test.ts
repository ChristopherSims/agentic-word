// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTokenBatcher } from '../../src/renderer/utils/token-batcher'

// Must match FLUSH_MS in the batcher (the exact value is an implementation
// detail; tests only need to cross it).
const FLUSH_MS = 100

describe('createTokenBatcher', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('coalesces multiple tokens into a single apply', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)

    batcher.push('msg1', 'Hello ')
    batcher.push('msg1', 'wor')
    batcher.push('msg1', 'ld')
    expect(apply).not.toHaveBeenCalled()

    vi.advanceTimersByTime(FLUSH_MS)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith('msg1', 'Hello world')
    batcher.cancel()
  })

  it('does not schedule a second flush while one is pending', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)

    batcher.push('msg1', 'a')
    batcher.push('msg1', 'b')
    batcher.push('msg1', 'c')
    vi.advanceTimersByTime(FLUSH_MS)
    expect(apply).toHaveBeenCalledTimes(1)

    // No queued tokens → the next tick is a no-op, not a second apply.
    vi.advanceTimersByTime(FLUSH_MS * 2)
    expect(apply).toHaveBeenCalledTimes(1)
    batcher.cancel()
  })

  it('continues batching across flushes', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)

    batcher.push('msg1', 'one')
    vi.advanceTimersByTime(FLUSH_MS)
    batcher.push('msg1', 'two')
    vi.advanceTimersByTime(FLUSH_MS)

    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenNthCalledWith(1, 'msg1', 'one')
    expect(apply).toHaveBeenNthCalledWith(2, 'msg1', 'two')
    batcher.cancel()
  })

  it('flush() applies queued tokens immediately and cancels the timer', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)

    batcher.push('msg1', 'tail ')
    batcher.push('msg1', 'text')
    batcher.flush()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith('msg1', 'tail text')

    // The scheduled timer must be gone: advancing must not re-apply.
    vi.advanceTimersByTime(FLUSH_MS * 3)
    expect(apply).toHaveBeenCalledTimes(1)
    batcher.cancel()
  })

  it('flush() with an empty queue applies nothing', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)
    batcher.flush()
    expect(apply).not.toHaveBeenCalled()
    batcher.cancel()
  })

  it('cancel() drops queued tokens without applying them and stays usable', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)

    batcher.push('msg1', 'dropped')
    batcher.cancel()
    vi.advanceTimersByTime(FLUSH_MS * 3)
    expect(apply).not.toHaveBeenCalled()

    batcher.push('msg1', 'kept')
    vi.advanceTimersByTime(FLUSH_MS)
    expect(apply).toHaveBeenCalledWith('msg1', 'kept')
    batcher.cancel()
  })

  it('never splices tokens from a different message id into a pending batch', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)

    batcher.push('msg1', 'first ')
    batcher.push('msg2', 'second')
    vi.advanceTimersByTime(FLUSH_MS)

    // msg1's tail is discarded on the id switch; msg2 applies alone.
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith('msg2', 'second')
    batcher.cancel()
  })

  it('ignores empty tokens', () => {
    const apply = vi.fn()
    const batcher = createTokenBatcher(apply)

    batcher.push('msg1', '')
    vi.advanceTimersByTime(FLUSH_MS * 2)
    expect(apply).not.toHaveBeenCalled()
    batcher.cancel()
  })
})