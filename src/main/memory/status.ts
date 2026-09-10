/**
 * Memory engine status derivation (updates-2.md §F).
 *
 * Pure: maps raw engine/consent/maintenance facts to one honest state so the
 * UI never presents an enabled toggle as a running worker, a consent block as
 * a failure, or a pending deletion as ready.
 */

import type { MemoryStatus } from '../../shared/types'

export interface MemoryStatusInput {
  mnesisEnabled: boolean
  retainLocalChatHistory: boolean
  backgroundSummarization: boolean
  running: boolean
  startFailed: boolean
  error: string | null
  pendingDeletions: number
  rebuilding: boolean
  /** §H: explicit reason the engine is off (platform/runtime), if any. */
  unavailableReason?: string | null
}

export function deriveMemoryStatus(input: MemoryStatusInput): MemoryStatus {
  const base = {
    enabled: input.mnesisEnabled,
    running: input.running,
    pendingDeletions: input.pendingDeletions,
    error: input.error
  }

  // Maintenance that could not complete keeps the store fenced (R8/§D).
  if (input.pendingDeletions > 0) {
    return {
      ...base,
      state: 'pending-maintenance',
      detail: `${input.pendingDeletions} deletion operation(s) still pending — affected history stays unavailable until cleanup succeeds.`
    }
  }

  if (!input.mnesisEnabled) {
    return { ...base, state: 'disabled-by-user', detail: 'Memory is turned off. Basic editing is unaffected.' }
  }

  // §H: a platform/runtime gate is more fundamental than a consent block.
  if (input.unavailableReason) {
    return { ...base, state: 'unavailable-runtime', detail: input.unavailableReason }
  }

  if (!input.retainLocalChatHistory || !input.backgroundSummarization) {
    return {
      ...base,
      state: 'blocked-by-consent',
      detail: 'History retention or background summarization is disabled in Privacy settings, so the context engine is not started.'
    }
  }

  if (input.rebuilding) {
    return { ...base, state: 'rebuilding', detail: 'Rebuilding conversation projections from retained history.' }
  }

  if (input.startFailed || input.error) {
    return { ...base, state: 'failed', detail: input.error ?? 'The memory runtime failed to start.' }
  }

  if (input.running) {
    return { ...base, state: 'ready', detail: 'Memory engine is running.' }
  }

  return {
    ...base,
    state: 'unavailable-runtime',
    detail: 'The memory runtime is not started yet (it starts on first use when consent allows).'
  }
}
