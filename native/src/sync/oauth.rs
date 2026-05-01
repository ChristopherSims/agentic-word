//! OAuth PKCE flow stub. Phase 7.
//! Full implementation planned for a future phase.

use crate::core::error::AppResult;

pub fn start_oauth_flow(_provider: &str) -> AppResult<String> {
    Ok("https://accounts.example.com/authorize".to_string())
}

pub fn complete_oauth(_provider: &str, _code: &str) -> AppResult<String> {
    Ok("access_token_stub".to_string())
}
