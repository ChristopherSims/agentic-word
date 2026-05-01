//! Readability score computation (Flesch-Kincaid, Gunning Fog, SMOG, Coleman-Liau).

use crate::core::types::ReadabilityScores;

/// Compute readability scores from document text.
pub fn compute_readability(text: &str) -> ReadabilityScores {
    let sentences = count_sentences(text);
    let words = count_words(text);
    let syllables = count_syllables(text);
    let chars = text.chars().filter(|c| !c.is_whitespace()).count();

    if words == 0 || sentences == 0 {
        return ReadabilityScores {
            flesch_kincaid_grade: 0.0,
            flesch_reading_ease: 100.0,
            gunning_fog: 0.0,
            smog_index: 0.0,
            coleman_liau: 0.0,
        };
    }

    let words_f = words as f64;
    let sentences_f = sentences as f64;
    let syllables_f = syllables as f64;
    let chars_f = chars as f64;

    // Flesch-Kincaid Grade Level
    let fk_grade = 0.39 * (words_f / sentences_f) + 11.8 * (syllables_f / words_f) - 15.59;
    // Flesch Reading Ease
    let fk_ease = 206.835 - 1.015 * (words_f / sentences_f) - 84.6 * (syllables_f / words_f);
    // Gunning Fog Index
    let complex_words = count_complex_words(text) as f64;
    let fog = 0.4 * ((words_f / sentences_f) + 100.0 * (complex_words / words_f));
    // SMOG Index
    let poly = count_polysyllables(text) as f64;
    let smog = 1.0430 * (30.0 * poly / sentences_f).sqrt() + 3.1291;
    // Coleman-Liau
    let cl = 0.0588 * (chars_f / words_f * 100.0) - 0.296 * (sentences_f / words_f * 100.0) - 15.8;

    ReadabilityScores {
        flesch_kincaid_grade: fk_grade.max(0.0),
        flesch_reading_ease: fk_ease.max(0.0).min(100.0),
        gunning_fog: fog.max(0.0),
        smog_index: smog.max(0.0),
        coleman_liau: cl.max(0.0),
    }
}

fn count_sentences(text: &str) -> usize {
    let mut count = 0;
    for c in text.chars() {
        if c == '.' || c == '!' || c == '?' { count += 1; }
    }
    count.max(1)
}

fn count_words(text: &str) -> usize {
    text.split_whitespace().count().max(1)
}

fn count_syllables(text: &str) -> usize {
    let mut count = 0;
    for word in text.split_whitespace() {
        count += syllables_in_word(word);
    }
    count.max(1)
}

fn syllables_in_word(word: &str) -> usize {
    let word = word.to_lowercase();
    let vowels = "aeiouy";
    let mut count = 0;
    let mut prev_vowel = false;

    for c in word.chars() {
        if vowels.contains(c) {
            if !prev_vowel { count += 1; }
            prev_vowel = true;
        } else {
            prev_vowel = false;
        }
    }

    // Silent e at end
    if word.ends_with('e') && count > 1 { count -= 1; }
    count.max(1)
}

fn count_complex_words(text: &str) -> usize {
    text.split_whitespace().filter(|w| syllables_in_word(w) >= 3).count()
}

fn count_polysyllables(text: &str) -> usize {
    text.split_whitespace().filter(|w| syllables_in_word(w) >= 3).count()
}
