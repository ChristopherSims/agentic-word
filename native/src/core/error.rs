//! Application-wide error types and result alias.
//! All errors convert into napi::Error for automatic JS exception propagation.

use napi::Status;
use std::fmt;

/// Unified error type for the Rust core.
#[derive(Debug)]
pub enum AppError {
    /// I/O error (file read/write, path not found, etc.)
    Io(std::io::Error),

    /// Database error (SQLite query failure, migration error, etc.)
    Db(String),

    /// VCS operation error (invalid commit, merge conflict, etc.)
    Vcs(String),

    /// AI client error (HTTP failure, invalid response, streaming error)
    Ai(String),

    /// Serialization error (JSON parse/serialize failure, PM JSON invalid)
    Serialization(String),

    /// Encryption/decryption error
    Encryption(String),

    /// Cloud sync error (provider error, auth failure, network)
    Sync(String),

    /// Document not found
    NotFound(String),

    /// Document parse/format error
    Parse(String),

    /// Document analysis error
    Analysis(String),

    /// Configuration error
    Config(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(e) => write!(f, "I/O error: {}", e),
            AppError::Db(msg) => write!(f, "Database error: {}", msg),
            AppError::Vcs(msg) => write!(f, "VCS error: {}", msg),
            AppError::Ai(msg) => write!(f, "AI error: {}", msg),
            AppError::Serialization(msg) => write!(f, "Serialization error: {}", msg),
            AppError::Encryption(msg) => write!(f, "Encryption error: {}", msg),
            AppError::Sync(msg) => write!(f, "Sync error: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::Parse(msg) => write!(f, "Parse error: {}", msg),
            AppError::Analysis(msg) => write!(f, "Analysis error: {}", msg),
            AppError::Config(msg) => write!(f, "Config error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            AppError::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Serialization(e.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

/// Convert AppError to napi::Error for JS exception propagation.
impl From<AppError> for napi::Error {
    fn from(err: AppError) -> Self {
        let status = match &err {
            AppError::NotFound(_) => Status::GenericFailure,
            AppError::Io(_) => Status::GenericFailure,
            AppError::Serialization(_) => Status::InvalidArg,
            _ => Status::GenericFailure,
        };
        napi::Error::new(status, err.to_string())
    }
}

/// Convenience result type used throughout the codebase.
pub type AppResult<T> = Result<T, AppError>;
