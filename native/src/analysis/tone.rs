//! Tone detection heuristics.
use crate::core::types::ToneAnalysis;

pub fn detect_tone(text: &str) -> ToneAnalysis {
    let formal_markers = [
        "therefore", "consequently", "furthermore", "nevertheless", "accordingly",
        "thus", "hence", "moreover", "notwithstanding", "whereas", "hereby",
    ];
    let informal_markers = [
        "cool", "awesome", "yeah", "nah", "gonna", "wanna", "kinda", "sorta",
        "hey", "guys", "stuff", "thing", "ok", "okay", "btw", "lol",
    ];
    let positive_words = [
        "good", "great", "excellent", "wonderful", "fantastic", "amazing",
        "love", "beautiful", "happy", "best", "perfect", "outstanding",
    ];
    let negative_words = [
        "bad", "terrible", "awful", "horrible", "worst", "hate",
        "ugly", "sad", "poor", "failure", "wrong", "broken",
    ];

    let lower = text.to_lowercase();
    let words: Vec<&str> = lower.split_whitespace().collect();
    let total = words.len().max(1) as f64;

    let formal_count = formal_markers.iter().filter(|m| lower.contains(*m)).count() as f64;
    let informal_count = informal_markers.iter().filter(|m| lower.contains(*m)).count() as f64;
    let positive_count = positive_words.iter().filter(|w| words.contains(w)).count() as f64;
    let negative_count = negative_words.iter().filter(|w| words.contains(w)).count() as f64;

    let formality = (formal_count / total * 100.0).min(100.0);
    let sentiment_base = if (positive_count + negative_count) > 0.0 {
        (positive_count - negative_count) / (positive_count + negative_count)
    } else {
        0.0
    };
    let confidence = ((formal_count + informal_count + positive_count + negative_count) / total * 100.0).min(100.0);

    ToneAnalysis {
        formality_score: (formality * 10.0).round() / 10.0,
        sentiment_score: (sentiment_base * 10.0).round() / 10.0,
        confidence: (confidence * 10.0).round() / 10.0,
    }
}
