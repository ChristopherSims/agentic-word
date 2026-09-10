/**
 * Explicit model limits and token accounting (updates-2.md §C).
 *
 * Replaces family-name regex budget classification with known per-model
 * context windows, a reserved output allowance and tokenizer metadata, plus a
 * conservative fallback. Token counts are estimates (no bundled tokenizer);
 * they are labeled as such and the whole-request cap remains authoritative.
 */

export interface ModelLimits {
  contextWindow: number
  outputReserve: number
  tokenizer: string
  source: 'known' | 'conservative'
}

interface KnownLimit extends ModelLimits {
  match: RegExp
}

const KNOWN_LIMITS: KnownLimit[] = [
  { match: /^(gpt-4o|gpt-4\.1|gpt-4-turbo|o1|o3)/i, contextWindow: 128_000, outputReserve: 4_096, tokenizer: 'o200k_base', source: 'known' },
  { match: /^gpt-4/i, contextWindow: 8_192, outputReserve: 2_048, tokenizer: 'cl100k_base', source: 'known' },
  { match: /^gpt-3\.5/i, contextWindow: 16_385, outputReserve: 2_048, tokenizer: 'cl100k_base', source: 'known' },
  { match: /^claude/i, contextWindow: 200_000, outputReserve: 8_192, tokenizer: 'claude', source: 'known' },
  { match: /^gemini/i, contextWindow: 128_000, outputReserve: 8_192, tokenizer: 'sentencepiece', source: 'known' },
  { match: /(llama|mistral|mixtral|qwen|phi|gemma|granite|deepseek)/i, contextWindow: 32_768, outputReserve: 2_048, tokenizer: 'local', source: 'known' }
]

/** Fallback for an unrecognized model: small and explicitly conservative. */
export const CONSERVATIVE_LIMITS: ModelLimits = {
  contextWindow: 8_192,
  outputReserve: 1_024,
  tokenizer: 'conservative',
  source: 'conservative'
}

/**
 * Resolve context/output limits for a model. A user-configured window always
 * wins (needed for unknown tokenization); otherwise known models use their
 * documented limits and everything else stays conservative.
 */
export function resolveModelLimits(
  model: string | undefined,
  configured?: { contextWindow?: number; outputReserve?: number; tokenizer?: string }
): ModelLimits {
  if (configured?.contextWindow && configured.contextWindow > 0) {
    return {
      contextWindow: configured.contextWindow,
      outputReserve: configured.outputReserve ?? CONSERVATIVE_LIMITS.outputReserve,
      tokenizer: configured.tokenizer ?? 'configured',
      source: 'known'
    }
  }
  if (model) {
    const known = KNOWN_LIMITS.find((k) => k.match.test(model.trim()))
    if (known) return { contextWindow: known.contextWindow, outputReserve: known.outputReserve, tokenizer: known.tokenizer, source: 'known' }
  }
  return CONSERVATIVE_LIMITS
}

/** Conservative token estimate (~4 chars/token); always disclosed as an estimate. */
export function estimateTokens(text: string): number {
  return tokenCounter ? tokenCounter(text) : Math.ceil(text.length / 4)
}

/**
 * Optional exact tokenizer (e.g. a bundled BPE). Injected by the host when a
 * real tokenizer is available; when absent the char-based estimate is used and
 * reported as inexact (updates-2.md §C).
 */
export type TokenCounter = (text: string) => number
let tokenCounter: TokenCounter | null = null

export function configureTokenizer(counter: TokenCounter | null): void {
  tokenCounter = counter
}

export function hasExactTokenizer(): boolean {
  return tokenCounter !== null
}

export interface TokenBudgetReport {
  inputTokens: number
  outputReserve: number
  safetyMargin: number
  limit: number
  fits: boolean
  estimator: string
  /** true only when a host-injected exact tokenizer counted the input. */
  exact: boolean
}

/**
 * Check the whole request (system + tools + history + output reserve + safety)
 * against the model's context window.
 */
export function checkTokenBudget(
  inputText: string,
  limits: ModelLimits,
  opts: { safetyMargin?: number } = {}
): TokenBudgetReport {
  const inputTokens = estimateTokens(inputText)
  const safetyMargin = opts.safetyMargin ?? Math.max(256, Math.floor(limits.contextWindow * 0.05))
  const total = inputTokens + limits.outputReserve + safetyMargin
  return {
    inputTokens,
    outputReserve: limits.outputReserve,
    safetyMargin,
    limit: limits.contextWindow,
    fits: total <= limits.contextWindow,
    estimator: limits.tokenizer,
    exact: hasExactTokenizer()
  }
}
