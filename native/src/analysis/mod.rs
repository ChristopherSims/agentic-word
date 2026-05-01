pub mod readability;
pub mod stats;
pub mod tone;
pub mod keywords;
pub mod scheduler;

use crate::core::types::{AnalysisResult, ReadabilityScores, TextStats, ToneAnalysis};

/// Run the full analysis pipeline on ProseMirror JSON document content.
/// Returns AnalysisResult with all computed metrics.
pub fn run_analysis(_pm_json: &str) -> AnalysisResult {
    // Phase 2: stub implementation.
    // Full algorithms implemented in Phase 8.
    let stats = TextStats {
        word_count: 0,
        char_count: 0,
        char_no_spaces_count: 0,
        sentence_count: 0,
        paragraph_count: 0,
        avg_sentence_length: 0.0,
        avg_word_length: 0.0,
        reading_time_minutes_200wpm: 0.0,
        reading_time_minutes_250wpm: 0.0,
        reading_time_minutes_300wpm: 0.0,
    };

    let readability = ReadabilityScores {
        flesch_kincaid_grade: 0.0,
        flesch_reading_ease: 0.0,
        gunning_fog: 0.0,
        smog_index: 0.0,
        coleman_liau: 0.0,
    };

    let tone = ToneAnalysis {
        formality_score: 0.0,
        sentiment_score: 0.0,
        confidence: 0.0,
    };

    AnalysisResult {
        readability: Some(readability),
        stats: Some(stats),
        tone: Some(tone),
        keywords: Vec::new(),
    }
}
