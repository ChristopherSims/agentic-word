/**
 * Typed memory errors (updates-2.md §A/R13).
 *
 * Callers must be able to distinguish a failed durable commit from a consent
 * refusal or a missing record. Diagnostics carry the code and a short message
 * only — never prompt text, document content, raw worker frames or credentials.
 */

export type MemoryErrorCode =
  | 'write-failed'
  | 'ledger-failed'
  | 'consent-required'
  | 'protected-document'
  | 'not-found'
  | 'worker-unavailable'
  | 'unsupported-worker'
  | 'request-over-budget'
  | 'invalid-input'

export class MemoryError extends Error {
  readonly code: MemoryErrorCode

  constructor(code: MemoryErrorCode, message: string) {
    super(message)
    this.name = 'MemoryError'
    this.code = code
  }
}

export function isMemoryError(value: unknown, code?: MemoryErrorCode): value is MemoryError {
  return value instanceof MemoryError && (code === undefined || value.code === code)
}
