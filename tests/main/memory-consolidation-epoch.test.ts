/**
 * §F: policy-epoch checks at consolidation commit.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentMemoryStore } from '../../src/main/agent-memory'
import { AgentLedger } from '../../src/main/memory/ledger'
import { DocumentPolicy } from '../../src/main/memory/document-policy'

let dir: string
let file: string
let store: AgentMemoryStore

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-consolidation-epoch-'))
  file = join(dir, 'memory.json')
  store = new AgentMemoryStore(file)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('consolidation epoch guard (§F)', () => {
  it('bumpEpoch advances the policy epoch durably', () => {
    const policy = new DocumentPolicy(new AgentLedger(join(dir, 'ledger.sqlite')))
    const first = policy.bumpEpoch('doc-a')
    expect(first).toBe(1)
    expect(policy.policyEpoch('doc-a')).toBe(1)
    expect(policy.bumpEpoch('doc-a')).toBe(2)
    const reloaded = new DocumentPolicy(new AgentLedger(join(dir, 'ledger.sqlite')))
    expect(reloaded.policyEpoch('doc-a')).toBe(2)
  })

  it('does not publish a summary when allowSummary is false, but still reports the batch', () => {
    for (let i = 0; i < 12; i++) {
      store.add('doc-1', 'user', 'fact', `Fact number ${i}`, 'explicit', 'document')
    }
    const ids = store.consolidate('doc-1', 'Summary content', 10, false)
    expect(ids).not.toBeNull()
    expect(ids!.length).toBe(2)
    // No summary was published when the epoch changed mid-request.
    expect(store.getForDocument('doc-1').filter((e) => e.type === 'summary')).toHaveLength(0)
    // Originals remain active.
    expect(store.countForDocument('doc-1')).toBe(12)
  })
})
