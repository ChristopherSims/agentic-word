/**
 * Provider registry types and loader for the API Gateway / Model Browser.
 * Reads providers.json at runtime so the catalog can be updated without a full release.
 */

import providersJson from './providers.json'

export interface ModelInfo {
  id: string
  name: string
  contextWindow?: number
  tools?: boolean
  vision?: boolean
  streaming?: boolean
  pricing?: {
    inputPer1K: number
    outputPer1K: number
  }
}

export interface ProviderDef {
  id: string
  name: string
  baseUrl: string
  modelsUrl: string | null           // null = no model API (use hardcodedModels)
  chatPath: string                    // path for chat completions, may contain {model} placeholder
  openaiCompatPath?: string          // alternative path for OpenAI-compatible mode (Ollama)
  authType: 'none' | 'bearer' | 'api-key-header' | 'api-key-param'
  authHeaderName?: string            // e.g. 'Authorization', 'x-api-key'
  authPrefix?: string                // e.g. 'Bearer' (prepended to API key)
  authParamName?: string             // query param name for API key (Gemini)
  isLocal: boolean
  ollamaNative?: boolean             // supports Ollama native API format
  defaultModel: string | null        // pre-selected model, null = first in list
  hardcodedModels?: ModelInfo[]      // for providers without a model API (Anthropic)
  modelFilter?: {
    includePatterns?: string[]       // only show models matching these patterns
    excludePatterns?: string[]       // hide models matching these patterns
  }
}

export interface ProviderCatalog {
  providers: ProviderDef[]
}

// Built-in fallback providers used when providers.json is missing or corrupt
const BUILTIN_FALLBACK: ProviderDef[] = [
  {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434',
    modelsUrl: '/api/tags',
    chatPath: '/api/chat',
    openaiCompatPath: '/v1/chat/completions',
    authType: 'none',
    isLocal: true,
    ollamaNative: true,
    defaultModel: null,
    modelFilter: { excludePatterns: ['embed', 'vision', 'clip', 'minilm', 'mxbai', 'llava', 'bakllava', 'all-minilm'] }
  },
  {
    id: 'custom',
    name: 'Custom',
    baseUrl: '',
    modelsUrl: null,
    chatPath: '/v1/chat/completions',
    authType: 'bearer',
    authHeaderName: 'Authorization',
    authPrefix: 'Bearer',
    isLocal: false,
    defaultModel: null,
    hardcodedModels: []
  }
]

function loadProviders(): ProviderDef[] {
  // Use statically imported JSON (Vite resolves this at build time for renderer,
  // Node resolves it at runtime for main process)
  if (providersJson && providersJson.providers && Array.isArray(providersJson.providers) && providersJson.providers.length > 0) {
    return providersJson.providers as ProviderDef[]
  }
  return BUILTIN_FALLBACK
}

const BUILTIN_PROVIDERS = loadProviders()

let cachedCatalog: ProviderCatalog | null = null

export function getProviderCatalog(): ProviderCatalog {
  if (cachedCatalog) return cachedCatalog
  return { providers: BUILTIN_PROVIDERS }
}

export function setProviderCatalog(catalog: ProviderCatalog): void {
  cachedCatalog = catalog
}

export function getProvider(id: string): ProviderDef | undefined {
  const catalog = getProviderCatalog()
  return catalog.providers.find(p => p.id === id)
}

export function getBuiltinProviders(): ProviderDef[] {
  return BUILTIN_PROVIDERS
}
