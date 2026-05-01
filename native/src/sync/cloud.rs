//! Cloud storage abstraction and provider interface.

use crate::core::error::{AppError, AppResult};

/// Cloud sync operation types.
#[derive(Debug, Clone)]
pub enum CloudProvider {
    S3,
    GoogleDrive,
    Dropbox,
}

/// Cloud file metadata.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CloudFile {
    pub key: String,
    pub size: u64,
    pub modified: f64,
    pub hash: Option<String>,
}

pub trait CloudStorage {
    fn list_files(&self, prefix: &str) -> AppResult<Vec<CloudFile>>;
    fn download(&self, key: &str) -> AppResult<Vec<u8>>;
    fn upload(&self, key: &str, data: &[u8]) -> AppResult<()>;
    fn delete(&self, key: &str) -> AppResult<()>;
}

/// Sync a document to cloud storage. Phase 7: stub implementation.
pub fn sync_upload(_provider: &CloudProvider, _file_path: &str, _data: &[u8]) -> AppResult<()> {
    Ok(())
}

pub fn sync_download(_provider: &CloudProvider, _file_path: &str) -> AppResult<Vec<u8>> {
    Ok(vec![])
}

pub fn sync_list(_provider: &CloudProvider, _prefix: &str) -> AppResult<Vec<CloudFile>> {
    Ok(vec![])
}
