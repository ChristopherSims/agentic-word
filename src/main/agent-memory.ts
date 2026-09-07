// ─── Agent Long-Term Memory Store ───
// Per-document persistent memory for the Lexicon AI agent.
// Stores facts, preferences, decisions, corrections, and summaries.
// Supports document-scoped and global memory, recency-weighted retrieval,
// consolidation, editing, and document-type templates.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AgentMemoryEntry, AgentMemoryResult, AgentMemoryApprovalState, AgentMemorySourceType } from '../shared/types'
import { isEligibleForPrompt, findCorrectionClusters, buildClusterSuggestion, defaultApprovalState } from './memory/policy'

export class AgentMemoryStore {
  private entries: Map<string, AgentMemoryEntry> = new Map()
  private filePath: string

  private static TEMPLATES: Record<string, Array<{ type: AgentMemoryEntry['type']; content: string; scope: 'document' | 'global' }>> = {
    novel: [
      { type: 'preference', content: 'Maintain consistent character voices throughout dialogue', scope: 'global' },
      { type: 'preference', content: "Use past tense for narrative prose", scope: 'document' },
      { type: 'preference', content: "Show, don't tell — describe emotions through action and sensory detail", scope: 'document' },
      { type: 'decision', content: 'Chapter breaks at scene transitions, not arbitrary length targets', scope: 'document' },
    ],
    research: [
      { type: 'preference', content: 'Use APA citation style for references', scope: 'document' },
      { type: 'preference', content: 'Write in third person, passive voice for methodology sections', scope: 'document' },
      { type: 'decision', content: 'Structure: Abstract, Introduction, Methods, Results, Discussion, Conclusion', scope: 'document' },
      { type: 'preference', content: 'Cite claims with parenthetical author-year references', scope: 'document' },
    ],
    blog: [
      { type: 'preference', content: 'Conversational tone, second person ("you") address', scope: 'document' },
      { type: 'preference', content: 'Short paragraphs (2-3 sentences max) for readability', scope: 'document' },
      { type: 'decision', content: 'Open with a hook or question, close with a call to action', scope: 'document' },
      { type: 'preference', content: 'Use subheadings every 200-300 words to break up text', scope: 'document' },
    ],
  }

  constructor(filePath?: string) {
    // Path is injectable for tests; production uses the Electron userData dir.
    this.filePath = filePath ?? path.join(app.getPath('userData'), 'agent-memory.json')
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
        const arr: AgentMemoryEntry[] = data.entries || []
        for (const e of arr) {
          // Backward compat: old entries without scope get 'document'
          if (!e.scope) e.scope = 'document'
          this.entries.set(e.id, e)
        }
      }
    } catch {
      console.warn('Failed to load agent memory, starting with empty memory')
    }
  }

  private save(): void {
    try {
      const arr = Array.from(this.entries.values())
      fs.writeFileSync(this.filePath, JSON.stringify({ entries: arr }), 'utf-8')
    } catch {
      console.warn('Failed to persist agent memory to disk')
    }
  }

  add(
    documentId: string,
    agentName: string,
    type: AgentMemoryEntry['type'],
    content: string,
    source: 'explicit' | 'inferred' = 'inferred',
    scope: 'document' | 'global' = 'document',
    provenance?: {
      sourceType?: AgentMemorySourceType
      runId?: string
      originKey?: string
      approvalState?: AgentMemoryApprovalState
    }
  ): AgentMemoryEntry {
    const sourceType: AgentMemorySourceType = provenance?.sourceType ?? (source === 'explicit' ? 'user' : 'agent')
    const entry: AgentMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId: scope === 'global' ? '__global__' : documentId,
      agentName,
      type,
      content,
      createdAt: Date.now(),
      source,
      scope,
      // memory.md §6.3: inferred entries start as candidates and are excluded
      // from prompts until approved. Legacy callers without provenance keep
      // their previous behavior (explicit → approved, inferred → candidate).
      approvalState: provenance?.approvalState ?? defaultApprovalState(source, sourceType),
      sourceType,
      runId: provenance?.runId,
      originKey: provenance?.originKey
    }
    this.entries.set(entry.id, entry)
    this.save()
    return entry
  }

  /**
   * Migrate entries from a legacy memory key (file path, 'default', tab id)
   * to a stable documentId (memory.md §6.1). Idempotent: entries already on
   * the new key are untouched, and the origin key is recorded for traceability.
   */
  rekey(oldKey: string, newKey: string): number {
    if (oldKey === newKey) return 0
    let moved = 0
    for (const entry of this.entries.values()) {
      if (entry.documentId === oldKey && entry.scope !== 'global') {
        entry.documentId = newKey
        entry.originKey = entry.originKey ?? oldKey
        moved++
      }
    }
    if (moved > 0) this.save()
    return moved
  }

  /** Update an entry's approval state (memory.md §6.3 lifecycle). */
  setApproval(id: string, state: AgentMemoryApprovalState): void {
    const entry = this.entries.get(id)
    if (entry) {
      entry.approvalState = state
      this.save()
    }
  }

  /** Candidate entries awaiting user review (memory.md §10.2 Suggestions view). */
  getCandidates(documentId: string): AgentMemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.approvalState === 'candidate' && (e.documentId === documentId || e.scope === 'global'))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getForDocument(documentId: string): AgentMemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId && e.scope !== 'global')
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getGlobal(): AgentMemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.scope === 'global')
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  retrieve(documentId: string, query: string, limit: number = 10): AgentMemoryResult {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)

    // Include both document-scoped and global entries for retrieval.
    // Candidates/rejected/superseded entries are excluded from prompts
    // until approved (memory.md §10.1); legacy entries remain eligible.
    const docEntries = Array.from(this.entries.values())
      .filter((e) => (e.documentId === documentId || e.scope === 'global'))
      .filter(isEligibleForPrompt)
      .sort((a, b) => b.createdAt - a.createdAt)

    if (docEntries.length === 0 || queryWords.length === 0) {
      return { entries: docEntries.slice(0, limit).map(e => ({ ...e, relevanceScore: 0 })), total: docEntries.length }
    }

    const now = Date.now()
    const scored = docEntries.map((entry) => {
      const contentWords = entry.content.toLowerCase().split(/\s+/)
      let keywordScore = 0
      for (const qw of queryWords) {
        if (contentWords.some((cw) => cw.includes(qw))) {
          keywordScore += 1
        }
      }
      keywordScore = keywordScore / queryWords.length  // normalize 0-1

      // Recency decay: half-life of 30 days
      const daysSinceCreation = (now - entry.createdAt) / (1000 * 60 * 60 * 24)
      const recencyScore = Math.exp(-daysSinceCreation / 30)

      // Combined score: keyword match 70%, recency 30%
      const combinedScore = keywordScore * 0.7 + recencyScore * 0.3

      return { entry, score: combinedScore }
    })

    const relevant = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)

    const entries = relevant.slice(0, limit).map((s) => ({
      ...s.entry,
      relevanceScore: s.score
    }))

    return { entries, total: relevant.length }
  }

  update(id: string, content: string): void {
    const entry = this.entries.get(id)
    if (entry) {
      entry.content = content
      this.save()
    }
  }

  delete(id: string): void {
    this.entries.delete(id)
    this.save()
  }

  clearForDocument(documentId: string): void {
    const toRemove: string[] = []
    this.entries.forEach((entry, id) => {
      if (entry.documentId === documentId) {
        toRemove.push(id)
      }
    })
    for (const id of toRemove) {
      this.entries.delete(id)
    }
    this.save()
  }

  countForDocument(documentId: string): number {
    // Superseded entries are retained as evidence but don't count toward the
    // consolidation gate — otherwise the gate never closes after a consolidation
    return Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId && e.scope !== 'global' && e.approvalState !== 'superseded')
      .length
  }

  formatForPrompt(documentId: string, maxEntries: number = 5): string {
    // Only approved (or legacy) entries are injected into prompts (memory.md §10.1)
    const globalEntries = this.getGlobal().filter(isEligibleForPrompt).slice(0, maxEntries)
    const docEntries = this.getForDocument(documentId).filter(isEligibleForPrompt).slice(0, maxEntries)

    const allEntries = [...globalEntries, ...docEntries]
    if (allEntries.length === 0) return ''

    const parts: string[] = []
    // Explicit learning instruction — tell the agent to apply these
    parts.push('The following are corrections and preferences from past interactions. Apply them to your current work. Do not repeat patterns that were previously rejected.')
    if (globalEntries.length > 0) {
      parts.push('Global preferences:')
      globalEntries.forEach((e) => parts.push(`- [${e.type}] ${e.content}`))
    }
    if (docEntries.length > 0) {
      parts.push('Document memory:')
      docEntries.forEach((e) => parts.push(`- [${e.type}] ${e.content}`))
    }
    return parts.join('\n')
  }

  /**
   * Detect 3+ document-scoped corrections that share keywords and add a
   * document-scoped candidate preference suggesting a consolidated rule
   * (memory.md §10.1). The original corrections are retained as evidence —
   * nothing is promoted to global scope or deleted without user approval.
   * Returns the number of suggestions created (0 or 1 per call).
   */
  clusterCorrections(documentId: string): number {
    const corrections = Array.from(this.entries.values())
      .filter((e) => e.type === 'correction' && e.documentId === documentId && e.scope !== 'global')

    if (corrections.length < 3) return 0

    const clusters = findCorrectionClusters(corrections)
    let suggested = 0
    for (const cluster of clusters) {
      // Skip if an equivalent suggestion already exists (avoid duplicates)
      const sample = buildClusterSuggestion(cluster)
      if (!sample) continue
      // Skip if an equivalent suggestion already exists (avoid duplicates).
      // Matches approved suggestions too, so re-approving a cluster later
      // doesn't recreate the same candidate.
      const existing = this.getForDocument(documentId).some(
        (e) =>
          e.type === 'preference' &&
          e.approvalState !== 'rejected' &&
          e.content === sample.content
      )
      if (existing) continue

      this.add(documentId, 'system', 'preference', sample.content, 'inferred', 'document', {
        sourceType: 'system',
        approvalState: 'candidate'
      })
      suggested++
    }

    return suggested
  }

  /**
   * Consolidate old entries into a summary.
   * Replaces entries older than `keepRecentCount` with a single summary entry.
   * @returns The IDs of entries that were consolidated (now deleted), or null if nothing to consolidate
   */
  consolidate(
    documentId: string,
    summaryContent: string,
    keepRecentCount: number = 10
  ): string[] | null {
    // Only active entries are consolidated — already-superseded entries are
    // retained as evidence and never re-processed (prevents duplicate summaries)
    const allEntries = this.getForDocument(documentId).filter((e) => e.approvalState !== 'superseded')
    if (allEntries.length <= keepRecentCount) return null

    // Keep the most recent `keepRecentCount` entries, consolidate the rest.
    // memory.md §4: consolidated entries are superseded rather than deleted so
    // the original evidence remains available for review and deletion policy.
    const toConsolidate = allEntries.slice(keepRecentCount)
    const consolidatedIds = toConsolidate.map((e) => e.id)

    // Mark old entries superseded — excluded from prompts/retrieval but retained
    for (const id of consolidatedIds) {
      const entry = this.entries.get(id)
      if (entry) entry.approvalState = 'superseded'
    }

    // Add summary entry
    const summaryEntry: AgentMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId,
      agentName: 'system',
      type: 'summary',
      content: summaryContent,
      createdAt: Date.now(),
      source: 'inferred',
      scope: 'document',
      approvalState: 'approved',
      sourceType: 'system'
    }
    this.entries.set(summaryEntry.id, summaryEntry)
    this.save()

    return consolidatedIds
  }

  applyTemplate(documentId: string, templateType: string, agentName: string = 'system'): number {
    const template = AgentMemoryStore.TEMPLATES[templateType]
    if (!template) return 0

    let count = 0
    for (const item of template) {
      this.add(documentId, agentName, item.type, item.content, 'explicit', item.scope)
      count++
    }
    return count
  }

  static getTemplateTypes(): string[] {
    return Object.keys(AgentMemoryStore.TEMPLATES)
  }
}