/**
 * §C: explicit model limits and token accounting.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { CONSERVATIVE_LIMITS, checkTokenBudget, configureTokenizer, estimateTokens, hasExactTokenizer, resolveModelLimits } from '../../src/main/memory/model-budget'

afterEach(() => configureTokenizer(null))

describe('model limits & token budget (§C)', () => {
  it('resolves known per-model limits', () => {
    expect(resolveModelLimits('gpt-4')).toMatchObject({ contextWindow: 8192, outputReserve: 2048, source: 'known' })
    expect(resolveModelLimits('gpt-4o')).toMatchObject({ contextWindow: 128_000, tokenizer: 'o200k_base' })
    expect(resolveModelLimits('claude-3-5-sonnet')).toMatchObject({ contextWindow: 200_000 })
    expect(resolveModelLimits('llama-3-8b-instruct')).toMatchObject({ contextWindow: 32_768, tokenizer: 'local' })
  })

  it('falls back conservatively and honors a configured window', () => {
    expect(resolveModelLimits('some-unknown-model')).toEqual(CONSERVATIVE_LIMITS)
    expect(resolveModelLimits(undefined)).toEqual(CONSERVATIVE_LIMITS)
    expect(resolveModelLimits('whatever', { contextWindow: 100_000, outputReserve: 4_000, tokenizer: 'custom' }))
      .toMatchObject({ contextWindow: 100_000, outputReserve: 4_000, tokenizer: 'custom', source: 'known' })
  })

  it('estimates tokens conservatively and checks the whole-request fit', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(400))).toBe(100)

    const limits = { contextWindow: 8_192, outputReserve: 2_048, tokenizer: 'cl100k_base', source: 'known' as const }
    const small = checkTokenBudget('a'.repeat(1_000), limits)
    expect(small.fits).toBe(true)
    expect(small.exact).toBe(false)

    const huge = checkTokenBudget('a'.repeat(60_000), limits)
    expect(huge.fits).toBe(false)
  })

  it('reports exact counts when a tokenizer is injected', () => {
    expect(hasExactTokenizer()).toBe(false)
    configureTokenizer((text) => text.trim().split(/\s+/).filter(Boolean).length)
    expect(hasExactTokenizer()).toBe(true)
    expect(estimateTokens('one two three')).toBe(3)

    const limits = { contextWindow: 8_192, outputReserve: 2_048, tokenizer: 'cl100k_base', source: 'known' as const }
    expect(checkTokenBudget('one two three', limits).exact).toBe(true)
  })
})
