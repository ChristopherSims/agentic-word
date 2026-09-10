/**
 * Worker-backed store factory (updates-2.md §A).
 *
 * Builds an `AgentMemoryStore` whose single writer runs off the main thread.
 * Reads are served from the in-memory snapshot; mutations are committed with
 * `store.flush()` (write-behind). The main thread never opens the SQLite file.
 */

import { AgentMemoryStore } from '../agent-memory'
import { createLedgerDriver } from './ledger-driver'

export interface CreateWorkerBackedStoreInput {
  /** Path to the SQLite ledger (the worker owns it). */
  dbPath: string
  /** Built worker entrypoint (e.g. out/main/ledger-worker.js). */
  workerPath: string
  /** Optional legacy JSON mirror path. */
  jsonPath?: string
  /** Driver call timeout. */
  timeoutMs?: number
}

export interface WorkerBackedStore {
  store: AgentMemoryStore
  /** Terminates the worker and releases the driver. */
  dispose: () => Promise<void>
}

export async function createWorkerBackedStore(
  input: CreateWorkerBackedStoreInput
): Promise<WorkerBackedStore> {
  const driver = createLedgerDriver(input.dbPath, {
    useWorker: true,
    workerPath: input.workerPath,
    timeoutMs: input.timeoutMs
  })
  const store = new AgentMemoryStore(input.jsonPath, { driver, skipLoad: true })
  await store.initFromDriver()
  return { store, dispose: () => driver.close() }
}
