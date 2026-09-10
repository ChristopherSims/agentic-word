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
export const MAX_LEGACY_KEY = 4096

const VALID_TYPES: ReadonlySet<string> = new Set(['fact', 'preference', 'decision', 'correction', 'summary'])
const VALID_APPROVAL: ReadonlySet<string> = new Set(['candidate', 'approved', 'rejected', 'superseded'])
const VALID_TEMPLATES: ReadonlySet<string> = new Set(['novel', 'research', 'blog'])
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

/** Identifier that may be omitted (undefined/null becomes undefined). */
export function assertOptionalIdentifier(value: unknown, name = 'id'): string | undefined {
  if (value === undefined || value === null) return undefined
  return assertIdentifier(value, name)
}

/** Legacy keys (file paths, 'default', tab ids) — bounded, no control chars. */
export function assertLegacyKey(value: unknown, name = 'key'): string {
  if (typeof value !== 'string' || value.trim() === '') invalid(name, 'expected a non-empty string')
  const key = value as string
  if (key.length > MAX_LEGACY_KEY) invalid(name, `longer than ${MAX_LEGACY_KEY} characters`)
  if (CONTROL_CHARS.test(key)) invalid(name, 'contains control characters')
  return key
}

export function assertTemplateType(value: unknown): string {
  if (typeof value !== 'string' || !VALID_TEMPLATES.has(value)) invalid('templateType', 'unknown template type')
  return value as string
}

export function assertQuarantineAction(value: unknown): 'keep' | 'discard' {
  if (value !== 'keep' && value !== 'discard') invalid('action', 'expected "keep" or "discard"')
  return value
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

export interface RetentionPolicyInput {
  rejectedDays: number | null
  candidateDays: number | null
}

/** Retention policy: non-negative finite day counts or null (keep forever). */
export function assertRetentionPolicy(value: unknown): RetentionPolicyInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('policy', 'expected an object')
  const source = value as Record<string, unknown>
  const day = (v: unknown, name: string): number | null => {
    if (v === null || v === undefined) return null
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) invalid(name, 'expected a non-negative number or null')
    return Math.floor(v as number)
  }
  return {
    rejectedDays: day(source.rejectedDays, 'policy.rejectedDays'),
    candidateDays: day(source.candidateDays, 'policy.candidateDays')
  }
}

export interface ChatMessageInput {
  role: string
  content: string
}

/** Chat submission: a bounded array of role/content messages. */
export function assertChatMessages(value: unknown): ChatMessageInput[] {
  if (!Array.isArray(value) || value.length === 0) invalid('messages', 'expected a non-empty array')
  if (value.length > 1000) invalid('messages', 'too many messages')
  return (value as unknown[]).map((entry, i) => {
    if (!entry || typeof entry !== 'object') invalid(`messages[${i}]`, 'expected an object')
    const role = (entry as { role?: unknown }).role
    const content = (entry as { content?: unknown }).content
    if (typeof role !== 'string' || role.length === 0 || role.length > 32) invalid(`messages[${i}].role`, 'expected a short string')
    if (typeof content !== 'string' || content.length > MAX_MEMORY_CONTENT) invalid(`messages[${i}].content`, 'expected bounded text')
    return { role, content }
  })
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
