/**
 * Outbound request gateway (updates-2.md §C).
 *
 * One authorization/budget boundary for every model-provider HTTP request.
 * Call sites pass a prepared payload (or an already-serialized body); only
 * this module is allowed to dispatch provider traffic, so remote-inference
 * consent and the whole-request size cap cannot be bypassed by a new entry
 * point.
 *
 * Locality (consent boundary 7) is decided by the injected `remoteAllowed`
 * check, which owns the parsed-destination logic; the gateway never inspects
 * hostnames itself.
 */

export type ProviderRequestKind =
  | 'chat'
  | 'completion'
  | 'tool'
  | 'orchestration'
  | 'review'
  | 'consolidation'
  | 'inline'
  | 'summarize'
  | 'translate'
  | 'outline'

export interface GatewayRequest {
  endpoint: string
  /** structured payload; serialized here */
  payload?: unknown
  /** already-serialized body (takes precedence over `payload`) */
  body?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  /** whole-serialized-request cap; refused when exceeded */
  budgetChars?: number
  kind?: ProviderRequestKind
}

export interface RequestGatewayDeps {
  /** boundary 7: is a dispatch to a remote provider currently permitted? */
  remoteAllowed(): boolean
  /** optional observer for accounting/diagnostics (never prompt text) */
  onDispatch?: (info: { kind: ProviderRequestKind; bytes: number }) => void
}

export class ProviderConsentError extends Error {
  readonly code = 'remote-consent-required'
  constructor(message = 'Remote inference is disabled in Privacy settings (consent boundary 7). Only local endpoints are allowed.') {
    super(message)
    this.name = 'ProviderConsentError'
  }
}

export class RequestBudgetError extends Error {
  readonly code = 'request-over-budget'
  constructor(readonly actualChars: number, readonly budgetChars: number) {
    super(`The request is too large for the configured model budget (${actualChars} > ${budgetChars} characters).`)
    this.name = 'RequestBudgetError'
  }
}

export class RequestGateway {
  constructor(private readonly deps: RequestGatewayDeps) {}

  /**
   * Authorize, serialize and dispatch one provider request. Throws a typed
   * error (never silently truncates) when consent is off or the serialized
   * request exceeds its cap.
   */
  async post(req: GatewayRequest): Promise<Response> {
    if (!this.deps.remoteAllowed()) throw new ProviderConsentError()
    const body = req.body ?? JSON.stringify(req.payload)
    if (req.budgetChars !== undefined && body.length > req.budgetChars) {
      throw new RequestBudgetError(body.length, req.budgetChars)
    }
    const kind = req.kind ?? 'completion'
    this.deps.onDispatch?.({ kind, bytes: body.length })
    return fetch(req.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(req.headers ?? {}) },
      body,
      signal: req.signal
    })
  }
}
