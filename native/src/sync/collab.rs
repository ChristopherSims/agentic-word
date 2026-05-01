//! WebSocket collaboration server stub. Phase 7.
//! Full implementation with tokio-tungstenite + yrs planned for a future phase.

use crate::core::error::AppResult;

pub fn start_collab_server(_port: u16, _room_code: &str) -> AppResult<()> {
    tracing::info!("Collab server stub started (no-op)");
    Ok(())
}

pub fn stop_collab_server() -> AppResult<()> {
    Ok(())
}
