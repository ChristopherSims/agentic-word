/**
 * Model fetchers — per-provider parser functions for model listing.
 * Runs in the main process (Node.js) so no CORS issues.
 */

import { type ProviderDef, type ModelInfo } from '../shared/providers'
import { buildAuthHeaders } from '../shared/auth-headers'
import { resolveModelLimits } from './memory/model-budget'

type str = string

export interface FetchModelsResult {
  models: ModelInfo[]
  error?: str
}

export interface ModelMetadataResult {
  model: str
  contextWindow?: number
  outputReserve?: number
  tokenizer?: str
  /** where the window came from: bundled catalog, live provider, known table */
  source: 'provider' | 'live' | 'known' | 'unknown'
  error?: str
}

function buildUrl(baseUrl: str, path: str, provider: ProviderDef, apiKey: str): str {
  let url = `${baseUrl}${path}`
  if (provider.authType === 'api-key-param' && provider.authParamName && apiKey) {
    const sep = url.includes('?') ? '&' : '?'
    url += `${sep}${provider.authParamName}=${encodeURIComponent(apiKey)}`
  }
  return url
}

async function fetchOllamaModels(baseUrl: str, _apiKey: string, provider: ProviderDef): Promise<ModelInfo[]> {
  const url = `${baseUrl}${provider.modelsUrl}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Ollama returned ${resp.status}`)
  const data = await resp.json() as { models?: Array<{ name: str; size: number }> }
  return (data.models || []).map((m) => ({
    id: m.name,
    name: m.name,
  }))
}

async function fetchOpenAICompatibleModels(baseUrl: str, apiKey: string, provider: ProviderDef): Promise<ModelInfo[]> {
  const url = `${baseUrl}${provider.modelsUrl}`
  const headers = buildAuthHeaders(provider, apiKey)
  const resp = await fetch(url, { headers })
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Invalid API key')
    throw new Error(`Server returned ${resp.status}`)
  }
  const data = await resp.json() as { data?: Array<{ id: str }> }
  return (data.data || []).map((m) => ({
    id: m.id,
    name: m.id,
  }))
}

async function fetchGeminiModels(baseUrl: str, apiKey: string, provider: ProviderDef): Promise<ModelInfo[]> {
  const url = buildUrl(baseUrl, provider.modelsUrl!, provider, apiKey)
  const resp = await fetch(url)
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new Error('Invalid API key')
    throw new Error(`Gemini returned ${resp.status}`)
  }
  const data = await resp.json() as { models?: Array<{ name: str; displayName?: str }> }
  return (data.models || []).map((m) => ({
    id: m.name.replace('models/', ''),
    name: m.displayName || m.name.replace('models/', ''),
  }))
}

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

/**
 * Ollama (local and cloud) exposes a model's real context window via
 * `POST /api/show` in `model_info[<architecture>.context_length]` (and, when
 * set, a `num_ctx` parameter). This is the authoritative source for models
 * whose `/v1/models` listing carries no metadata. Cloud requires auth headers.
 */
async function fetchOllamaModelMetadata(
  baseUrl: str,
  model: str,
  headers: Record<str, str> = {},
): Promise<Partial<ModelMetadataResult> | undefined> {
  const resp = await fetch(`${baseUrl}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ model }),
  })
  if (!resp.ok) return undefined
  const data = await resp.json() as { model_info?: Record<string, unknown>; parameters?: str }
  let contextWindow: number | undefined
  for (const [key, value] of Object.entries(data.model_info || {})) {
    if (key.endsWith('.context_length')) {
      contextWindow = positiveNumber(value)
      if (contextWindow) break
    }
  }
  if (!contextWindow && data.parameters) {
    const match = /(?:^|\s)num_ctx\s+(\d+)/.exec(data.parameters)
    if (match) contextWindow = positiveNumber(match[1])
  }
  return contextWindow ? { contextWindow, tokenizer: 'local', source: 'live' } : undefined
}

/**
 * OpenAI-compatible catalogs (OpenRouter, Groq, ...) list a per-model
 * `context_length`/`context_window` alongside the id. Other providers return
 * only ids, in which case no window is reported here.
 */
async function fetchOpenAICompatibleModelMetadata(
  baseUrl: str,
  apiKey: string,
  provider: ProviderDef,
  model: str,
): Promise<Partial<ModelMetadataResult> | undefined> {
  if (!provider.modelsUrl) return undefined
  const resp = await fetch(`${baseUrl}${provider.modelsUrl}`, { headers: buildAuthHeaders(provider, apiKey) })
  if (!resp.ok) return undefined
  const data = await resp.json() as { data?: Array<Record<string, unknown>> }
  const entry = (data.data || []).find((m) => m.id === model || m.name === model)
  if (!entry) return undefined
  const contextWindow = positiveNumber(entry.context_length ?? entry.contextWindow ?? entry.context_window)
  return contextWindow ? { contextWindow, source: 'live' } : undefined
}

/**
 * Gemini's model catalog (`/v1beta/models`) reports `inputTokenLimit` and
 * `outputTokenLimit` per model — the only provider that returns both the
 * context window and the output reserve directly.
 */
async function fetchGeminiModelMetadata(
  baseUrl: str,
  apiKey: string,
  provider: ProviderDef,
  model: str,
): Promise<Partial<ModelMetadataResult> | undefined> {
  if (!provider.modelsUrl) return undefined
  const resp = await fetch(buildUrl(baseUrl, provider.modelsUrl, provider, apiKey))
  if (!resp.ok) return undefined
  const data = await resp.json() as {
    models?: Array<{ name: str; inputTokenLimit?: number; outputTokenLimit?: number }>
  }
  const entry = (data.models || []).find((m) => m.name === model || m.name === `models/${model}`)
  const contextWindow = positiveNumber(entry?.inputTokenLimit)
  if (!contextWindow) return undefined
  return {
    contextWindow,
    outputReserve: positiveNumber(entry?.outputTokenLimit),
    tokenizer: 'sentencepiece',
    source: 'live',
  }
}

/**
 * Live per-provider metadata lookup. Each provider uses the endpoint already
 * configured on its `ProviderDef` (or the native Ollama `/api/show` for both
 * local and cloud); unknown providers fall back to the generic
 * OpenAI-compatible model list.
 */
async function fetchLiveModelMetadata(
  providerId: str,
  baseUrl: str,
  apiKey: string,
  provider: ProviderDef,
  model: str,
): Promise<Partial<ModelMetadataResult> | undefined> {
  // Ollama native API (local or cloud) reports the true window; the
  // OpenAI-compatible `/v1/models` listing does not.
  if (provider.ollamaNative || providerId === 'ollama-cloud') {
    const viaShow = await fetchOllamaModelMetadata(baseUrl, model, buildAuthHeaders(provider, apiKey))
    if (viaShow?.contextWindow) return viaShow
  }

  switch (providerId) {
    case 'gemini':
      return fetchGeminiModelMetadata(baseUrl, apiKey, provider, model)
    default:
      return provider.modelsUrl
        ? fetchOpenAICompatibleModelMetadata(baseUrl, apiKey, provider, model)
        : undefined
  }
}

/**
 * Resolve a single model's metadata for the context-budget settings. Order:
 * bundled provider catalog → live provider query → known per-model table.
 * Never throws; returns `source: 'unknown'` when nothing is available.
 */
export async function fetchModelMetadata(
  providerId: str,
  baseUrl: str,
  apiKey: string,
  model: str,
  provider: ProviderDef,
): Promise<ModelMetadataResult> {
  const hardcoded = provider.hardcodedModels?.find((m) => m.id === model)
  if (hardcoded?.contextWindow) {
    return { model, contextWindow: hardcoded.contextWindow, source: 'provider' }
  }

  try {
    const live = await fetchLiveModelMetadata(providerId, baseUrl, apiKey, provider, model)
    if (live?.contextWindow) {
      return {
        model,
        contextWindow: live.contextWindow,
        outputReserve: live.outputReserve,
        tokenizer: live.tokenizer,
        source: live.source ?? 'live',
      }
    }
  } catch {
    // Live lookup is best-effort; fall through to the known table.
  }

  const known = resolveModelLimits(model)
  if (known.source === 'known') {
    return {
      model,
      contextWindow: known.contextWindow,
      outputReserve: known.outputReserve,
      tokenizer: known.tokenizer,
      source: 'known',
    }
  }

  return { model, source: 'unknown', error: 'No context window metadata available for this model' }
}


const ALWAYS_EXCLUDE_PATTERNS = [
  'embed', 'moderation', 'whisper', 'tts', 'dall-e',
  'nomic-embed-text', 'all-minilm', 'mxbai-embed', 'llava', 'bakllava',
]

function filterModels(models: ModelInfo[], provider: ProviderDef): ModelInfo[] {
  let filtered = models

  if (provider.modelFilter?.includePatterns?.length) {
    filtered = filtered.filter((m) =>
      provider.modelFilter!.includePatterns!.some((p) =>
        m.id.toLowerCase().includes(p.toLowerCase())
      )
    )
  }

  if (provider.modelFilter?.excludePatterns?.length) {
    filtered = filtered.filter((m) =>
      !provider.modelFilter!.excludePatterns!.some((p) =>
        m.id.toLowerCase().includes(p.toLowerCase())
      )
    )
  }

  filtered = filtered.filter((m) =>
    !ALWAYS_EXCLUDE_PATTERNS.some((p) =>
      m.id.toLowerCase().includes(p.toLowerCase())
    )
  )

  return filtered
}

export async function fetchModels(
  providerId: str,
  baseUrl: str,
  apiKey: string, provider: ProviderDef
): Promise<FetchModelsResult> {
  try {
    if (!provider.modelsUrl) {
      const models = provider.hardcodedModels || []
      return { models: filterModels(models, provider) }
    }

    let models: ModelInfo[]

    switch (providerId) {
      case 'ollama-local':
        models = await fetchOllamaModels(baseUrl, apiKey, provider)
        break
      case 'gemini':
        models = await fetchGeminiModels(baseUrl, apiKey, provider)
        break
      default:
        models = await fetchOpenAICompatibleModels(baseUrl, apiKey, provider)
        break
    }

    return { models: filterModels(models, provider) }
  } catch (err: any) {
    return { models: [], error: err.message || 'Failed to fetch models' }
  }
}
