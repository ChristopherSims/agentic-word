//! Cloud provider adapters. Phase 7: stub implementations.

use crate::core::error::AppResult;

/// S3 provider stub.
pub mod s3 {
    use super::*;
    pub fn list(_prefix: &str) -> AppResult<Vec<crate::sync::cloud::CloudFile>> { Ok(vec![]) }
    pub fn download(_key: &str) -> AppResult<Vec<u8>> { Ok(vec![]) }
    pub fn upload(_key: &str, _data: &[u8]) -> AppResult<()> { Ok(()) }
}

/// Google Drive provider stub.
pub mod gdrive {
    use super::*;
    pub fn list(_prefix: &str) -> AppResult<Vec<crate::sync::cloud::CloudFile>> { Ok(vec![]) }
    pub fn download(_key: &str) -> AppResult<Vec<u8>> { Ok(vec![]) }
    pub fn upload(_key: &str, _data: &[u8]) -> AppResult<()> { Ok(()) }
}

/// Dropbox provider stub.
pub mod dropbox {
    use super::*;
    pub fn list(_prefix: &str) -> AppResult<Vec<crate::sync::cloud::CloudFile>> { Ok(vec![]) }
    pub fn download(_key: &str) -> AppResult<Vec<u8>> { Ok(vec![]) }
    pub fn upload(_key: &str, _data: &[u8]) -> AppResult<()> { Ok(()) }
}
