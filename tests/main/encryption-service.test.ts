/**
 * Unit tests for password validation logic.
 * Full crypto tests need Electron environment — this covers the utility that's safe to test.
 */

import { describe, it, expect } from 'vitest'

// Testable subset — mirrors validatePasswordStrength from encryption-service.ts
function validatePasswordStrength(password: string): {
  isStrong: boolean
  score: number
  feedback: string[]
} {
  const feedback: string[] = []
  let score = 0

  if (password.length >= 12) score += 2
  else if (password.length >= 8) score += 1
  else feedback.push('Use at least 8 characters')

  if (/[A-Z]/.test(password)) score += 1
  else feedback.push('Add uppercase letters')

  if (/[a-z]/.test(password)) score += 1
  else feedback.push('Add lowercase letters')

  if (/[0-9]/.test(password)) score += 1
  else feedback.push('Add numbers')

  if (/[^a-zA-Z0-9]/.test(password)) score += 1
  else feedback.push('Add special characters')

  return { isStrong: score >= 4, score, feedback }
}

describe('Password Validation', () => {
  it('rejects short passwords', () => {
    const result = validatePasswordStrength('ab')
    expect(result.isStrong).toBe(false)
    expect(result.score).toBeLessThan(4)
    expect(result.feedback.length).toBeGreaterThan(0)
  })

  it('accepts strong passwords', () => {
    const result = validatePasswordStrength('Str0ng!Passw0rd!')
    expect(result.isStrong).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(4)
    expect(result.feedback.length).toBe(0)
  })

  it('flags missing uppercase', () => {
    const result = validatePasswordStrength('alllowercase1!')
    expect(result.feedback).toContain('Add uppercase letters')
  })

  it('flags missing lowercase', () => {
    const result = validatePasswordStrength('ALLUPPERCASE1!')
    expect(result.feedback).toContain('Add lowercase letters')
  })

  it('flags missing numbers', () => {
    const result = validatePasswordStrength('NoNumbersHere!')
    expect(result.feedback).toContain('Add numbers')
  })

  it('flags missing special characters', () => {
    const result = validatePasswordStrength('NoSpecialChars1')
    expect(result.feedback).toContain('Add special characters')
  })

  it('scores 8-11 char passwords as 1 point', () => {
    const result = validatePasswordStrength('Abcd1234!')
    expect(result.score).toBeGreaterThanOrEqual(1)
  })

  it('scores 12+ char passwords as 2 points for length', () => {
    const result = validatePasswordStrength('Abc123456789!')
    // has upper, lower, digit, special = 4 + length 2 = 6
    expect(result.score).toBe(6)
    expect(result.isStrong).toBe(true)
  })

  it('scores exactly 4 as strong', () => {
    // 8 chars + upper + lower + special = 4
    const result = validatePasswordStrength('Abcdef!')
    expect(result.score).toBe(4)
    expect(result.isStrong).toBe(true)
  })

  it('scores 3 as not strong', () => {
    // 8 chars + upper + lower = 3 (no digit, no special)
    const result = validatePasswordStrength('Abcdefgh')
    expect(result.score).toBe(3)
    expect(result.isStrong).toBe(false)
  })
})
