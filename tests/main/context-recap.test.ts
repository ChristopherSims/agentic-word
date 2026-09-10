/**
 * §F: conversation recaps are a distinct, machine-generated evidence type.
 */

import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_RECAP_MARKER,
  condenseConversation,
  isConversationRecap
} from '../../src/main/memory/context-planner'

describe('conversation recap evidence type (§F)', () => {
  it('marks a condensed recap and never treats a normal turn as one', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i} with enough words to be excerpted`
    }))
    const { messages: condensed, condensed: didCondense } = condenseConversation(messages)
    expect(didCondense).toBe(true)
    expect(condensed[0].role).toBe('system')
    expect(isConversationRecap(condensed[0].content)).toBe(true)
    expect(condensed[0].content).toContain(CONVERSATION_RECAP_MARKER)

    expect(isConversationRecap('user: please remember this preference')).toBe(false)
    expect(isConversationRecap('[fact] the user prefers X')).toBe(false)
  })
})
