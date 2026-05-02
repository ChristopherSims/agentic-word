/**
 * HTTP client with configurable timeout, retries, and abort support.
 * Eliminates duplicated fetch patterns across cloud services, agent bridge, and auto-update.
 */

export interface HttpClientOptions {
  baseUrl?: string
  headers?: Record<string, string>
  timeout?: number
  retries?: number
}

export class HttpClient {
  private baseUrl: string
  private headers: Record<string, string>
  private timeout: number
  private retries: number

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl || ''
    this.headers = { 'Content-Type': 'application/json', ...options.headers }
    this.timeout = options.timeout || 30000
    this.retries = options.retries || 0
  }

  async get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, undefined, signal)
  }

  async post<T = unknown>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.request<T>('POST', path, body, signal)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout)

    const combinedSignal = signal
      ? combineAbortSignals(signal, timeoutController.signal)
      : timeoutController.signal

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: combinedSignal,
        })
        clearTimeout(timeoutId)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return (await response.json()) as T
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < this.retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
    }
    clearTimeout(timeoutId)
    throw lastError || new Error('Request failed')
  }
}

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason)
      return controller.signal
    }
    s.addEventListener('abort', () => controller.abort(s.reason), {
      once: true,
    })
  }
  return controller.signal
}
