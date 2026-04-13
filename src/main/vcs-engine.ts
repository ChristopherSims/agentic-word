import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { v4 as uuid } from 'uuid'

interface Commit {
  id: string
  message: string
  content: string
  timestamp: number
  parent: string | null
  branch: string
}

interface Branch {
  name: string
  head: string
}

export class VcsEngine {
  private storePath: string
  private commits: Map<string, Commit> = new Map()
  private branches: Map<string, Branch> = new Map()
  private currentBranchName: string = 'main'

  constructor() {
    this.storePath = join(process.cwd(), '.wordapp-vcs')
    this.branches.set('main', { name: 'main', head: '' })
  }

  async init(): Promise<void> {
    if (!existsSync(this.storePath)) {
      await mkdir(this.storePath, { recursive: true })
    }
    await this.load()
  }

  async commit(message: string, content: string): Promise<Commit> {
    const branch = this.branches.get(this.currentBranchName)!
    const commit: Commit = {
      id: uuid().slice(0, 8),
      message,
      content,
      timestamp: Date.now(),
      parent: branch.head || null,
      branch: this.currentBranchName
    }

    this.commits.set(commit.id, commit)
    branch.head = commit.id
    await this.persist()

    return commit
  }

  log(): Commit[] {
    const branch = this.branches.get(this.currentBranchName)
    if (!branch?.head) return []

    const result: Commit[] = []
    let current: Commit | null = this.commits.get(branch.head) || null

    while (current) {
      result.push(current)
      current = current.parent ? this.commits.get(current.parent) || null : null
    }

    return result
  }

  diff(fromId?: string, toId?: string): { from: string; to: string; changes: DiffLine[] } {
    const branch = this.branches.get(this.currentBranchName)!
    const toCommitId = toId || branch.head
    const fromCommitId = fromId || this.commits.get(toCommitId!)?.parent || ''

    const fromContent = fromCommitId ? this.commits.get(fromCommitId)?.content || '' : ''
    const toContent = toCommitId ? this.commits.get(toCommitId)?.content || '' : ''

    return {
      from: fromCommitId,
      to: toCommitId || '',
      changes: this.computeDiff(fromContent, toContent)
    }
  }

  createBranch(name: string): Branch {
    const current = this.branches.get(this.currentBranchName)!
    const branch: Branch = { name, head: current.head }
    this.branches.set(name, branch)
    this.persist()
    return branch
  }

  switchBranch(name: string): boolean {
    if (!this.branches.has(name)) return false
    this.currentBranchName = name
    this.persist()
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

  revert(commitId: string): string | null {
    const commit = this.commits.get(commitId)
    if (!commit) return null
    return commit.content
  }

  getCommit(commitId: string): Commit | null {
    return this.commits.get(commitId) || null
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
      currentBranch: this.currentBranchName
    }
    await writeFile(join(this.storePath, 'vcs.json'), JSON.stringify(data, null, 2), 'utf-8')
  }

  private async load(): Promise<void> {
    const filePath = join(this.storePath, 'vcs.json')
    if (!existsSync(filePath)) return

    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw)

    this.commits = new Map(data.commits)
    this.branches = new Map(data.branches)
    this.currentBranchName = data.currentBranch || 'main'
  }
}

interface DiffLine {
  type: 'add' | 'remove' | 'same'
  line: number
  content: string
}
