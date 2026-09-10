/**
 * Legacy-session import as historical events (memory.md §12 steps 7–9).
 *
 * Step 7: old agent chat sessions become *historical events* in the
 * canonical ledger — with provenance that says exactly what is and is not
 * known. A legacy session has no revision evidence and no tool-call
 * linkage, and the import must not pretend otherwise.
 *
 * Step 8 (already honored by construction): events carry text payloads
 * only — there is nothing executable in them, so replay can never execute
 * stored tool calls.
 *
 * Step 9: eligible events are replayed into fresh Mnesis projections after
 * canonical migration succeeds. Eligibility is explicit and conservative;
 * suppressed (forgotten) content is never rebuilt.
 */

import type { AgentSession } from '../../shared/types'

/** Provenance label for everything imported from the legacy session file. */
export const LEGACY_SESSION_PROVENANCE = 'legacy-session'

/** Where a retained event came from. */
export type HistoricalEventProvenance = typeof LEGACY_SESSION_PROVENANCE | 'live'

export interface HistoricalEvent {
  eventId: string
  documentId: string
  sessionId: string
  agentName: string
  role: string
  content: string
  /** session-level timestamp — per-message timestamps were not recorded */
  timestamp: number
  provenance: HistoricalEventProvenance
  /** always false for legacy imports — revision evidence was not recorded */
  revisionKnown: false
  /** always false for legacy imports — tool-call linkage was not recorded */
  toolEvidence: false
  /** set once the event has been replayed into a Mnesis projection (step 9) */
  projected?: boolean
  /** monotonic ledger sequence assigned on import (updates-2.md §E) */
  sequence?: number
}

/**
 * Convert one legacy session into historical events. Deterministic event
 * ids (`hev_<sessionId>_<index>`) make the import idempotent — re-running
 * never duplicates. Empty content and system prompts are skipped (a system
 * prompt is configuration, not conversation history).
 */
export function sessionToHistoricalEvents(session: AgentSession): HistoricalEvent[] {
  const events: HistoricalEvent[] = []
  session.messages.forEach((message, index) => {
    const content = message.content.trim()
    if (!content) return
    if (message.role === 'system') return
    events.push({
      eventId: `hev_${session.id}_${index}`,
      documentId: session.documentId,
      sessionId: session.id,
      agentName: session.agentName,
      role: message.role,
      content,
      // Per-message timestamps were not recorded; the session's updatedAt
      // is the honest bound (and is labeled as such by provenance).
      timestamp: session.updatedAt,
      provenance: LEGACY_SESSION_PROVENANCE,
      revisionKnown: false,
      toolEvidence: false
    })
  })
  return events
}

export interface ProjectionTurn {
  user: string
  assistant: string
}

export interface RebuildSkipCounts {
  orphan: number
  projected: number
  suppressed: number
  unexpectedRole: number
}

/**
 * Eligibility for projection rebuild (step 9): only complete user/assistant
 * text pairs from the same session, in original order. Anything else
 * (orphan turns, unexpected roles, already-projected events, suppressed
 * content) is skipped and counted — never silently merged.
 */
export function planProjectionRebuild(
  events: HistoricalEvent[],
  isSuppressed: (content: string) => boolean = () => false,
  opts: { includeProjected?: boolean } = {}
): { turns: ProjectionTurn[]; skipped: RebuildSkipCounts; projectedEventIds: string[] } {
  const skipped: RebuildSkipCounts = { orphan: 0, projected: 0, suppressed: 0, unexpectedRole: 0 }
  const turns: ProjectionTurn[] = []
  const projectedEventIds: string[] = []
  const pending = events.map((e) => ({ ...e }))
  for (let i = 0; i < pending.length; i++) {
    const event = pending[i]
    if (event.projected && !opts.includeProjected) {
      skipped.projected++
      continue
    }
    if (isSuppressed(event.content)) {
      skipped.suppressed++
      continue
    }
    if (event.role !== 'user') {
      if (event.role === 'assistant') skipped.orphan++
      else skipped.unexpectedRole++
      continue
    }
    const next = pending[i + 1]
    if (!next || next.role !== 'assistant' || next.sessionId !== event.sessionId) {
      skipped.orphan++
      continue
    }
    if (isSuppressed(next.content)) {
      skipped.suppressed += 2
      i++ // consume the pair either way
      continue
    }
    turns.push({ user: event.content, assistant: next.content })
    projectedEventIds.push(event.eventId, next.eventId)
    i++
  }
  return { turns, skipped, projectedEventIds }
}
