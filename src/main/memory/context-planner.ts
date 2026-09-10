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

// ─── Per-model context profiles (memory.md §8.4) ───

/**
 * Default shared context budget in characters.
 * ~24,000 chars ≈ 6,000 tokens at the usual 4 chars/token heuristic, which
 * leaves room for system instructions, tool schemas, and conversation history
 * on small 8k-token local models. Configurable per model profile later.
 */
export const DEFAULT_CONTEXT_CHAR_BUDGET = 24_000

export type ContextWeightKey = keyof typeof WEIGHTS

/**
 * The document's share of a profile's budget, honoring profile weight
 * overrides. This is the single source for the document slot — callers must
 * not hardcode a fraction (updates-2.md §C).
 */
export function documentBudgetShare(weights: Partial<Record<ContextWeightKey, number>> = {}): number {
  return weights.documentContent ?? WEIGHTS.documentContent
}

export interface ContextProfile {
  label: string
  /** total shared character budget for this model class */
  totalBudget: number
  /** weight overrides — prioritize the selected section and explicit
   * constraints on small windows (§8.4) */
  weights: Partial<Record<ContextWeightKey, number>>
}

const DEFAULT_PROFILE: ContextProfile = {
  label: 'default',
  totalBudget: DEFAULT_CONTEXT_CHAR_BUDGET,
  weights: {}
}

/**
 * Small/local model profile (§8.4): a 20k+ char default budget is
 * inappropriate for many local configurations. Halve the budget and shift
 * weight toward the user's selection and long-term constraints (memory),
 * away from the full document — the model recovers document detail on
 * demand with source-reading tools (document_read / document_section).
 */
const SMALL_MODEL_PROFILE: ContextProfile = {
  label: 'small-local',
  totalBudget: 12_000,
  weights: {
    documentContent: 0.25,
    storyboardContent: 0.08,
    selection: 0.3,
    cursorContext: 0.12,
    scratchpad: 0.05,
    memoryContext: 0.2
  }
}

const SMALL_MODEL_RE = /(llama|phi|gemma|mistral|qwen|granite|tiny|mini|[348]b)/i

/**
 * Classify a model name into a context profile. Pure heuristic on the model
 * string; unknown names get the default profile. Pure — unit-tested.
 */
export function resolveContextProfile(model: string | undefined): ContextProfile {
  if (!model) return DEFAULT_PROFILE
  return SMALL_MODEL_RE.test(model) ? SMALL_MODEL_PROFILE : DEFAULT_PROFILE
}

// ─── Purpose-specific profiles for the other AI entry points (memory.md §12
// closing note: no entry point invents its own truncation) ───

/** Multi-agent runs: enough document + selection for a subtask, one budget. */
export const MULTI_AGENT_PROFILE: ContextProfile = {
  label: 'multi-agent',
  totalBudget: 16_000,
  weights: {
    documentContent: 0.5,
    storyboardContent: 0.15,
    selection: 0.15,
    cursorContext: 0.08,
    scratchpad: 0.07,
    memoryContext: 0.05
  }
}

/** Orchestrator decomposition: only enough context to split the request. */
export const ORCHESTRATOR_PROFILE: ContextProfile = {
  label: 'orchestrator',
  totalBudget: 6_000,
  weights: {
    documentContent: 0.7,
    storyboardContent: 0.05,
    selection: 0.25
  }
}

/**
 * Clamp a purpose profile to the model's context window: the purpose budget
 * never exceeds what the configured model can take (§8.4 + §12 audit).
 */
export function clampProfileToModel(purpose: ContextProfile, model: string | undefined): ContextProfile {
  const modelProfile = resolveContextProfile(model)
  return purpose.totalBudget <= modelProfile.totalBudget
    ? purpose
    : { ...purpose, totalBudget: modelProfile.totalBudget }
}

/**
 * Plan context parts against one shared character budget.
 *
 * @param inputs raw context strings (may be empty/undefined)
 * @param totalBudget maximum combined characters across all parts
 * @param marker suffix appended to truncated parts (default explains truncation)
 * @param weightOverrides per-part weight overrides from the model's context
 *   profile (§8.4) — merged over the defaults
 */
export function planContext(
  inputs: ContextInputs,
  totalBudget: number,
  marker = '\n... [truncated]',
  weightOverrides: Partial<Record<ContextWeightKey, number>> = {}
): PlannedContext {
  const weights: Record<keyof typeof WEIGHTS, number> = { ...WEIGHTS, ...weightOverrides }
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
    const allowance = Math.max(0, Math.floor(totalBudget * weights[key]))
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

  // Redistribute any leftover budget to truncated parts, highest weight
  // first (profile-aware, §8.4) — otherwise a fixed key order could restore
  // the document at the expense of the selection the profile prioritizes.
  const used = Object.values(planned).reduce((sum, p) => sum + p.content.length, 0)
  let remaining = totalBudget - used
  if (remaining > 0) {
    const order = [...present].sort((a, b) => weights[b] - weights[a])
    for (const key of order) {
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

// ─── Session condensation (memory.md §7.2 item 6: session summary + recent
// episodes) — the no-Mnesis equivalent of curated history ───

export interface CondenseOptions {
  /** how many of the most recent messages pass through verbatim */
  keepRecent?: number
  /** don't condense unless there are at least this many messages */
  minMessages?: number
  /** cap on the recap text (oldest recap lines are dropped first) */
  maxRecapChars?: number
  /** per-line excerpt length in the recap */
  excerptChars?: number
}

const DEFAULT_CONDENSE: Required<CondenseOptions> = {
  keepRecent: 8,
  minMessages: 20,
  maxRecapChars: 1500,
  excerptChars: 140
}

/**
 * Conversation recaps are a distinct evidence type (§F): a transient,
 * machine-generated digest that is never an approved author instruction and
 * never evidence that a tool action was accepted.
 */
export const CONVERSATION_RECAP_MARKER = '[conversation-recap]'

export type ConversationEvidenceType = 'conversation-recap' | 'conversation-turn'

export function isConversationRecap(content: string): boolean {
  return content.trimStart().startsWith(CONVERSATION_RECAP_MARKER)
}

/**
 * Condense a long raw transcript for the next model request: recent complete
 * episodes pass through verbatim, older turns become a structural (non-LLM)
 * recap of one line per turn. The recap is explicitly labeled as condensed so
 * the model does not treat it as verbatim history, and exact details from
 * older turns must be re-read from their sources rather than quoted from the
 * recap (§7.3). Pure — unit-tested.
 */
export function condenseConversation(
  messages: Array<{ role: string; content: string }>,
  opts: CondenseOptions = {}
): { messages: Array<{ role: string; content: string }>; condensed: boolean } {
  const { keepRecent, minMessages, maxRecapChars, excerptChars } = { ...DEFAULT_CONDENSE, ...opts }
  if (messages.length <= Math.max(minMessages, keepRecent + 2)) {
    return { messages, condensed: false }
  }
  const older = messages.slice(0, messages.length - keepRecent)
  const recent = messages.slice(messages.length - keepRecent)

  const lines: string[] = []
  let used = 0
  // Most recent older turns first — when the cap is hit, the oldest lines
  // are the ones dropped.
  for (let i = older.length - 1; i >= 0; i--) {
    const m = older[i]
    const excerpt = m.content.replace(/\s+/g, ' ').trim().slice(0, excerptChars)
    if (!excerpt) continue
    const line = `- ${m.role}: ${excerpt}${m.content.length > excerptChars ? '…' : ''}`
    if (used + line.length > maxRecapChars && lines.length > 0) break
    lines.unshift(line)
    used += line.length
  }

  const recap = {
    role: 'system',
    content:
      `${CONVERSATION_RECAP_MARKER} [Session recap — earlier conversation was condensed to one line per turn; ` +
      `this is not verbatim history. Quote nothing from it; re-read sources for exact text.]\n` +
      lines.join('\n')
  }
  return { messages: [recap, ...recent], condensed: true }
}
