/**
 * Per-run async context (updates-2.md §B, R5).
 *
 * The bridge has historically routed document/protection identity through
 * shared mutable fields, which overlapping runs can clobber. Tool handlers now
 * read their originating run's immutable scope from an async-local store, so
 * concurrent runs stay isolated without threading a scope parameter through
 * every handler signature.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { RunScope } from './run-registry'

const storage = new AsyncLocalStorage<RunScope>()

/** Run `fn` with `scope` visible to every awaited continuation inside it. */
export function runWithScope<T>(scope: RunScope, fn: () => T): T {
  return storage.run(scope, fn)
}

/** The immutable scope of the run currently executing, if any. */
export function currentRunScope(): RunScope | undefined {
  return storage.getStore()
}
