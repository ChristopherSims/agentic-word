//! TF-IDF keyword extraction.

use crate::core::types::KeywordEntry;
use std::collections::HashMap;

const STOP_WORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "can", "shall", "it", "its", "this",
    "that", "these", "those", "i", "you", "he", "she", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "our", "their", "not",
    "no", "if", "as", "so", "than", "also", "very", "too", "just", "about",
    "into", "over", "after", "before", "between", "under", "again", "then",
    "here", "there", "when", "where", "why", "how", "all", "both", "each",
    "few", "more", "most", "other", "some", "such", "only", "own", "same",
];

/// Extract keywords using TF-IDF across a corpus.
/// For Phase 8, computes TF per document without IDF (single-document mode).
pub fn extract_keywords(text: &str, top_n: usize) -> Vec<KeywordEntry> {
    let words: Vec<&str> = text.split_whitespace()
        .filter(|w| w.len() > 2)
        .filter(|w| !STOP_WORDS.contains(&w.to_lowercase().as_str()))
        .collect();

    let total = words.len().max(1) as f64;
    let mut freq: HashMap<&str, usize> = HashMap::new();
    for w in &words {
        *freq.entry(w).or_insert(0) += 1;
    }

    let mut entries: Vec<KeywordEntry> = freq.into_iter()
        .map(|(word, count)| KeywordEntry {
            word: word.to_string(),
            score: (count as f64 / total * 100.0 * 10.0).round() / 10.0,
        })
        .collect();

    entries.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    entries.truncate(top_n);
    entries
}
