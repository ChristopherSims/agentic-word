//! SQLite database initialization, connection management, and schema migrations.
//! Uses rusqlite with WAL mode for concurrent read/write performance.

use crate::core::config::AppConfig;
use crate::core::error::{AppError, AppResult};
use rusqlite::{Connection, OpenFlags};
use std::sync::Mutex;

/// Wraps a SQLite connection pool (single connection with Mutex for simplicity;
/// can be upgraded to r2d2 pool later if needed).
pub struct Database {
    conn: Mutex<Connection>,
    config: AppConfig,
}

/// Current schema version. Increment when adding migrations.
const SCHEMA_VERSION: i32 = 1;

impl Database {
    /// Open or create the SQLite database at the configured path.
    /// Runs schema migrations if needed.
    pub fn open(config: AppConfig) -> AppResult<Self> {
        let conn = Connection::open_with_flags(
            &config.db_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;

        // Enable WAL mode for better concurrent performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        let db = Database {
            conn: Mutex::new(conn),
            config,
        };

        db.run_migrations()?;
        Ok(db)
    }

    /// Execute a closure with the database connection.
    pub fn with_conn<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&Connection) -> AppResult<T>,
    {
        let conn = self.conn.lock().map_err(|e| AppError::Db(e.to_string()))?;
        f(&conn)
    }

    /// Get a reference to the config.
    pub fn config(&self) -> &AppConfig {
        &self.config
    }

    // ─── Schema Migration ───

    fn run_migrations(&self) -> AppResult<()> {
        let conn = self.conn.lock().map_err(|e| AppError::Db(e.to_string()))?;

        // Create schema version table if it doesn't exist
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER NOT NULL
            );"
        )?;

        let current: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if current < 1 {
            self.migrate_v1(&conn)?;
        }

        // Future migrations go here:
        // if current < 2 { self.migrate_v2(&conn)?; }

        Ok(())
    }

    fn migrate_v1(&self, conn: &Connection) -> AppResult<()> {
        conn.execute_batch(
            "
            -- Document storage: current working state (one row per open document)
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'Untitled',
                file_path TEXT,
                content_json TEXT NOT NULL DEFAULT '{}',  -- ProseMirror JSON as zstd blob
                content_compressed INTEGER NOT NULL DEFAULT 0,
                prosemirror_version TEXT,
                word_count INTEGER NOT NULL DEFAULT 0,
                char_count INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                metadata_json TEXT  -- AnalysisResult as JSON
            );

            -- VCS commits: compressed ProseMirror JSON snapshots
            CREATE TABLE IF NOT EXISTS document_snapshots (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                parent_id TEXT,
                merge_parent_id TEXT,
                message TEXT NOT NULL DEFAULT '',
                author TEXT,
                branch TEXT NOT NULL DEFAULT 'main',
                content_blob BLOB NOT NULL,  -- zstd-compressed ProseMirror JSON
                timestamp REAL NOT NULL,
                lane INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_snapshots_document
                ON document_snapshots(document_id, timestamp);

            -- Named branches pointing to snapshot IDs
            CREATE TABLE IF NOT EXISTS branches (
                name TEXT NOT NULL,
                document_id TEXT NOT NULL,
                head_id TEXT NOT NULL,
                protected INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (name, document_id),
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY (head_id) REFERENCES document_snapshots(id) ON DELETE CASCADE
            );

            -- Named tags pointing to snapshot IDs
            CREATE TABLE IF NOT EXISTS tags (
                name TEXT NOT NULL,
                document_id TEXT NOT NULL,
                commit_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                PRIMARY KEY (name, document_id),
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY (commit_id) REFERENCES document_snapshots(id) ON DELETE CASCADE
            );

            -- Stash entries (shelved working state)
            CREATE TABLE IF NOT EXISTS stash (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                branch TEXT NOT NULL DEFAULT 'main',
                content_blob BLOB NOT NULL,
                parent_id TEXT,
                timestamp REAL NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            -- AI agent chat sessions
            CREATE TABLE IF NOT EXISTS agent_sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'Unnamed Session',
                profile_id TEXT,
                messages_json TEXT NOT NULL DEFAULT '[]',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );

            -- AI agent config (encrypted)
            CREATE TABLE IF NOT EXISTS agent_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Application settings (key-value store)
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Recently opened files
            CREATE TABLE IF NOT EXISTS recent_files (
                file_path TEXT PRIMARY KEY,
                opened_at REAL NOT NULL
            );

            -- Installed plugin manifests
            CREATE TABLE IF NOT EXISTS plugin_registry (
                id TEXT PRIMARY KEY,
                manifest_json TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                installed_at REAL NOT NULL
            );

            -- Tantivy search index metadata (path references)
            CREATE TABLE IF NOT EXISTS search_index_meta (
                document_id TEXT PRIMARY KEY,
                indexed_at REAL NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            -- Active collaboration rooms
            CREATE TABLE IF NOT EXISTS collab_rooms (
                code TEXT PRIMARY KEY,
                document_id TEXT,
                host_user_id TEXT,
                created_at REAL NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
            );

            -- OAuth tokens (encrypted)
            CREATE TABLE IF NOT EXISTS cloud_tokens (
                provider TEXT NOT NULL,
                user_id TEXT NOT NULL,
                token_json TEXT NOT NULL,
                expires_at REAL,
                PRIMARY KEY (provider, user_id)
            );

            -- Record migration version
            INSERT INTO schema_version (version) VALUES (1);
            "
        )?;

        Ok(())
    }
}
