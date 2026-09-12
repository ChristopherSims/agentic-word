/**
 * Unit tests for per-model metadata resolution (budget §8.4).
 * Network access is mocked; the module is pure apart from `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchModelMetadata } from '../../src/main/model-fetchers'
import type { ProviderDef } from '../../src/shared/providers'

const anthropic: ProviderDef = {
  id: 'anthropic',
  name: 'Anthropic',
  baseUrl: 'https://api.anthropic.com',
  modelsUrl: null,
  chatPath: '/v1/messages',
  authType: 'api-key-header',
  authHeaderName: 'x-api-key',
  isLocal: false,
  defaultModel: 'claude-sonnet-4-20250514',
  hardcodedModels: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200_000 }
  ]
}

const ollama: ProviderDef = {
  id: 'ollama-local',
  name: 'Ollama (Local)',
  baseUrl: 'http://localhost:11434',
  modelsUrl: '/api/tags',
  chatPath: '/api/chat',
  authType: 'none',
  isLocal: true,
  ollamaNative: true,
  defaultModel: null
}

const openrouter: ProviderDef = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api',
  modelsUrl: '/v1/models',
  chatPath: '/v1/chat/completions',
  authType: 'bearer',
  authHeaderName: 'Authorization',
  authPrefix: 'Bearer',
  isLocal: false,
  defaultModel: null
}

const groq: ProviderDef = {
  id: 'groq',
  name: 'Groq',
  baseUrl: 'https://api.groq.com/openai',
  modelsUrl: '/v1/models',
  chatPath: '/v1/chat/completions',
  authType: 'bearer',
  authHeaderName: 'Authorization',
  authPrefix: 'Bearer',
  isLocal: false,
  defaultModel: 'llama-3.3-70b-versatile'
}

const gemini: ProviderDef = {
  id: 'gemini',
  name: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com',
  modelsUrl: '/v1beta/models',
  chatPath: '/v1beta/models/{model}:generateContent',
  authType: 'api-key-param',
  authParamName: 'key',
  isLocal: false,
  defaultModel: 'gemini-2.5-flash'
}

const ollamaCloud: ProviderDef = {
  id: 'ollama-cloud',
  name: 'Ollama Cloud',
  baseUrl: 'https://ollama.com',
  modelsUrl: '/v1/models',
  chatPath: '/v1/chat/completions',
  authType: 'bearer',
  authHeaderName: 'Authorization',
  authPrefix: 'Bearer',
  isLocal: false,
  defaultModel: null
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response
}

describe('fetchModelMetadata', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses bundled provider metadata without a network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const meta = await fetchModelMetadata('anthropic', anthropic.baseUrl, '', 'claude-sonnet-4-20250514', anthropic)
    expect(meta).toMatchObject({ contextWindow: 200_000, source: 'provider' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads an Ollama model context length from /api/show model_info', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).endsWith('/api/show')
        ? jsonResponse({ model_info: { 'llama.context_length': 262_144 } })
        : jsonResponse({})
    ))
    const meta = await fetchModelMetadata('ollama-local', ollama.baseUrl, '', 'llama3:8b', ollama)
    expect(meta).toMatchObject({ contextWindow: 262_144, source: 'live', tokenizer: 'local' })
  })

  it('falls back to the num_ctx parameter when model_info has no context length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ parameters: 'num_ctx 32768\nstop "<|end|>"' })))
    const meta = await fetchModelMetadata('ollama-local', ollama.baseUrl, '', 'phi3', ollama)
    expect(meta).toMatchObject({ contextWindow: 32_768, source: 'live' })
  })

  it('reads Ollama Cloud context length from /api/show with bearer auth', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      String(url).endsWith('/api/show')
        ? jsonResponse({ model_info: { 'qwen3.context_length': 262_144 } })
        : jsonResponse({})
    )
    vi.stubGlobal('fetch', fetchMock)
    const meta = await fetchModelMetadata('ollama-cloud', ollamaCloud.baseUrl, 'cloud-key', 'qwen3:32b', ollamaCloud)
    expect(meta).toMatchObject({ contextWindow: 262_144, source: 'live' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://ollama.com/api/show')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer cloud-key')
  })

  it('reads context_length from an OpenAI-compatible catalog (OpenRouter)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'deepseek/deepseek-chat', context_length: 256_000 }]
    })))
    const meta = await fetchModelMetadata('openrouter', openrouter.baseUrl, 'key', 'deepseek/deepseek-chat', openrouter)
    expect(meta).toMatchObject({ contextWindow: 256_000, source: 'live' })
  })

  it('reads context_window from the Groq model list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'llama-3.3-70b-versatile', context_window: 131_072 }]
    })))
    const meta = await fetchModelMetadata('groq', groq.baseUrl, 'key', 'llama-3.3-70b-versatile', groq)
    expect(meta).toMatchObject({ contextWindow: 131_072, source: 'live' })
  })

  it('reads Gemini inputTokenLimit/outputTokenLimit from /v1beta/models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      models: [{ name: 'models/gemini-2.5-flash', inputTokenLimit: 1_048_576, outputTokenLimit: 65_536 }]
    })))
    const meta = await fetchModelMetadata('gemini', gemini.baseUrl, 'key', 'gemini-2.5-flash', gemini)
    expect(meta).toMatchObject({
      contextWindow: 1_048_576,
      outputReserve: 65_536,
      tokenizer: 'sentencepiece',
      source: 'live'
    })
  })

  it('falls back to the known per-model table when no live metadata is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [{ id: 'gpt-4o' }] })))
    const meta = await fetchModelMetadata('openrouter', openrouter.baseUrl, 'key', 'gpt-4o', openrouter)
    expect(meta).toMatchObject({ contextWindow: 128_000, source: 'known' })
  })

  it('reports unknown when neither catalog, live query nor known table match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [{ id: 'mystery-model' }] })))
    const meta = await fetchModelMetadata('openrouter', openrouter.baseUrl, 'key', 'mystery-model', openrouter)
    expect(meta.source).toBe('unknown')
    expect(meta.contextWindow).toBeUndefined()
    expect(meta.error).toBeTruthy()
  })
})
