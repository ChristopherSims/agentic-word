/**
 * Memory-engine availability (updates-2.md §H).
 *
 * The memory engine ships on Windows first. On other platforms, and in
 * production builds without a bundled, version-validated runtime, it is
 * explicitly unavailable — basic editing is unaffected, and there is no
 * silent fallback to an arbitrary system Python.
 */

export type EngineUnavailableReason = 'unsupported-platform' | 'missing-bundled-runtime'

export interface EngineAvailabilityInput {
  /** process.platform */
  platform: string
  /** app.isPackaged */
  isPackaged: boolean
  /** true when a bundled embeddable runtime was resolved */
  runtimeBundled: boolean
  /** user-configured interpreter (explicit opt-in) */
  configPythonPath?: string
}

export interface EngineAvailability {
  available: boolean
  reason: EngineUnavailableReason | null
  detail: string
}

/** Platforms where the engine is released (extend only after parity evidence). */
export const SUPPORTED_MEMORY_PLATFORMS = ['win32']

export function memoryEngineAvailability(input: EngineAvailabilityInput): EngineAvailability {
  if (!SUPPORTED_MEMORY_PLATFORMS.includes(input.platform)) {
    return {
      available: false,
      reason: 'unsupported-platform',
      detail:
        `The memory engine is not yet enabled on ${input.platform}. ` +
        `It is released on Windows first, once the bundled runtime and packaged tests pass. ` +
        `Basic editing is unaffected.`
    }
  }
  if (input.isPackaged && !input.runtimeBundled && !input.configPythonPath) {
    return {
      available: false,
      reason: 'missing-bundled-runtime',
      detail:
        'A bundled, version-validated memory runtime is required in packaged builds. ' +
        'No system Python fallback is used.'
    }
  }
  return { available: true, reason: null, detail: '' }
}
