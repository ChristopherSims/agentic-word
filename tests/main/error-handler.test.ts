/**
 * Unit tests for the error handler utility.
 */

import { describe, it, expect } from 'vitest'
import { errorResponse, wrapIpcHandler, logger } from '../../src/main/error-handler'

describe('errorResponse', () => {
  it('wraps an Error instance with its message', () => {
    const result = errorResponse(new Error('test error'))
    expect(result).toEqual({ success: false, error: 'test error' })
  })

  it('wraps a string error', () => {
    const result = errorResponse('something broke')
    expect(result).toEqual({ success: false, error: 'something broke' })
  })

  it('includes errorCode when provided', () => {
    const result = errorResponse('fail', undefined, 'E001')
    expect(result.errorCode).toBe('E001')
  })

  it('does not include errorCode when omitted', () => {
    const result = errorResponse('fail')
    expect(result.errorCode).toBeUndefined()
  })

  it('includes context when provided', () => {
    const result = errorResponse('fail', { handlerName: 'test' })
    expect(result.context).toEqual({ handlerName: 'test' })
  })
})

describe('wrapIpcHandler', () => {
  it('returns handler result on success', async () => {
    const wrapped = wrapIpcHandler(async () => ({ data: 'ok' }))
    const result = await wrapped({} as any, 'arg1')
    expect(result).toEqual({ data: 'ok' })
  })

  it('returns error response on thrown Error', async () => {
    const wrapped = wrapIpcHandler(async () => {
      throw new Error('boom')
    })
    const result = await wrapped({} as any)
    expect(result).toEqual({
      success: false,
      error: 'boom',
    })
  })

  it('returns error response on thrown string', async () => {
    const wrapped = wrapIpcHandler(async () => {
      throw 'raw string error'
    })
    const result = await wrapped({} as any)
    expect(result?.success).toBe(false)
    expect(result?.error).toBe('raw string error')
  })

  it('includes handler name in context on error', async () => {
    const myHandler = async () => {
      throw new Error('fail')
    }
    const wrapped = wrapIpcHandler(myHandler)
    const result = await wrapped({} as any)
    expect(result?.context).toBeDefined()
  })
})

describe('logger', () => {
  it('returns a logger object with info, warn, error methods', () => {
    const log = logger('TestModule')
    expect(log).toHaveProperty('info')
    expect(log).toHaveProperty('warn')
    expect(log).toHaveProperty('error')
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
  })
})
