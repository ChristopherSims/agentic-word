/**
 * §D/R17: code-point n-gram fallback for scripts without word spaces.
 */

import { describe, expect, it } from 'vitest'
import { isSuppressedContent, shingleHashes } from '../../src/main/memory/deletion'

const rec = (hashes: string[]) => [{ entryId: 'x', documentId: 'd', scope: 'document' as const, hashes, forgottenAt: 0 }]

describe('CJK fingerprint fallback (§D)', () => {
  it('fingerprints a space-less script and matches a re-derivation', () => {
    const forgotten = '写作风格指南'
    const hashes = shingleHashes(forgotten)
    expect(hashes.length).toBeGreaterThan(0)
    expect(isSuppressedContent(`请注意${forgotten}之后再回答`, rec(hashes))).toBe(true)
  })

  it('does not match unrelated space-less content', () => {
    const hashes = shingleHashes('写作风格指南')
    expect(isSuppressedContent('春夏秋冬雨雪风霜', rec(hashes))).toBe(false)
  })
})
