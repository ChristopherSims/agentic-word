/**
 * Ledger worker entrypoint (updates-2.md §A). Runs the single writers's SQLite
 * work in a worker thread (Electron: utilityProcess), off the main thread.
 *
 * Spawned with `workerData = { dbPath, port }` where `port` is a transferred
 * MessagePort the driver speaks to.
 */

import { workerData } from 'node:worker_threads'
import type { MessagePort } from 'node:worker_threads'
import { AgentLedger } from './ledger'
import { LedgerWorkerServer } from './ledger-worker-server'

const { dbPath, port } = workerData as { dbPath: string; port: MessagePort }
new LedgerWorkerServer(new AgentLedger(dbPath), port)
