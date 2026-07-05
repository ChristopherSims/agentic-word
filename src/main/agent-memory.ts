// ─── Agent Long-Term Memory Store ───
// Per-document persistent memory for the Lexicon AI agent.
// Stores facts, preferences, decisions, corrections, and summaries.
// Supports document-scoped and global memory, recency-weighted retrieval,
// consolidation, editing, and document-type templates.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AgentMemoryEntry, AgentMemoryResult } from '../shared/types'

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

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'agent-memory.json')
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
    scope: 'document' | 'global' = 'document'
  ): AgentMemoryEntry {
    const entry: AgentMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId: scope === 'global' ? '__global__' : documentId,
      agentName,
      type,
      content,
      createdAt: Date.now(),
      source,
      scope
    }
    this.entries.set(entry.id, entry)
    this.save()
    return entry
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

    // Include both document-scoped and global entries for retrieval
    const docEntries = Array.from(this.entries.values())
      .filter((e) => (e.documentId === documentId || e.scope === 'global'))
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
    return Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId && e.scope !== 'global')
      .length
  }

  formatForPrompt(documentId: string, maxEntries: number = 5): string {
    // Global entries apply to all documents
    const globalEntries = this.getGlobal().slice(0, maxEntries)

    // Document entries apply to this document only
    const docEntries = this.getForDocument(documentId).slice(0, maxEntries)

    const allEntries = [...globalEntries, ...docEntries]
    if (allEntries.length === 0) return ''

    const parts: string[] = []
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
   * Consolidate old entries into a summary.
   * Replaces entries older than `keepRecentCount` with a single summary entry.
   * @returns The IDs of entries that were consolidated (now deleted), or null if nothing to consolidate
   */
  consolidate(
    documentId: string,
    summaryContent: string,
    keepRecentCount: number = 10
  ): string[] | null {
    const allEntries = this.getForDocument(documentId)
    if (allEntries.length <= keepRecentCount) return null

    // Keep the most recent `keepRecentCount` entries, consolidate the rest
    const toConsolidate = allEntries.slice(keepRecentCount)
    const consolidatedIds = toConsolidate.map((e) => e.id)

    // Delete old entries
    for (const id of consolidatedIds) {
      this.entries.delete(id)
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
      scope: 'document'
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