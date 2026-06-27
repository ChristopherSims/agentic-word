/**
 * Model fetchers — per-provider parser functions for model listing.
 * Runs in the main process (Node.js) so no CORS issues.
 */

import { type ProviderDef, type ModelInfo } from '../shared/providers'

type str = string

export interface FetchModelsResult {
  models: ModelInfo[]
  error?: str
}

function buildAuthHeaders(provider: ProviderDef, apiKey: string): Record<str, str> {
  if (provider.authType === 'none' || !apiKey) return {}
  if (provider.authType === 'bearer') {
    const prefix = provider.authPrefix || 'Bearer'
    return { [provider.authHeaderName || 'Authorization']: `${prefix} ${apiKey}` }
  }
  if (provider.authType === 'api-key-header') {
    return { [provider.authHeaderName || 'x-api-key']: apiKey }
  }
  return {}
}

function buildUrl(baseUrl: str, path: str, provider: ProviderDef, apiKey: string): str {
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
