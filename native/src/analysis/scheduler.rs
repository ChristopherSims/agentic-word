//! Analysis scheduler — runs document analysis on background tasks.

use crate::core::types::AnalysisResult;
use crate::analysis::{readability, stats, tone, keywords};

/// Run the full analysis pipeline on document text.
pub fn schedule_analysis(text: String) -> AnalysisResult {
    run_analysis_inner(&text)
}

pub fn get_cached_analysis(metadata_json: &Option<String>) -> Option<AnalysisResult> {
    metadata_json.as_ref()
        .and_then(|mj| serde_json::from_str(mj).ok())
}

pub fn run_analysis_inner(text: &str) -> AnalysisResult {
    AnalysisResult {
        readability: Some(readability::compute_readability(text)),
        stats: Some(stats::compute_stats(text)),
        tone: Some(tone::detect_tone(text)),
        keywords: keywords::extract_keywords(text, 15),
    }
}
