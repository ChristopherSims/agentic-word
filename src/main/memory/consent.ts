/**
 * Consolidated consent boundaries (memory.md §11: "Separate: …" — the seven
 * boundaries, in one reviewable surface).
 *
 * A tool permission is NOT blanket consent for background inference; each
 * boundary below is an independent, user-visible decision with its own
 * gate. Defaults preserve pre-consolidation behavior except where the plan
 * demands otherwise (sharing memory and background summarization stay off).
 *
 * The boundary descriptions live in `shared/consent-boundaries.ts` so the
 * renderer can present the same surface without importing main-process code.
 */

import type { ConsentSettings } from '../../shared/types'
import { CONSENT_BOUNDARIES, type ConsentBoundaryInfo, type ConsentKey } from '../../shared/consent-boundaries'

export type { ConsentSettings, ConsentBoundaryInfo, ConsentKey }
export { CONSENT_BOUNDARIES }

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

/** Merge stored partial settings over the defaults — one effective view. */
export function effectiveConsent(stored: Partial<ConsentSettings> | undefined): ConsentSettings {
  return { ...DEFAULT_CONSENT, ...(stored ?? {}) }
}

/**
 * Boundary 7 helper: is this endpoint local? Local endpoints never count as
 * "sending context to a remote provider".
 *
 * Locality is decided by a validated loopback destination only — a `*.local`
 * mDNS-style hostname (or any other suffix) is NOT treated as local
 * (updates-2.md §C).
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
      host === '::1'
    )
  } catch {
    return false
  }
}
