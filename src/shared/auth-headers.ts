/**
 * Shared auth header builder — constructs HTTP auth headers for a given
 * provider definition and API key. Used by model-fetchers, connection-validator,
 * and agent-bridge to avoid duplicating auth-header logic.
 */

import { type ProviderDef } from './providers'

type str = string

/**
 * Build authentication headers for a provider + API key.
 * Returns an empty object when the provider uses no auth or no key is supplied.
 */
export function buildAuthHeaders(provider: ProviderDef, apiKey: str): Record<str, str> {
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

/**
 * A minimal bearer-auth provider definition for call sites that only have an
 * API key and need standard `Authorization: Bearer <key>` headers (e.g. the
 * agent bridge, which is configured with a raw endpoint/key rather than a full
 * ProviderDef). Kept here so those call sites reuse the same header logic.
 */
export const BEARER_PROVIDER: ProviderDef = {
  id: '__bearer__',
  name: 'Bearer',
  baseUrl: '',
  authType: 'bearer',
  authHeaderName: 'Authorization',
  authPrefix: 'Bearer'
} as unknown as ProviderDef