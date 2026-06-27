/**
 * Connection validator — test endpoint + API key, validate model works.
 * Runs in the main process (Node.js).
 */

import { type ProviderDef } from "../shared/providers"
import { buildChatEndpoint, buildChatRequest } from "./endpoint-builder"

export interface TestResult {
  success: boolean
  message?: string
  error?: string
}

function buildAuthHeaders(provider: ProviderDef, apiKey: string): Record<string, string> {
  if (provider.authType === "none" || !apiKey) return {}
  if (provider.authType === "bearer") {
    const prefix = provider.authPrefix || "Bearer"
    return { [provider.authHeaderName || "Authorization"]: prefix + " " + apiKey }
  }
  if (provider.authType === "api-key-header") {
    return { [provider.authHeaderName || "x-api-key"]: apiKey }
  }
  return {}
}

function buildUrl(baseUrl: string, path: string, provider: ProviderDef, apiKey: string): string {
  let url = baseUrl + path
  if (provider.authType === "api-key-param" && provider.authParamName && apiKey) {
    const sep = url.includes("?") ? "&" : "?"
    url += sep + provider.authParamName + "=" + encodeURIComponent(apiKey)
  }
  return url
}

export async function testConnection(
  provider: ProviderDef,
  baseUrl: string,
  apiKey: string
): Promise<TestResult> {
  if (provider.modelsUrl) {
    try {
      const url = buildUrl(baseUrl, provider.modelsUrl, provider, apiKey)
      const headers = buildAuthHeaders(provider, apiKey)
      const resp = await fetch(url, { headers })
      if (resp.ok) return { success: true, message: "Connected successfully" }
      if (resp.status === 401) return { success: false, error: "Invalid API key" }
      if (resp.status === 404) return { success: false, error: "Endpoint not found — check Server URL" }
      return { success: false, error: "Server returned " + resp.status }
    } catch (err: any) {
      return { success: false, error: "Cannot connect: " + err.message }
    }
  }

  try {
    const model = provider.defaultModel || provider.hardcodedModels?.[0]?.id || "unknown"
    const endpoint = buildChatEndpoint(provider, baseUrl, model)
    const headers = { ...buildAuthHeaders(provider, apiKey), "Content-Type": "application/json" }
    const body = buildChatRequest(provider, model, [{ role: "user", content: "ping" }], { maxTokens: 1 })

    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (resp.ok || resp.status === 400) return { success: true, message: "Connected successfully" }
    if (resp.status === 401 || resp.status === 403) return { success: false, error: "Invalid API key" }
    return { success: false, error: "Server returned " + resp.status }
  } catch (err: any) {
    return { success: false, error: "Cannot connect: " + err.message }
  }
}

export async function validateModel(
  provider: ProviderDef,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<TestResult> {
  try {
    const endpoint = buildChatEndpoint(provider, baseUrl, model)
    const headers = { ...buildAuthHeaders(provider, apiKey), "Content-Type": "application/json" }
    const body = buildChatRequest(provider, model, [{ role: "user", content: "hi" }], { maxTokens: 1 })

    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (resp.ok) return { success: true }
    const data = await resp.json().catch(() => ({}))
    return { success: false, error: data.error?.message || "Model returned " + resp.status }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
