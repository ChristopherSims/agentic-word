//! Application configuration.
//! Supports XDG-compliant paths and TOML config loading.

use crate::core::error::AppResult;
use std::path::PathBuf;

/// Application configuration.
#[derive(Debug, Clone)]
pub struct AppConfig {
    /// Base user data directory (provided by Electron's app.getPath('userData'))
    pub user_data_path: PathBuf,

    /// Derived paths
    pub db_path: PathBuf,
    pub search_index_path: PathBuf,
    pub images_path: PathBuf,
    pub config_path: PathBuf,
}

impl AppConfig {
    /// Create app configuration from the user data path.
    pub fn new(user_data_path: String) -> Self {
        let base = PathBuf::from(&user_data_path);

        let db_path = base.join("lexicon.db");
        let search_index_path = base.join("search-index");
        let images_path = base.join("images");
        let config_path = base.join("config.toml");

        AppConfig {
            user_data_path: base,
            db_path,
            search_index_path,
            images_path,
            config_path,
        }
    }

    /// Ensure all required directories exist.
    pub fn ensure_dirs(&self) -> AppResult<()> {
        std::fs::create_dir_all(&self.search_index_path)?;
        std::fs::create_dir_all(&self.images_path)?;
        Ok(())
    }
}
