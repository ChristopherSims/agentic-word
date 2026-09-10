/**
 * Projection coordinator (updates-2.md §E).
 *
 * Mnesis is a disposable conversation projection, never the authoritative
 * source for retained history. Each projection generation lives in its own
 * owned directory so it can be disposed by closing it and removing its files
 * — never by editing upstream Mnesis tables. The ledger records generation
 * identity and lifecycle (`projection_generations`); the Python worker owns
 * the generation's database files.
 *
 * Path handling is defensive: generation directories are confined to the base
 * directory and symlink/reparse-point escapes are rejected before any removal.
 */

import { randomUUID } from 'node:crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { ProjectionGeneration, ProjectionGenerationState } from './ledger'
import { AgentLedger } from './ledger'
import { ControlStore } from './control-store'

export interface BeginGenerationInput {
  documentId: string
  branchId?: string | null
  sessionId?: string | null
  profileId?: string | null
  sourceEpoch?: number
  ledgerSequence?: number
}

const GENERATION_ID_RE = /^[A-Za-z0-9_-]+$/

export class ProjectionCoordinator {
  private readonly control: ControlStore
  constructor(
    control: ControlStore | AgentLedger,
    private readonly baseDir: string
  ) {
    this.control = control instanceof ControlStore ? control : ControlStore.fromLedger(control)
  }

  /** Directory owned by one generation (created on begin). */
  generationDir(generationId: string): string {
    return this.resolveOwnedDir(generationId)
  }

  /** The per-generation Mnesis database file the worker is pointed at. */
  generationDbPath(generationId: string): string {
    return path.join(this.generationDir(generationId), 'sessions.db')
  }

  /**
   * Begin a new staging generation. An owned, empty directory is created by
   * default; pass `createDir: false` to record metadata only (used while the
   * worker still shares one database, before per-generation files are active).
   */
  beginGeneration(input: BeginGenerationInput, opts: { createDir?: boolean } = {}): ProjectionGeneration {
    const generationId = `gen_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
    if (opts.createDir !== false) {
      fs.mkdirSync(this.resolveOwnedDir(generationId), { recursive: true })
    }
    const generation: ProjectionGeneration = {
      generationId,
      documentId: input.documentId,
      branchId: input.branchId ?? null,
      sessionId: input.sessionId ?? null,
      profileId: input.profileId ?? null,
      sourceEpoch: input.sourceEpoch ?? 0,
      ledgerSequence: input.ledgerSequence ?? 0,
      mnesisSessionId: null,
      state: 'staging',
      createdAt: Date.now()
    }
    this.control.upsertProjectionGeneration(generation)
    return generation
  }

  recordMnesisSession(generationId: string, mnesisSessionId: string): void {
    const generation = this.control.getProjectionGeneration(generationId)
    if (!generation) throw new Error(`Unknown projection generation: ${generationId}`)
    this.control.upsertProjectionGeneration({ ...generation, mnesisSessionId })
  }

  /**
   * Return the active generation for one projection key (session identity),
   * creating an owned directory and activating a fresh one when none exists.
   * The returned generation's `generationDbPath` is the Mnesis database the
   * worker should use.
   */
  ensureDocumentGeneration(
    documentId: string,
    sessionKey: string = documentId,
    opts: { createDir?: boolean } = {}
  ): ProjectionGeneration {
    const active = this.activeGenerationFor(documentId, sessionKey)
    if (active) return active
    const generation = this.beginGeneration({ documentId, sessionId: sessionKey }, opts)
    this.activate(generation.generationId)
    return generation
  }

  /**
   * Begin a fresh generation for a projection key and atomically activate it,
   * superseding the previous one (used by rebuilds, R11/§E). The caller
   * replays all eligible events into the new generation's database.
   */
  refreshGeneration(documentId: string, sessionKey: string = documentId): ProjectionGeneration {
    const generation = this.beginGeneration({ documentId, sessionId: sessionKey })
    this.activate(generation.generationId)
    return generation
  }

  /** Atomically make one generation the active reader for its document. */
  activate(generationId: string): void {
    this.control.activateProjectionGeneration(generationId)
  }

  activeGeneration(documentId: string): ProjectionGeneration | null {
    return this.control.listProjectionGenerations(documentId).find((g) => g.state === 'active') ?? null
  }

  /** Active generation for one session key (projection identity), if any. */
  activeGenerationFor(documentId: string, sessionKey: string): ProjectionGeneration | null {
    return this.control
      .listProjectionGenerations(documentId)
      .find((g) => g.state === 'active' && (g.sessionId ?? documentId) === sessionKey) ?? null
  }

  generations(documentId: string): ProjectionGeneration[] {
    return this.control.listProjectionGenerations(documentId)
  }

  /**
   * Retire generations that were superseded by an activation that has since
   * been validated (updates-2.md §E): remove their owned files and mark them
   * disposed. Only ever call this after the replacement generation is active
   * and populated. Returns how many were retired.
   */
  retireSuperseded(documentId: string): number {
    let retired = 0
    for (const generation of this.control.listProjectionGenerations(documentId)) {
      if (generation.state !== 'superseded') continue
      this.dispose(generation.generationId)
      retired++
    }
    return retired
  }

  /**
   * Dispose a generation: remove every file it owns, then mark it disposed.
   * Refuses traversal, symlink and reparse-point escapes.
   */
  dispose(generationId: string): { removedFiles: number } {
    const dir = this.resolveOwnedDir(generationId)
    let removedFiles = 0
    if (fs.existsSync(dir)) {
      const real = fs.realpathSync(dir)
      if (!this.isInsideBase(real)) {
        throw new Error(`Refusing to dispose generation outside its base directory: ${generationId}`)
      }
      for (const entry of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
        removedFiles++
      }
      fs.rmdirSync(dir)
    }
    this.setGenerationState(generationId, 'disposed')
    return { removedFiles }
  }

  setGenerationState(generationId: string, state: ProjectionGenerationState): void {
    this.control.setProjectionGenerationState(generationId, state)
  }

  // ─── path confinement ───

  private resolveOwnedDir(generationId: string): string {
    if (!GENERATION_ID_RE.test(generationId)) {
      throw new Error(`Invalid generation id: ${generationId}`)
    }
    const base = path.resolve(this.baseDir)
    const dir = path.resolve(base, generationId)
    if (!this.isInsideBase(dir, base)) {
      throw new Error(`Generation path escapes its base directory: ${generationId}`)
    }
    return dir
  }

  private isInsideBase(candidate: string, base: string = path.resolve(this.baseDir)): boolean {
    const resolved = path.resolve(candidate)
    return resolved === base || resolved.startsWith(base + path.sep)
  }
}
