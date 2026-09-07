/**
 * Context planner (memory.md §8.1–8.2)
 *
 * Replaces the independent per-field character caps in AgentBridge
 * (document 4000, storyboard 8000, scratchpad 4000, ...) with a single
 * shared budget. Independent caps can collectively exceed a small model's
 * context window; this planner guarantees the combined context parts fit
 * one configurable budget.
 *
 * Pure functions — no Electron imports, unit-testable in Node vitest.
 */

export interface ContextInputs {
  documentContent?: string
  selection?: string
  cursorContext?: string
  storyboardContent?: string
  scratchpad?: string
  memoryContext?: string
}

export interface PlannedPart {
  content: string
  originalLength: number
  truncated: boolean
}

export interface PlannedContext {
  documentContent: PlannedPart
  selection: PlannedPart
  cursorContext: PlannedPart
  storyboardContent: PlannedPart
  scratchpad: PlannedPart
  memoryContext: PlannedPart
  /** Total characters after planning; always ≤ totalBudget */
  totalChars: number
  /** True when at least one part had to be truncated */
  anyTruncated: boolean
}

/** Relative weight of each part when the budget is tight (memory.md §8.1). */
const WEIGHTS: Record<keyof Omit<ContextInputs, never>, number> = {
  documentContent: 0.38,
  storyboardContent: 0.2,
  selection: 0.12,
  cursorContext: 0.1,
  scratchpad: 0.1,
  memoryContext: 0.1
}

/**
 * Plan context parts against one shared character budget.
 *
 * @param inputs raw context strings (may be empty/undefined)
 * @param totalBudget maximum combined characters across all parts
 * @param marker suffix appended to truncated parts (default explains truncation)
 */
export function planContext(
  inputs: ContextInputs,
  totalBudget: number,
  marker = '\n... [truncated]'
): PlannedContext {
  const keys = Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>
  const present = keys.filter((k) => (inputs[k] ?? '').length > 0)
  const rawTotal = present.reduce((sum, k) => sum + (inputs[k] ?? '').length, 0)

  const part = (key: keyof typeof WEIGHTS): PlannedPart => {
    const original = inputs[key] ?? ''
    if (original.length === 0) {
      return { content: '', originalLength: 0, truncated: false }
    }
    // If everything fits, keep it whole — no artificial shrinking.
    if (rawTotal <= totalBudget) {
      return { content: original, originalLength: original.length, truncated: false }
    }
    const allowance = Math.max(0, Math.floor(totalBudget * WEIGHTS[key]))
    if (original.length <= allowance) {
      return { content: original, originalLength: original.length, truncated: false }
    }
    // Fit content + marker inside the allowance. If the allowance is smaller
    // than the marker itself, shorten the marker so the total never exceeds it.
    const fitMarker = marker.slice(0, allowance)
    const keep = Math.max(0, allowance - fitMarker.length)
    return {
      content: original.slice(0, keep) + fitMarker,
      originalLength: original.length,
      truncated: true
    }
  }

  const planned = {
    documentContent: part('documentContent'),
    selection: part('selection'),
    cursorContext: part('cursorContext'),
    storyboardContent: part('storyboardContent'),
    scratchpad: part('scratchpad'),
    memoryContext: part('memoryContext')
  }

  // Redistribute any leftover budget to truncated parts, in weight order.
  const used = Object.values(planned).reduce((sum, p) => sum + p.content.length, 0)
  let remaining = totalBudget - used
  if (remaining > 0) {
    for (const key of present) {
      const p = planned[key]
      if (!p.truncated) continue
      const original = inputs[key] ?? ''
      const currentKeep = p.content.length - marker.length
      const targetKeep = Math.min(original.length, currentKeep + remaining)
      if (targetKeep >= original.length) {
        // Fully restored — drop the truncation marker
        p.content = original
        p.truncated = false
        remaining -= original.length - currentKeep
      } else {
        p.content = original.slice(0, targetKeep) + marker
        remaining -= targetKeep - currentKeep
      }
      if (remaining <= 0) break
    }
  }

  const values = Object.values(planned)
  return {
    ...planned,
    totalChars: values.reduce((sum, p) => sum + p.content.length, 0),
    anyTruncated: values.some((p) => p.truncated)
  }
}

/**
 * Default shared context budget in characters.
 * ~24,000 chars ≈ 6,000 tokens at the usual 4 chars/token heuristic, which
 * leaves room for system instructions, tool schemas, and conversation history
 * on small 8k-token local models. Configurable per model profile later.
 */
export const DEFAULT_CONTEXT_CHAR_BUDGET = 24_000

// ─── Context-run report (memory.md §10.3) ───

import type { ContextRunReport, ContextPartKey } from '../../shared/types'

const REPORT_PART_KEYS: ContextPartKey[] = [
  'documentContent',
  'selection',
  'cursorContext',
  'storyboardContent',
  'scratchpad',
  'memoryContext'
]

export interface ReportOptions {
  documentId: string | null
  model: string
  providerId: string
  local: boolean
  budgetChars?: number
  history: { source: 'curated' | 'raw'; turns: number }
  fallbacks: Array<string | undefined>
}

/**
 * Build a lightweight per-run context report from a planned context — counts
 * and source IDs only, never another copy of the assembled prompt (§10.3).
 * Pure — unit-tested.
 */
export function contextReportFromPlanned(planned: PlannedContext, opts: ReportOptions): ContextRunReport {
  return {
    timestamp: Date.now(),
    documentId: opts.documentId,
    model: opts.model,
    providerId: opts.providerId,
    local: opts.local,
    budgetChars: opts.budgetChars ?? DEFAULT_CONTEXT_CHAR_BUDGET,
    totalChars: planned.totalChars,
    // ~4 chars/token heuristic; labeled as an estimate in the inspector UI
    estimatedInputTokens: Math.ceil(planned.totalChars / 4),
    anyTruncated: planned.anyTruncated,
    parts: REPORT_PART_KEYS.map((key) => ({
      key,
      included: planned[key].originalLength > 0,
      chars: planned[key].content.length,
      originalChars: planned[key].originalLength,
      truncated: planned[key].truncated
    })),
    history: opts.history,
    fallbacks: opts.fallbacks.filter((f): f is string => Boolean(f))
  }
}
