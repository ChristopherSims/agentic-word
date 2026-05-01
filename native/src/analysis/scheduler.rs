//! Analysis scheduler.
//! Runs document analysis on a background tokio task after save operations.
//! Results are stored in the documents table (metadata_json column).

use crate::core::types::AnalysisResult;

/// Schedule analysis for a document. Runs on a background task.
/// In Phase 2, this is a no-op. Full implementation in Phase 8.
pub fn schedule_analysis(_pm_json: String) {
    // Phase 8: spawn tokio::task, run analysis pipeline, store result
    tracing::debug!("Analysis scheduled (no-op until Phase 8)");
}

/// Get cached analysis for a document (from metadata_json).
pub fn get_cached_analysis(_metadata_json: &Option<String>) -> Option<AnalysisResult> {
    // Phase 8: parse metadata_json into AnalysisResult
    None
}
