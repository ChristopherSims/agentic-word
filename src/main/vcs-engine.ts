import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { v4 as uuid } from 'uuid'

export interface Commit {
  id: string
  message: string
  content: string
  timestamp: number
  parents: string[]       // supports merge commits with 2 parents
  branch: string
  tags: string[]
  author?: string          // v0.3.5: who made this commit
}

export interface Branch {
  name: string
  head: string
  protected?: boolean      // v0.3.5: branch protection
}

export interface Tag {
  name: string
  commitId: string
  timestamp: number
}

export interface MergeResult {
  success: boolean
  commit?: Commit
  conflicts?: MergeConflict[]
}

export interface MergeConflict {
  path: string
  ours: string
  theirs: string
  base: string
  resolved?: string
}

export interface GraphNode {
  id: string
  message: string
  timestamp: number
  branch: string
  parents: string[]
  tags: string[]
  isMerge: boolean
  branches: string[]    // branch heads pointing here
}

export interface DiffLine {
  type: 'add' | 'remove' | 'same'
  line: number
  content: string
}

// ─── v0.3.5: Stash ───
export interface StashEntry {
  id: string
  content: string
  branch: string
  message: string
  timestamp: number
}

// ─── v0.3.5: VCS Hooks ───
export interface VcsHooks {
  preCommitLint: boolean
  commitMessageTemplate: string
  protectedBranches: string[]
  requireCommitMessage: boolean
}

export class VcsEngine {
  private storePath: string
  private commits: Map<string, Commit> = new Map()
  private branches: Map<string, Branch> = new Map()
  private tags: Map<string, Tag> = new Map()
  private currentBranchName: string = 'main'
  // v0.3.5
  private stash: StashEntry[] = []
  private hooks: VcsHooks = {
    preCommitLint: false,
    commitMessageTemplate: '',
    protectedBranches: ['main'],
    requireCommitMessage: true
  }

  constructor(docFilePath?: string) {
    if (docFilePath) {
      this.storePath = join(dirname(docFilePath), '.wordapp-vcs')
    } else {
      this.storePath = join(process.cwd(), '.wordapp-vcs')
    }
    this.branches.set('main', { name: 'main', head: '' })
  }

  setDocPath(docFilePath: string): void {
    this.storePath = join(dirname(docFilePath), '.wordapp-vcs')
  }

  async init(): Promise<void> {
    if (!existsSync(this.storePath)) {
      await mkdir(this.storePath, { recursive: true })
    }
    await this.load()
  }

  // ─── Commits ───

  async commit(message: string, content: string): Promise<Commit> {
    const branch = this.branches.get(this.currentBranchName)!
    const commit: Commit = {
      id: uuid().slice(0, 8),
      message,
      content,
      timestamp: Date.now(),
      parents: branch.head ? [branch.head] : [],
      branch: this.currentBranchName,
      tags: []
    }

    this.commits.set(commit.id, commit)
    branch.head = commit.id
    await this.persist()
    return commit
  }

  log(branchName?: string): Commit[] {
    const branch = this.branches.get(branchName || this.currentBranchName)
    if (!branch?.head) return []

    const result: Commit[] = []
    const visited = new Set<string>()
    const queue = [branch.head]

    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)

      const commit = this.commits.get(id)
      if (!commit) continue

      result.push(commit)
      for (const p of commit.parents) {
        if (!visited.has(p)) queue.push(p)
      }
    }

    return result
  }

  allCommits(): Commit[] {
    return Array.from(this.commits.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  getCommit(id: string): Commit | null {
    return this.commits.get(id) || null
  }

  // ─── Branches ───

  async createBranch(name: string): Promise<Branch> {
    const current = this.branches.get(this.currentBranchName)!
    const branch: Branch = { name, head: current.head }
    this.branches.set(name, branch)
    await this.persist()
    return branch
  }

  async switchBranch(name: string): Promise<boolean> {
    if (!this.branches.has(name)) return false
    this.currentBranchName = name
    await this.persist()
    return true
  }

  listBranches(): { name: string; head: string; current: boolean }[] {
    return Array.from(this.branches.values()).map((b) => ({
      name: b.name,
      head: b.head,
      current: b.name === this.currentBranchName
    }))
  }

  currentBranch(): string {
    return this.currentBranchName
  }

  async deleteBranch(name: string): Promise<boolean> {
    if (name === 'main' || name === this.currentBranchName) return false
    const deleted = this.branches.delete(name)
    if (deleted) await this.persist()
    return deleted
  }

  // ─── Tags ───

  async createTag(name: string, commitId?: string): Promise<Tag | null> {
    const cId = commitId || this.branches.get(this.currentBranchName)?.head
    if (!cId || !this.commits.has(cId)) return null

    const tag: Tag = { name, commitId: cId, timestamp: Date.now() }
    this.tags.set(name, tag)

    const commit = this.commits.get(cId)!
    commit.tags = [...(commit.tags || []), name]
    await this.persist()
    return tag
  }

  async deleteTag(name: string): Promise<boolean> {
    const tag = this.tags.get(name)
    if (!tag) return false

    const commit = this.commits.get(tag.commitId)
    if (commit) {
      commit.tags = (commit.tags || []).filter((t) => t !== name)
    }
    this.tags.delete(name)
    await this.persist()
    return true
  }

  listTags(): Tag[] {
    return Array.from(this.tags.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  // ─── Merge ───

  async merge(sourceBranch: string, content: string, message?: string): Promise<MergeResult> {
    const source = this.branches.get(sourceBranch)
    const target = this.branches.get(this.currentBranchName)

    if (!source || !target) {
      return { success: false, conflicts: [] }
    }

    if (source.head === target.head) {
      return { success: true, commit: undefined, conflicts: [] } // already merged
    }

    // Find common ancestor
    const ancestorId = this.findCommonAncestor(target.head, source.head)

    // Check for conflicts
    const ancestorContent = ancestorId ? this.commits.get(ancestorId)?.content || '' : ''
    const targetContent = target.head ? this.commits.get(target.head)?.content || '' : ''
    const sourceContent = source.head ? this.commits.get(source.head)?.content || '' : ''

    const conflicts = this.detectConflicts(ancestorContent, targetContent, sourceContent)

    if (conflicts.length > 0) {
      return { success: false, conflicts }
    }

    // No conflicts — create merge commit
    const mergeCommit: Commit = {
      id: uuid().slice(0, 8),
      message: message || `Merge '${sourceBranch}' into '${this.currentBranchName}'`,
      content,
      timestamp: Date.now(),
      parents: [target.head, source.head].filter(Boolean),
      branch: this.currentBranchName,
      tags: []
    }

    this.commits.set(mergeCommit.id, mergeCommit)
    target.head = mergeCommit.id
    await this.persist()

    return { success: true, commit: mergeCommit, conflicts: [] }
  }

  // ─── Cherry-pick ───

  async cherryPick(commitId: string): Promise<{ success: boolean; commit?: Commit; conflicts?: MergeConflict[] }> {
    const source = this.commits.get(commitId)
    if (!source) return { success: false }

    const branch = this.branches.get(this.currentBranchName)!
    const currentContent = branch.head ? this.commits.get(branch.head)?.content || '' : ''

    // Apply the source commit's content on top of current
    // Simple approach: just use source content (user may need to resolve manually)
    const conflicts = currentContent !== source.content && branch.head !== source.parents[0]
      ? [] // we skip automatic conflict detection for cherry-pick — content is applied directly
      : []

    const picked: Commit = {
      id: uuid().slice(0, 8),
      message: `(cherry-pick ${source.id}) ${source.message}`,
      content: source.content,
      timestamp: Date.now(),
      parents: [branch.head].filter(Boolean),
      branch: this.currentBranchName,
      tags: []
    }

    this.commits.set(picked.id, picked)
    branch.head = picked.id
    await this.persist()

    return { success: true, commit: picked, conflicts }
  }

  // ─── Revert ───

  revert(commitId: string): string | null {
    const commit = this.commits.get(commitId)
    if (!commit) return null
    return commit.content
  }

  // ─── Diff ───

  diff(fromId?: string, toId?: string): { from: string; to: string; fromContent: string; toContent: string; changes: DiffLine[] } {
    const branch = this.branches.get(this.currentBranchName)!
    const toCommitId = toId || branch.head
    const fromCommitId = fromId || (toCommitId ? this.commits.get(toCommitId)?.parents[0] || '' : '')

    const fromContent = fromCommitId ? this.commits.get(fromCommitId)?.content || '' : ''
    const toContent = toCommitId ? this.commits.get(toCommitId)?.content || '' : ''

    return {
      from: fromCommitId || '(empty)',
      to: toCommitId || '(empty)',
      fromContent,
      toContent,
      changes: this.computeDiff(fromContent, toContent)
    }
  }

  // ─── Graph ───

  graph(): GraphNode[] {
    const branchHeads = new Map<string, string>()
    for (const b of this.branches.values()) {
      if (b.head) {
        const existing = branchHeads.get(b.head) || ''
        branchHeads.set(b.head, existing ? `${existing},${b.name}` : b.name)
      }
    }

    return Array.from(this.commits.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((c) => ({
        id: c.id,
        message: c.message,
        timestamp: c.timestamp,
        branch: c.branch,
        parents: c.parents,
        tags: c.tags || [],
        isMerge: c.parents.length > 1,
        branches: branchHeads.get(c.id)?.split(',') || []
      }))
  }

  // ─── Internals ───

  private findCommonAncestor(a: string, b: string): string | null {
    const ancestorsA = new Set<string>()
    const queueA = [a]
    while (queueA.length > 0) {
      const id = queueA.shift()!
      if (ancestorsA.has(id)) continue
      ancestorsA.add(id)
      const c = this.commits.get(id)
      if (c) queueA.push(...c.parents)
    }

    const queueB = [b]
    const visitedB = new Set<string>()
    while (queueB.length > 0) {
      const id = queueB.shift()!
      if (visitedB.has(id)) continue
      visitedB.add(id)
      if (ancestorsA.has(id)) return id
      const c = this.commits.get(id)
      if (c) queueB.push(...c.parents)
    }

    return null
  }

  private detectConflicts(base: string, ours: string, theirs: string): MergeConflict[] {
    const baseLines = base.split('\n')
    const oursLines = ours.split('\n')
    const theirsLines = theirs.split('\n')

    const conflicts: MergeConflict[] = []
    const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length)

    for (let i = 0; i < maxLen; i++) {
      const b = baseLines[i] ?? ''
      const o = oursLines[i] ?? ''
      const t = theirsLines[i] ?? ''

      // Both modified same line differently from base
      if (o !== b && t !== b && o !== t) {
        conflicts.push({
          path: `line ${i + 1}`,
          ours: o,
          theirs: t,
          base: b
        })
      }
    }

    return conflicts
  }

  private computeDiff(from: string, to: string): DiffLine[] {
    const fromLines = from.split('\n')
    const toLines = to.split('\n')
    const changes: DiffLine[] = []
    const maxLen = Math.max(fromLines.length, toLines.length)

    for (let i = 0; i < maxLen; i++) {
      const f = fromLines[i]
      const t = toLines[i]

      if (f === undefined && t !== undefined) {
        changes.push({ type: 'add', line: i + 1, content: t })
      } else if (f !== undefined && t === undefined) {
        changes.push({ type: 'remove', line: i + 1, content: f })
      } else if (f !== t) {
        changes.push({ type: 'remove', line: i + 1, content: f! })
        changes.push({ type: 'add', line: i + 1, content: t! })
      }
    }

    return changes
  }

  // ─── v0.3.5: Stash ───

  async stashPush(message?: string): Promise<StashEntry | null> {
    const branch = this.branches.get(this.currentBranchName)
    if (!branch?.head) return null
    const content = this.commits.get(branch.head)?.content || ''
    const entry: StashEntry = {
      id: uuid().slice(0, 8),
      content,
      branch: this.currentBranchName,
      message: message || `WIP on ${this.currentBranchName}`,
      timestamp: Date.now()
    }
    this.stash.push(entry)
    await this.persist()
    return entry
  }

  async stashPop(): Promise<StashEntry | null> {
    if (this.stash.length === 0) return null
    const entry = this.stash.pop()!
    await this.persist()
    return entry
  }

  async stashApply(id: string): Promise<StashEntry | null> {
    const entry = this.stash.find((s) => s.id === id)
    return entry || null
  }

  async stashDrop(id: string): Promise<boolean> {
    const idx = this.stash.findIndex((s) => s.id === id)
    if (idx === -1) return false
    this.stash.splice(idx, 1)
    await this.persist()
    return true
  }

  stashList(): StashEntry[] {
    return [...this.stash].sort((a, b) => b.timestamp - a.timestamp)
  }

  // ─── v0.3.5: Interactive Rebase ───

  async rebaseSquash(commitIds: string[], message?: string): Promise<Commit | null> {
    // Squash the given commits (in order, oldest first) into a single commit
    if (commitIds.length < 2) return null

    const firstCommit = this.commits.get(commitIds[0])
    if (!firstCommit) return null

    // Use the last commit's content (all changes accumulated)
    const lastCommit = this.commits.get(commitIds[commitIds.length - 1])
    if (!lastCommit) return null

    const branch = this.branches.get(this.currentBranchName)!

    // Create a new squashed commit with first commit's parent
    const squashed: Commit = {
      id: uuid().slice(0, 8),
      message: message || `Squash: ${firstCommit.message} (+${commitIds.length - 1} more)`,
      content: lastCommit.content,
      timestamp: Date.now(),
      parents: firstCommit.parents,
      branch: this.currentBranchName,
      tags: [],
      author: lastCommit.author
    }

    // Remove old commits from the chain and add the squashed one
    for (const cid of commitIds) {
      this.commits.delete(cid)
    }
    this.commits.set(squashed.id, squashed)
    branch.head = squashed.id
    await this.persist()
    return squashed
  }

  async rebaseReorder(commitIds: string[]): Promise<boolean> {
    // Reorder commits by rewriting the chain with new parent links
    // commitIds is the new order (oldest first)
    if (commitIds.length === 0) return false

    const branch = this.branches.get(this.currentBranchName)!
    const firstCommit = this.commits.get(commitIds[0])
    if (!firstCommit) return false

    // Rewrite parent links to match new order
    let previousParent = firstCommit.parents[0] || ''
    for (const cid of commitIds) {
      const commit = this.commits.get(cid)
      if (!commit) return false
      commit.parents = previousParent ? [previousParent] : []
      previousParent = cid
    }

    branch.head = commitIds[commitIds.length - 1]
    await this.persist()
    return true
  }

  async rebaseEdit(commitId: string, newMessage: string): Promise<boolean> {
    const commit = this.commits.get(commitId)
    if (!commit) return false
    commit.message = newMessage
    await this.persist()
    return true
  }

  // ─── v0.3.5: Blame ───

  blame(content: string): Array<{ line: number; text: string; commitId: string; author: string; date: string; message: string }> {
    const lines = content.split('\n')
    const result: Array<{ line: number; text: string; commitId: string; author: string; date: string; message: string }> = []

    // Walk commits from newest to oldest, match content lines
    const lineCommitMap = new Map<number, { commitId: string; author: string; date: string; message: string }>()
    const commitsByTime = Array.from(this.commits.values()).sort((a, b) => b.timestamp - a.timestamp)

    for (const commit of commitsByTime) {
      const commitLines = commit.content.split('\n')
      for (let i = 0; i < commitLines.length && i < lines.length; i++) {
        // Only set if not already assigned (newer commit wins)
        if (!lineCommitMap.has(i) && commitLines[i] === lines[i]) {
          lineCommitMap.set(i, {
            commitId: commit.id,
            author: commit.author || 'Unknown',
            date: new Date(commit.timestamp).toLocaleDateString(),
            message: commit.message.slice(0, 40)
          })
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const info = lineCommitMap.get(i) || { commitId: '???', author: 'Unknown', date: '-', message: '-' }
      result.push({ line: i + 1, text: lines[i], ...info })
    }

    return result
  }

  // ─── v0.3.5: Patch Export/Import ───

  async exportPatch(fromId?: string, toId?: string): Promise<string> {
    const branch = this.branches.get(this.currentBranchName)!
    const toCommitId = toId || branch.head
    const fromCommitId = fromId || (toCommitId ? this.commits.get(toCommitId)?.parents[0] || '' : '')

    const fromContent = fromCommitId ? this.commits.get(fromCommitId)?.content || '' : ''
    const toContent = toCommitId ? this.commits.get(toCommitId)?.content || '' : ''
    const toCommit = toCommitId ? this.commits.get(toCommitId) : null
    const fromCommit = fromCommitId ? this.commits.get(fromCommitId) : null

    // Unified diff format
    const fromLines = fromContent.split('\n')
    const toLines = toContent.split('\n')
    let patch = `From ${fromCommitId || '0000000'} Mon Sep 17 00:00:00 2001\n`
    patch += `From: ${toCommit?.author || 'Unknown'}\n`
    patch += `Date: ${toCommit ? new Date(toCommit.timestamp).toISOString() : new Date().toISOString()}\n`
    patch += `Subject: [PATCH] ${toCommit?.message || 'Changes'}\n\n`
    patch += `---\n`
    patch += ` a/document | ${fromLines.length} lines\n`
    patch += ` b/document | ${toLines.length} lines\n\n`

    const maxLen = Math.max(fromLines.length, toLines.length)
    for (let i = 0; i < maxLen; i++) {
      const f = fromLines[i] || ''
      const t = toLines[i] || ''
      if (f !== t) {
        if (f && !fromLines[i] === undefined) patch += `-${f}\n`
        if (t !== undefined) patch += `+${t}\n`
      }
    }

    patch += `--\n2.x.x\n`
    return patch
  }

  async exportPatchFile(filePath: string, fromId?: string, toId?: string): Promise<{ success: boolean }> {
    const patch = await this.exportPatch(fromId, toId)
    await writeFile(filePath, patch, 'utf-8')
    return { success: true }
  }

  async importPatch(patchContent: string): Promise<{ success: boolean; message?: string; content?: string }> {
    // Simple patch parser: extract + lines, apply them
    try {
      const lines = patchContent.split('\n')
      const additions: Array<{ lineIdx: number; text: string }> = []
      const deletions: Array<{ lineIdx: number; text: string }> = []
      let currentLine = 0

      for (const line of lines) {
        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@') || line.startsWith('From ') || line.startsWith('Date:') || line.startsWith('Subject:') || line.startsWith('--') || line.startsWith(' a/') || line.startsWith(' b/')) continue
        if (line.startsWith('+')) {
          additions.push({ lineIdx: currentLine, text: line.slice(1) })
          currentLine++
        } else if (line.startsWith('-')) {
          deletions.push({ lineIdx: currentLine, text: line.slice(1) })
        } else {
          currentLine++
        }
      }

      // Apply patch to current content
      const branch = this.branches.get(this.currentBranchName)!
      const currentContent = branch.head ? this.commits.get(branch.head)?.content || '' : ''
      const contentLines = currentContent.split('\n')

      // Apply deletions (reverse order to preserve indices)
      for (const d of deletions.reverse()) {
        if (d.lineIdx < contentLines.length && contentLines[d.lineIdx] === d.text) {
          contentLines.splice(d.lineIdx, 1)
        }
      }

      // Apply additions
      for (const a of additions) {
        const idx = Math.min(a.lineIdx, contentLines.length)
        contentLines.splice(idx, 0, a.text)
      }

      const patchedContent = contentLines.join('\n')
      return { success: true, content: patchedContent }
    } catch (err) {
      return { success: false, message: `Patch import failed: ${(err as Error).message}` }
    }
  }

  // ─── v0.3.5: VCS Hooks ───

  getHooks(): VcsHooks {
    return { ...this.hooks }
  }

  async setHooks(hooks: Partial<VcsHooks>): Promise<VcsHooks> {
    this.hooks = { ...this.hooks, ...hooks }
    await this.persist()
    return { ...this.hooks }
  }

  validateCommit(message: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (this.hooks.requireCommitMessage && !message.trim()) {
      errors.push('Commit message is required')
    }
    if (this.hooks.commitMessageTemplate && message.trim()) {
      // Check if message follows template pattern (starts with template prefix)
      const prefix = this.hooks.commitMessageTemplate.split('\n')[0].replace(/\{.*?\}/g, '')
      if (prefix && !message.startsWith(prefix.trim())) {
        // Just a warning, not blocking
      }
    }
    if (this.hooks.protectedBranches.includes(this.currentBranchName)) {
      errors.push(`Branch '${this.currentBranchName}' is protected. Direct commits are restricted.`)
    }
    return { valid: errors.length === 0, errors }
  }

  // ─── v0.3.5: Enhanced Graph (with branch lanes) ───

  graphWithLanes(): { nodes: GraphNode[]; edges: Array<{ from: string; to: string }> } {
    const branchHeads = new Map<string, string>()
    for (const b of this.branches.values()) {
      if (b.head) {
        const existing = branchHeads.get(b.head) || ''
        branchHeads.set(b.head, existing ? `${existing},${b.name}` : b.name)
      }
    }

    const nodes = Array.from(this.commits.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((c) => ({
        id: c.id,
        message: c.message,
        timestamp: c.timestamp,
        branch: c.branch,
        parents: c.parents,
        tags: c.tags || [],
        isMerge: c.parents.length > 1,
        branches: branchHeads.get(c.id)?.split(',') || []
      }))

    const edges: Array<{ from: string; to: string }> = []
    for (const node of nodes) {
      for (const parentId of node.parents) {
        edges.push({ from: parentId, to: node.id })
      }
    }

    return { nodes, edges }
  }

  private async persist(): Promise<void> {
    const data = {
      commits: Array.from(this.commits.entries()),
      branches: Array.from(this.branches.entries()),
      tags: Array.from(this.tags.entries()),
      currentBranch: this.currentBranchName,
      stash: this.stash,
      hooks: this.hooks
    }
    await mkdir(this.storePath, { recursive: true })
    await writeFile(join(this.storePath, 'vcs.json'), JSON.stringify(data, null, 2), 'utf-8')
  }

  private async load(): Promise<void> {
    const filePath = join(this.storePath, 'vcs.json')
    if (!existsSync(filePath)) return

    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw)

    this.commits = new Map(data.commits)
    this.branches = new Map(data.branches)
    this.tags = new Map(data.tags || [])
    this.currentBranchName = data.currentBranch || 'main'
    this.stash = data.stash || []
    this.hooks = data.hooks || {
      preCommitLint: false,
      commitMessageTemplate: '',
      protectedBranches: ['main'],
      requireCommitMessage: true
    }

    // Migrate: ensure commits have `parents` and `tags` fields
    for (const [, commit] of this.commits) {
      if (!commit.parents) {
        commit.parents = commit.parent ? [commit.parent] : []
      }
      if (!commit.tags) {
        commit.tags = []
      }
    }
  }
}
