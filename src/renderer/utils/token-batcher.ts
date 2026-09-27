/**
 * Token batching for streaming chat responses.
 *
 * Appending every IPC token directly to the store re-renders the whole chat
 * panel and re-parses the streaming markdown message per chunk — O(n²) work
 * over a long reply and the cause of renderer freezes. The batcher coalesces
 * tokens into one store append per flush interval, keeping the stream
 * visibly live while cutting renders by 1-2 orders of magnitude. A
 * synchronous `flush()` must be called before the message is finalized
 * (stream-done / error / stop / unmount) so no tail text is lost.
 *
 * Tokens are bound to the streaming message id at push time, so a flush that
 * lands after a finalize/stop or a mid-stream message switch can never append
 * stale text to the wrong (or a nulled) message.
 */

export interface TokenBatcher {
  /** Queue a token for `id`. The batch auto-flushes on the next timer tick. */
  push: (id: string, token: string) => void
  /** Apply any queued tokens immediately and cancel the pending timer. */
  flush: () => void
  /** Drop queued tokens without applying them and cancel the pending timer. */
  cancel: () => void
}

/** Timer id type for the renderer (DOM) setTimeout. */
export type BatchTimerId = number

const FLUSH_MS = 100

export function createTokenBatcher(apply: (id: string, batch: string) => void): TokenBatcher {
  let queued: string[] = []
  let queuedId: string | null = null
  let timer: BatchTimerId | null = null

  const run = (): void => {
    timer = null
    if (queued.length === 0 || queuedId === null) return
    const id = queuedId
    const batch = queued.join('')
    queued = []
    queuedId = null
    apply(id, batch)
  }

  return {
    push: (id: string, token: string): void => {
      if (!token) return
      // Tokens for a different message start a fresh batch; a mid-stream id
      // switch (new run) must not splice into the previous message's text.
      if (queuedId !== null && queuedId !== id) {
        queued = []
        queuedId = null
      }
      queuedId = id
      queued.push(token)
      if (timer === null) timer = window.setTimeout(run, FLUSH_MS)
    },
    flush: (): void => {
      if (timer !== null) { clearTimeout(timer); timer = null }
      run()
    },
    cancel: (): void => {
      if (timer !== null) { clearTimeout(timer); timer = null }
      queued = []
      queuedId = null
    }
  }
}