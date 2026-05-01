pub mod readability;
pub mod stats;
pub mod tone;
pub mod keywords;
pub mod scheduler;

use crate::core::types::{AnalysisResult, ReadabilityScores, TextStats, ToneAnalysis};

/// Run the full analysis pipeline on ProseMirror JSON content.
pub fn run_analysis(pm_json: &str) -> AnalysisResult {
    let text = crate::storage::prose_mirror::extract_text_from_json(pm_json);
    scheduler::run_analysis_inner(&text)
}
