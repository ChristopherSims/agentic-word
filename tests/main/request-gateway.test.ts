/**
 * Outbound request gateway (updates-2.md §C): one authorization/budget
 * boundary for provider dispatches.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestGateway, ProviderConsentError, RequestBudgetError } from '../../src/main/ai/request-gateway'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('request gateway (§C)', () => {
  it('refuses a dispatch when remote consent is off', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new RequestGateway({ remoteAllowed: () => false })
    await expect(gateway.post({ endpoint: 'https://provider.invalid/v1', payload: { a: 1 } })).rejects.toBeInstanceOf(
      ProviderConsentError
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a request that exceeds its whole-serialized budget', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new RequestGateway({ remoteAllowed: () => true })
    await expect(
      gateway.post({ endpoint: 'https://provider.invalid/v1', payload: { big: 'x'.repeat(100) }, budgetChars: 10 })
    ).rejects.toBeInstanceOf(RequestBudgetError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dispatches a serialized POST with merged headers when allowed', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method?: string; body?: string; headers?: Record<string, string> }) =>
        new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)
    const gateway = new RequestGateway({ remoteAllowed: () => true })
    await gateway.post({
      endpoint: 'https://provider.invalid/v1',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
      headers: { Authorization: 'Bearer token' },
      budgetChars: 1000,
      kind: 'chat'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://provider.invalid/v1')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).messages[0].content).toBe('hi')
    expect(init.headers!.Authorization).toBe('Bearer token')
    expect(init.headers!['Content-Type']).toBe('application/json')
  })
})
