//! Grammar checking engine — rule-based grammar detection.
//! Each rule checks for a specific grammar pattern and returns issues.

use crate::core::types::GrammarIssue;

/// Check text for grammar issues using built-in rules.
pub fn check_grammar(text: &str) -> Vec<GrammarIssue> {
    let mut issues = Vec::new();
    let sentences = text.split(|c| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>();

    let mut offset: usize = 0;
    for sentence in &sentences {
        issues.extend(check_article_before_vowel(sentence, offset));
        issues.extend(check_your_youre(sentence, offset));
        issues.extend(check_its_its(sentence, offset));
        issues.extend(check_subject_verb_agreement(sentence, offset));
        issues.extend(check_double_negative(sentence, offset));
        offset += sentence.len() + 1; // +1 for the punctuation
    }

    issues
}

/// Article before vowel: "a apple" → "an apple"
fn check_article_before_vowel(sentence: &str, offset: usize) -> Vec<GrammarIssue> {
    let mut issues = Vec::new();
    let mut chars = sentence.char_indices().peekable();
    while let Some((pos, c)) = chars.next() {
        if c == 'a' || c == 'A' {
            // Check next char is a vowel
            if let Some((_, next)) = chars.peek() {
                if "aeiouAEIOU".contains(*next) && !sentence[pos.saturating_sub(1)..=pos].contains(|c: char| c.is_alphabetic() && c != 'a' && c != 'A') {
                    let replacement = if c == 'A' { "An" } else { "an" };
                    let next_word_end = sentence[pos+1..].find(|c: char| !c.is_alphabetic())
                        .map(|e| pos + 1 + e)
                        .unwrap_or(sentence.len());
                    issues.push(GrammarIssue {
                        id: format!("article-{}", offset + pos),
                        position: (offset + pos) as i32,
                        original: sentence[pos..next_word_end].to_string(),
                        suggestion: format!("{} {}", replacement, &sentence[pos+1..next_word_end]),
                        explanation: "Use 'an' before vowel sounds".to_string(),
                        confidence: 0.85,
                    });
                }
            }
        }
    }
    issues
}

/// "your going" → "you're going"
fn check_your_youre(sentence: &str, offset: usize) -> Vec<GrammarIssue> {
    let mut issues = Vec::new();
    let lower = sentence.to_lowercase();
    // Match "your" followed by a verb (going, coming, running, doing, making)
    let verbs = ["going", "coming", "running", "doing", "making", "writing", "reading"];
    for verb in &verbs {
        let pattern = format!("your {}", verb);
        if let Some(pos) = lower.find(&pattern) {
            issues.push(GrammarIssue {
                id: format!("your-verb-{}", offset + pos),
                position: (offset + pos) as i32,
                original: "your".to_string(),
                suggestion: "you're".to_string(),
                explanation: "Use 'you're' (you are) with verbs".to_string(),
                confidence: 0.85,
            });
        }
    }
    issues
}

/// "its a" → "it's a"
fn check_its_its(sentence: &str, offset: usize) -> Vec<GrammarIssue> {
    let mut issues = Vec::new();
    let lower = sentence.to_lowercase();
    let triggers = ["its a", "its the", "its not", "its my", "its your"];
    for trigger in &triggers {
        if let Some(pos) = lower.find(trigger) {
            issues.push(GrammarIssue {
                id: format!("its-{}", offset + pos),
                position: (offset + pos) as i32,
                original: "its".to_string(),
                suggestion: "it's".to_string(),
                explanation: "Use 'it's' (it is) with verbs".to_string(),
                confidence: 0.85,
            });
        }
    }
    issues
}

/// Simple subject-verb agreement check
fn check_subject_verb_agreement(sentence: &str, offset: usize) -> Vec<GrammarIssue> {
    let mut issues = Vec::new();
    let lower = sentence.to_lowercase();
    let singular_pronouns = ["he", "she", "it"];
    let plural_verbs = ["are", "were", "have"];
    let singular_verbs = ["is", "was", "has"];

    for pronoun in &singular_pronouns {
        for verb in &plural_verbs {
            let pattern = format!("{} {}", pronoun, verb);
            if lower.contains(&pattern) {
                let verb_idx = pronoun.len() + 1;
                let suggestion = plural_verbs.iter()
                    .zip(singular_verbs.iter())
                    .find(|(pv, _)| ***pv == **verb)
                    .map(|(_, sv)| *sv)
                    .unwrap_or(verb);
                if let Some(pos) = lower.find(&pattern) {
                    issues.push(GrammarIssue {
                        id: format!("sva-{}", offset + pos),
                        position: (offset + pos + verb_idx as usize) as i32,
                        original: verb.to_string(),
                        suggestion: suggestion.to_string(),
                        explanation: format!("'{}' requires '{}'", pronoun, suggestion),
                        confidence: 0.7,
                    });
                }
            }
        }
    }
    issues
}

/// Detect double negatives
fn check_double_negative(sentence: &str, offset: usize) -> Vec<GrammarIssue> {
    let mut issues = Vec::new();
    let lower = sentence.to_lowercase();
    let negatives = ["not", "no", "never", "nothing", "nobody", "nowhere", "none"];
    let mut found_negatives: Vec<String> = Vec::new();

    for neg in &negatives {
        if lower.contains(neg) {
            found_negatives.push(neg.to_string());
        }
    }

    if found_negatives.len() >= 2 {
        issues.push(GrammarIssue {
            id: format!("double-neg-{}", offset),
            position: offset as i32,
            original: found_negatives.join(" ... "),
            suggestion: format!("Remove '{}'", found_negatives[0]),
            explanation: "Double negative detected".to_string(),
            confidence: 0.6,
        });
    }

    issues
}
