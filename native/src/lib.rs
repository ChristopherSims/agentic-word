#[macro_use]
mod core;
mod analysis;
mod db;

use napi_derive::napi;
use std::sync::Arc;

use crate::analysis::run_analysis;
use crate::core::config::AppConfig;
use crate::core::types::AnalysisResult;
use crate::db::Database;

// ─── Public API (Phase 1 - proof of life) ───

#[napi]
pub fn ping() -> String {
    "pong from Rust".to_string()
}

// ─── RustCore — main application handle exposed to Electron ───

#[napi]
pub struct RustCore {
    db: Arc<Database>,
}

#[napi]
impl RustCore {
    /// Initialize the Rust core with the user data path.
    /// Opens/creates SQLite database and runs migrations.
    #[napi(constructor)]
    pub fn new(user_data_path: String) -> napi::Result<Self> {
        let config = AppConfig::new(user_data_path);
        config.ensure_dirs().map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let db = Database::open(config).map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(RustCore {
            db: Arc::new(db),
        })
    }

    /// Verify initialization (ping-like check with DB status).
    #[napi]
    pub fn status(&self) -> napi::Result<String> {
        let db_ok = self.db.with_conn(|_| Ok(())).is_ok();
        Ok(format!(
            "RustCore v0.2.0 — DB: {}, path: {}",
            if db_ok { "connected" } else { "error" },
            self.db.config().db_path.display()
        ))
    }

    /// Run document analysis on ProseMirror JSON content.
    /// Returns structured analysis results.
    #[napi]
    pub fn analyze_document(&self, pm_json: String) -> AnalysisResult {
        run_analysis(&pm_json)
    }
}
