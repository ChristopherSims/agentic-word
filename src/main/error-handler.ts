/**
 * Centralized error handler for IPC handlers.
 * Provides typed error responses and consistent logging.
 */

import type { IpcMainInvokeEvent } from 'electron'

/**
 * Standard error response shape returned to renderer on handler failure.
 * The renderer can check `success: false` to distinguish errors from normal results.
 */
export interface ErrorResponse {
  success: false
  error: string
  errorCode?: string
  context?: Record<string, unknown>
}

/**
 * Build a typed error response from an unknown error value.
 * Extracts `.message` from Error instances, stringifies everything else.
 * Always logs to console.error for debugging.
 */
export function errorResponse(
  error: unknown,
  context?: Record<string, unknown>,
  errorCode?: string,
): ErrorResponse {
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    `[ErrorHandler] ${errorCode || 'UNKNOWN'}: ${message}`,
    context || '',
  )
  return {
    success: false,
    error: message,
    ...(errorCode ? { errorCode } : {}),
    ...(context ? { context } : {}),
  }
}

/**
 * Wraps an async IPC handler with try-catch and typed error responses.
 * Ensures the renderer never hangs waiting on a failed handler —
 * it always gets back an object with a `success` field.
 *
 * Usage:
 *   ipcMain.handle('my-channel', wrapIpcHandler(async (event, arg) => { ... }))
 */
export function wrapIpcHandler<T>(
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T>,
): (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T | ErrorResponse> {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      return errorResponse(err, { handlerName: handler.name || 'anonymous' })
    }
  }
}

/**
 * Structured logger with context tag.
 * Use everywhere instead of bare console.error / console.log for consistent formatting.
 *
 * Usage:
 *   const log = logger('VcsEngine')
 *   log.info('commit created', { hash: 'abc123' })
 *   log.warn('branch diverged')
 *   log.error('merge failed', { reason: 'conflict' })
 */
export function logger(context: string) {
  return {
    info: (msg: string, data?: unknown) =>
      console.log(`[${context}] ${msg}`, data !== undefined ? data : ''),
    warn: (msg: string, data?: unknown) =>
      console.warn(`[${context}] ${msg}`, data !== undefined ? data : ''),
    error: (msg: string, data?: unknown) =>
      console.error(`[${context}] ${msg}`, data !== undefined ? data : ''),
  }
}
