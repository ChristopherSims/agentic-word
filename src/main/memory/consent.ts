/**
 * Consolidated consent boundaries (memory.md §11: "Separate: …" — the seven
 * boundaries, in one reviewable surface).
 *
 * A tool permission is NOT blanket consent for background inference; each
 * boundary below is an independent, user-visible decision with its own
 * gate. Defaults preserve pre-consolidation behavior except where the plan
 * demands otherwise (sharing memory and background summarization stay off).
 */

import type { ConsentSettings } from '../../shared/types'

export type { ConsentSettings }

export type ConsentKey = keyof ConsentSettings

/**
 * Defaults: boundaries 1, 2, 5, 7 were already operating behaviors and stay
 * on; boundaries 3 (gated by the existing memory permission as well), 4
 * (sidecar off by default) and 6 (never shipped) follow the plan's
 * conservative stance — 3 stays on to preserve current approved behavior,
 * 4 and 6 default off.
 */
export const DEFAULT_CONSENT: ConsentSettings = {
  retainLocalChatHistory: true,
  rememberDocumentFacts: true,
  automaticMemoryInference: true,
  backgroundSummarization: false,
  crossDocumentPreferences: true,
  shareMemoryWithCollaborators: false,
  remoteInference: true
}

export interface ConsentBoundaryInfo {
  key: ConsentKey
  /** short title for the settings surface */
  title: string
  /** what the boundary means, in plain language */
  description: string
  /** what concretely happens when it is off */
  whenOff: string
}

/** The seven §11 boundaries, in plan order, for one reviewable surface. */
export const CONSENT_BOUNDARIES: ConsentBoundaryInfo[] = [
  {
    key: 'retainLocalChatHistory',
    title: 'Retain local chat history',
    description:
      'Keep conversations with the assistant on this device (session transcript and the local context sidecar).',
    whenOff: 'Chats are not persisted; context lasts only for the current session.'
  },
  {
    key: 'rememberDocumentFacts',
    title: 'Remember explicit document facts',
    description:
      'Store facts, decisions, and preferences you explicitly ask to remember, scoped to their document.',
    whenOff: '“Remember this” is refused; nothing is written to the memory ledger.'
  },
  {
    key: 'automaticMemoryInference',
    title: 'Automatically infer memory',
    description:
      'Let the assistant propose memory candidates from your conversations. Candidates are never used until you approve them.',
    whenOff: 'No automatic extraction; only explicit saves (if enabled above) create memory.'
  },
  {
    key: 'backgroundSummarization',
    title: 'Summarize history in the background',
    description:
      'Let the local context sidecar compact long conversations (summarization runs on your configured model).',
    whenOff: 'The sidecar stays off; long conversations are condensed deterministically instead.'
  },
  {
    key: 'crossDocumentPreferences',
    title: 'Use preferences across documents',
    description:
      'Allow author-level (“all my documents”) preferences. Promotion from document corrections always requires your approval.',
    whenOff: 'Memory stays document-scoped; “use for all documents” is refused.'
  },
  {
    key: 'shareMemoryWithCollaborators',
    title: 'Share memory in exported bundles',
    description:
      'Include private author preferences when exporting a document bundle. Document-scoped memory is always included.',
    whenOff: 'Exported bundles contain the document and storyboard, but no private profile memory.'
  },
  {
    key: 'remoteInference',
    title: 'Send context to remote providers',
    description:
      'Allow document/chat context to be sent to your configured remote AI provider. Local endpoints (localhost) are unaffected.',
    whenOff: 'Only local endpoints work; remote requests fail with an explicit consent error.'
  }
]

/** Merge stored partial settings over the defaults — one effective view. */
export function effectiveConsent(stored: Partial<ConsentSettings> | undefined): ConsentSettings {
  return { ...DEFAULT_CONSENT, ...(stored ?? {}) }
}

/**
 * Boundary 7 helper: is this endpoint local? Local endpoints never count as
 * "sending context to a remote provider".
 */
export function isLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    const host = url.hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.localhost')
    )
  } catch {
    return false
  }
}
