/**
 * Tests for the agent skill registry — specifically the Proofread skill, whose
 * value is the constraints it places on the model (minimal edits, no rewriting).
 */

import { describe, expect, it } from 'vitest'
import { PROOFREAD_SKILL, AGENT_SKILLS, getAgentSkill } from '../../src/shared/skills'

describe('agent skills', () => {
  it('resolves the proofread skill by id and ignores unknown/empty ids', () => {
    expect(getAgentSkill('proofread')).toBe(PROOFREAD_SKILL)
    expect(getAgentSkill('nope')).toBeUndefined()
    expect(getAgentSkill(undefined)).toBeUndefined()
    expect(AGENT_SKILLS).toContain(PROOFREAD_SKILL)
  })

  it('proofread skill constrains the model to minimal, objective edits', () => {
    const text = `${PROOFREAD_SKILL.instruction}\n${PROOFREAD_SKILL.applyGuidance}`.toLowerCase()
    // Must explicitly forbid rewriting and subjective changes.
    expect(text).toContain('rewrite')
    expect(text).toContain('smallest possible edit')
    expect(text).toContain('never')
    // Must scope corrections to objective error classes.
    expect(text).toContain('grammar')
    expect(text).toContain('punctuation')
    expect(text).toContain('spelling')
  })

  it('proofread skill applies edits through document_replace, not raw output', () => {
    expect(PROOFREAD_SKILL.applyGuidance).toContain('document_replace')
    expect(PROOFREAD_SKILL.applyGuidance.toLowerCase()).toContain('do not output the corrected text')
  })
})
