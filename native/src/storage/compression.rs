//! Compression utilities for VCS blob storage.
//! Uses zstd for fast, high-ratio compression of ProseMirror JSON.

use crate::core::error::AppResult;

/// Compress data using zstd with default compression level.
pub fn compress(data: &[u8]) -> AppResult<Vec<u8>> {
    zstd::encode_all(data, 3).map_err(|e| crate::core::error::AppError::Db(e.to_string()))
}

/// Decompress zstd-compressed data.
pub fn decompress(data: &[u8]) -> AppResult<Vec<u8>> {
    zstd::decode_all(data).map_err(|e| crate::core::error::AppError::Db(e.to_string()))
}

/// Compress a string and return the compressed bytes.
pub fn compress_str(s: &str) -> AppResult<Vec<u8>> {
    compress(s.as_bytes())
}

/// Decompress bytes into a string.
pub fn decompress_str(data: &[u8]) -> AppResult<String> {
    let bytes = decompress(data)?;
    String::from_utf8(bytes).map_err(|e| crate::core::error::AppError::Db(e.to_string()))
}
