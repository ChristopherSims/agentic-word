/**
 * Memory-engine availability gate (updates-2.md §H).
 */

import { describe, expect, it } from 'vitest'
import { memoryEngineAvailability, SUPPORTED_MEMORY_PLATFORMS } from '../../src/main/memory/engine-availability'

describe('memory engine availability (§H)', () => {
  it('is available on supported platforms in development', () => {
    const result = memoryEngineAvailability({ platform: 'win32', isPackaged: false, runtimeBundled: false })
    expect(result.available).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('is explicitly disabled on unsupported platforms with a reason', () => {
    const result = memoryEngineAvailability({ platform: 'darwin', isPackaged: false, runtimeBundled: false })
    expect(result.available).toBe(false)
    expect(result.reason).toBe('unsupported-platform')
    expect(result.detail).toContain('not yet enabled')
    expect(SUPPORTED_MEMORY_PLATFORMS).toContain('win32')
  })

  it('requires a bundled runtime in packaged builds (no system-python fallback)', () => {
    const missing = memoryEngineAvailability({ platform: 'win32', isPackaged: true, runtimeBundled: false })
    expect(missing.available).toBe(false)
    expect(missing.reason).toBe('missing-bundled-runtime')

    const bundled = memoryEngineAvailability({ platform: 'win32', isPackaged: true, runtimeBundled: true })
    expect(bundled.available).toBe(true)
  })

  it('allows a packaged build with an explicit user-configured interpreter', () => {
    const result = memoryEngineAvailability({
      platform: 'win32',
      isPackaged: true,
      runtimeBundled: false,
      configPythonPath: 'C:\\py\\python.exe'
    })
    expect(result.available).toBe(true)
  })
})
