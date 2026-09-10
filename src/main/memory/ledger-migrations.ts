/**
 * Lexicon-owned ledger schema (updates-2.md §A).
 *
 * The ledger is a single transactional SQLite database that owns retained
 * events, memory entries, lineage, policy epochs, projection generations,
 * outbox work, deletion jobs and migration manifests. Migrations are applied
 * in order and recorded in `migration_manifest`.
 *
 * The driver is `better-sqlite3` (a native module rebuilt for the Electron ABI
 * for the app and for the Node ABI for tests); see `ledger.ts`.
 */

import type Database from 'better-sqlite3'

export const LEDGER_SCHEMA_VERSION = 5

interface LedgerMigration {
  version: number
  up: (db: Database.Database) => void
}

export const LEDGER_MIGRATIONS: LedgerMigration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
          document_id TEXT PRIMARY KEY,
          branch_id TEXT,
          protected INTEGER NOT NULL DEFAULT 0,
          policy_epoch INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS memory_entries (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          agent_name TEXT,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          source TEXT,
          scope TEXT NOT NULL,
          approval_state TEXT,
          source_type TEXT,
          run_id TEXT,
          origin_key TEXT,
          derived_from TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_memory_entries_document ON memory_entries(document_id);
        CREATE INDEX IF NOT EXISTS idx_memory_entries_scope ON memory_entries(scope);

        CREATE TABLE IF NOT EXISTS source_edges (
          from_id TEXT NOT NULL,
          to_id TEXT NOT NULL,
          relation TEXT NOT NULL,
          PRIMARY KEY (from_id, to_id, relation)
        );

        CREATE TABLE IF NOT EXISTS suppressions (
          entry_id TEXT NOT NULL,
          document_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          hashes TEXT NOT NULL,
          forgotten_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_suppressions_document ON suppressions(document_id);

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          system_prompt TEXT,
          messages TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_document ON sessions(document_id);

        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          agent_name TEXT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          provenance TEXT NOT NULL,
          revision_known INTEGER NOT NULL DEFAULT 0,
          tool_evidence INTEGER NOT NULL DEFAULT 0,
          projected INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_events_document ON events(document_id);

        CREATE TABLE IF NOT EXISTS quarantine (
          key TEXT PRIMARY KEY,
          reason TEXT,
          origin_key TEXT,
          record TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS policy_epochs (
          document_id TEXT PRIMARY KEY,
          epoch INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projection_generations (
          generation_id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          branch_id TEXT,
          session_id TEXT,
          profile_id TEXT,
          source_epoch INTEGER NOT NULL DEFAULT 0,
          ledger_sequence INTEGER NOT NULL DEFAULT 0,
          mnesis_session_id TEXT,
          state TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_generations_document ON projection_generations(document_id);

        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          payload TEXT NOT NULL,
          state TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox(state);

        CREATE TABLE IF NOT EXISTS deletion_jobs (
          operation_id TEXT PRIMARY KEY,
          document_id TEXT,
          state TEXT NOT NULL,
          requested_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          detail TEXT
        );

        CREATE TABLE IF NOT EXISTS ledger_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
    }
  },
  {
    version: 2,
    up: (db) => {
      // §B: main-owned revocation is durable and independent of the renderer.
      db.exec('ALTER TABLE documents ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0')
    }
  },
  {
    version: 3,
    up: (db) => {
      // §E: monotonic per-event sequence so a rebuild can catch up on events
      // that arrive while it replays.
      db.exec('ALTER TABLE events ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0')
    }
  },
  {
    version: 4,
    up: (db) => {
      // §A: memory-import manifest (source hash, counts, checksums).
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_migration_manifest (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_path TEXT,
          source_hash TEXT NOT NULL,
          imported_at INTEGER NOT NULL,
          entries INTEGER NOT NULL,
          events INTEGER NOT NULL,
          quarantined INTEGER NOT NULL,
          skipped INTEGER NOT NULL,
          entries_checksum TEXT
        );
      `)
    }
  },
  {
    version: 5,
    up: (db) => {
      // §A/§D.5 (R15): explicit turn identity so rebuilds pair user/assistant
      // by identity, never by array position.
      db.exec('ALTER TABLE events ADD COLUMN turn_id TEXT')
    }
  }
]

/** Apply any pending migrations; returns the resulting schema version. */
export function applyLedgerMigrations(db: Database.Database): number {
  db.exec('CREATE TABLE IF NOT EXISTS migration_manifest (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const row = db
    .prepare('SELECT MAX(version) AS version FROM migration_manifest')
    .get() as { version: number | null } | undefined
  let current = row?.version ?? 0
  for (const migration of LEDGER_MIGRATIONS) {
    if (migration.version <= current) continue
    migration.up(db)
    db.prepare('INSERT INTO migration_manifest (version, applied_at) VALUES (?, ?)').run(
      migration.version,
      Date.now()
    )
    current = migration.version
  }
  return current
}
