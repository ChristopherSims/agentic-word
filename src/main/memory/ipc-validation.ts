/**
 * Runtime validation for memory IPC inputs (updates-2.md §B).
 *
 * Renderer-supplied values cross a trust boundary: bind run/document IDs,
 * scope enums, booleans and sizes are validated in the main process rather
 * than trusted. Invalid input is rejected with a typed `invalid-input` error.
 */

import { MemoryError } from './errors'
import type { AgentMemoryApprovalState, AgentMemoryEntry, ConsentSettings } from '../../shared/types'

export const MAX_DOCUMENT_ID = 256
export const MAX_MEMORY_CONTENT = 100_000

const VALID_TYPES: ReadonlySet<string> = new Set(['fact', 'preference', 'decision', 'correction', 'summary'])
const VALID_APPROVAL: ReadonlySet<string> = new Set(['candidate', 'approved', 'rejected', 'superseded'])
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

function invalid(name: string, detail: string): never {
  throw new MemoryError('invalid-input', `Invalid ${name}: ${detail}`)
}

/** A stable document/run identifier: non-empty, bounded, no control chars. */
export function assertIdentifier(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' || value.trim() === '') invalid(name, 'expected a non-empty string')
  const id = value as string
  if (id.length > MAX_DOCUMENT_ID) invalid(name, `longer than ${MAX_DOCUMENT_ID} characters`)
  if (CONTROL_CHARS.test(id)) invalid(name, 'contains control characters')
  return id
}

export function assertBoolean(value: unknown, name = 'value'): boolean {
  if (typeof value !== 'boolean') invalid(name, 'expected a boolean')
  return value as boolean
}

export function assertScope(value: unknown): 'document' | 'global' {
  if (value === undefined) return 'document'
  if (value !== 'document' && value !== 'global') invalid('scope', 'expected "document" or "global"')
  return value as 'document' | 'global'
}

export function assertMemoryType(value: unknown): AgentMemoryEntry['type'] {
  if (typeof value !== 'string' || !VALID_TYPES.has(value)) invalid('type', 'unknown memory type')
  return value as AgentMemoryEntry['type']
}

export function assertApprovalState(value: unknown): AgentMemoryApprovalState {
  if (typeof value !== 'string' || !VALID_APPROVAL.has(value)) invalid('approvalState', 'unknown approval state')
  return value as AgentMemoryApprovalState
}

export function assertContent(value: unknown, name = 'content'): string {
  if (typeof value !== 'string' || value.trim() === '') invalid(name, 'expected a non-empty string')
  const content = value as string
  if (content.length > MAX_MEMORY_CONTENT) invalid(name, `longer than ${MAX_MEMORY_CONTENT} characters`)
  return content
}

const CONSENT_KEYS: ReadonlySet<string> = new Set([
  'retainLocalChatHistory',
  'rememberDocumentFacts',
  'automaticMemoryInference',
  'backgroundSummarization',
  'crossDocumentPreferences',
  'shareMemoryWithCollaborators',
  'remoteInference'
])

/** Validate a partial consent update: known boundaries with boolean values. */
export function assertConsentPartial(value: unknown): Partial<ConsentSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('consent', 'expected an object')
  const out: Partial<ConsentSettings> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (!CONSENT_KEYS.has(key)) invalid('consent', `unknown boundary "${key}"`)
    if (typeof val !== 'boolean') invalid(`consent.${key}`, 'expected a boolean')
    ;(out as Record<string, boolean>)[key] = val as boolean
  }
  return out
}
