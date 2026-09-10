/**
 * Main-owned document policy (updates-2.md §B): protection and revocation are
 * durable, keyed by stable document ID, and cannot be downgraded by a
 * renderer flag.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentLedger } from '../../src/main/memory/ledger'
import { DocumentPolicy } from '../../src/main/memory/document-policy'

let dir: string
let dbPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'lexicon-doc-policy-'))
  dbPath = join(dir, 'ledger.sqlite')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('document policy (§B)', () => {
  it('persists protection by stable document id across a restart', () => {
    const policy = new DocumentPolicy(new AgentLedger(dbPath))
    expect(policy.isProtected('doc-a')).toBe(false)
    policy.protect('doc-a')
    expect(policy.isProtected('doc-a')).toBe(true)
    expect(new DocumentPolicy(new AgentLedger(dbPath)).isProtected('doc-a')).toBe(true)
  })

  it('revocation is durable and cannot be downgraded by a renderer flag', () => {
    const policy = new DocumentPolicy(new AgentLedger(dbPath))
    const epoch = policy.revoke('doc-b')
    expect(policy.isRevoked('doc-b')).toBe(true)
    expect(policy.isProtected('doc-b')).toBe(true)
    expect(policy.policyEpoch('doc-b')).toBe(epoch)

    // A renderer asking to loosen protection cannot un-revoke a document.
    policy.setProtected('doc-b', false)
    expect(policy.isProtected('doc-b')).toBe(true)
    expect(policy.isRevoked('doc-b')).toBe(true)

    // An explicit grant clears the deny rule and advances the epoch.
    const granted = policy.grant('doc-b')
    expect(granted).toBeGreaterThan(epoch)
    expect(policy.isRevoked('doc-b')).toBe(false)
  })
})
