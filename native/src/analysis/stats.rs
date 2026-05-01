//! Text statistics computation.

use crate::core::types::TextStats;

pub fn compute_stats(text: &str) -> TextStats {
    let char_count = text.chars().count() as i32;
    let char_no_spaces = text.chars().filter(|c| !c.is_whitespace()).count() as i32;
    let words: Vec<&str> = text.split_whitespace().collect();
    let word_count = words.len() as i32;
    let sentences: Vec<&str> = text.split(|c| c == '.' || c == '!' || c == '?').collect();
    let sentence_count = sentences.iter().filter(|s| !s.trim().is_empty()).count() as i32;
    let paragraphs: Vec<&str> = text.split("\n\n").collect();
    let paragraph_count = paragraphs.iter().filter(|p| !p.trim().is_empty()).count() as i32;

    let avg_sentence_length = if sentence_count > 0 { word_count as f64 / sentence_count as f64 } else { 0.0 };
    let total_word_len: usize = words.iter().map(|w| w.chars().count()).sum();
    let avg_word_length = if word_count > 0 { total_word_len as f64 / word_count as f64 } else { 0.0 };

    // Reading time at different WPM
    let wpm200 = if word_count > 0 { (word_count as f64 / 200.0).max(0.1) } else { 0.0 };
    let wpm250 = if word_count > 0 { (word_count as f64 / 250.0).max(0.1) } else { 0.0 };
    let wpm300 = if word_count > 0 { (word_count as f64 / 300.0).max(0.1) } else { 0.0 };

    TextStats {
        word_count,
        char_count,
        char_no_spaces_count: char_no_spaces,
        sentence_count,
        paragraph_count,
        avg_sentence_length,
        avg_word_length,
        reading_time_minutes_200wpm: (wpm200 * 10.0).round() / 10.0,
        reading_time_minutes_250wpm: (wpm250 * 10.0).round() / 10.0,
        reading_time_minutes_300wpm: (wpm300 * 10.0).round() / 10.0,
    }
}
