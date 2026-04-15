import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
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
}

export interface Branch {
  name: string
  head: string
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

export class VcsEngine {
  private storePath: string
  private commits: Map<string, Commit> = new Map()
  private branches: Map<string, Branch> = new Map()
  private tags: Map<string, Tag> = new Map()
  private currentBranchName: string = 'main'

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

  private async persist(): Promise<void> {
    const data = {
      commits: Array.from(this.commits.entries()),
      branches: Array.from(this.branches.entries()),
      tags: Array.from(this.tags.entries()),
      currentBranch: this.currentBranchName
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
