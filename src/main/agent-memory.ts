// ─── Agent Long-Term Memory Store ───
// Per-document persistent memory for the Lexicon AI agent.
// Stores facts, preferences, decisions, corrections, and summaries.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AgentMemoryEntry, AgentMemoryResult } from '../shared/types'

export class AgentMemoryStore {
  private entries: Map<string, AgentMemoryEntry> = new Map()
  private filePath: string

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
    source: 'explicit' | 'inferred' = 'inferred'
  ): AgentMemoryEntry {
    const entry: AgentMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId,
      agentName,
      type,
      content,
      createdAt: Date.now(),
      source
    }
    this.entries.set(entry.id, entry)
    this.save()
    return entry
  }

  getForDocument(documentId: string): AgentMemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.documentId === documentId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  retrieve(documentId: string, query: string, limit: number = 10): AgentMemoryResult {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)

    const docEntries = this.getForDocument(documentId)

    const scored = docEntries.map((entry) => {
      const contentWords = entry.content.toLowerCase().split(/\s+/)
      let score = 0
      for (const qw of queryWords) {
        if (contentWords.some((cw) => cw.includes(qw))) {
          score += 1
        }
      }
      return { entry, score }
    })

    scored.sort((a, b) => b.score - a.score)

    const entries = scored.slice(0, limit).map((s) => ({
      ...s.entry,
      relevanceScore: s.score
    }))

    return { entries, total: entries.length }
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

  formatForPrompt(documentId: string, maxEntries: number = 5): string {
    const entries = this.getForDocument(documentId).slice(0, maxEntries)
    if (entries.length === 0) return ''
    return entries.map((e) => `- [${e.type}] ${e.content}`).join('\n')
  }
}