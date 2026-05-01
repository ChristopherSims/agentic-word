//! CRDT stub using Yrs (Yjs Rust port). Phase 7.
//! Full Yrs integration planned for a future phase.

pub fn apply_update(_doc_state: &[u8], _update: &[u8]) -> Result<Vec<u8>, String> {
    Ok(vec![])
}

pub fn get_state(_doc_state: &[u8]) -> Result<String, String> {
    Ok("".to_string())
}
