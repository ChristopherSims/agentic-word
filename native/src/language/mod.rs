//! Language module: spell checking, grammar rules, and smart formatting.
//! All operations work on ProseMirror JSON.

pub mod spell;
pub mod grammar;
pub mod format;

use crate::core::types::GrammarIssue;
use crate::storage::prose_mirror;

/// Run full language check pipeline on ProseMirror JSON content.
pub fn check_language(pm_json: &str) -> LanguageCheckResult {
    let text = prose_mirror::extract_text_from_json(pm_json);
    let spell_issues = spell::check_text(&text);
    let grammar_issues = grammar::check_grammar(&text);
    LanguageCheckResult {
        spell_issues,
        grammar_issues,
    }
}

/// Apply smart formatting to a ProseMirror JSON document.
/// Parses the JSON, walks the document tree, applies formatting rules
/// (whitespace, smart quotes/dashes, list normalization, heading hierarchy,
/// blockquote standardization, empty block removal), and serializes back to JSON.
pub fn format_document(pm_json: &str) -> String {
    match prose_mirror::parse_pm_json(pm_json) {
        Ok(doc) => {
            let formatted = format::apply_smart_formatting(&doc);
            prose_mirror::to_json(&formatted).unwrap_or_else(|_| pm_json.to_string())
        }
        Err(_) => {
            // If we can't parse PM JSON, fall back to text-only formatting and
            // return as a simple HTML paragraph.
            let formatted = format::text_formatting_rules(pm_json);
            format!("<p>{}</p>", formatted)
        }
    }
}


#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LanguageCheckResult {
    pub spell_issues: Vec<SpellIssue>,
    pub grammar_issues: Vec<GrammarIssue>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SpellIssue {
    pub word: String,
    pub position: usize,
    pub suggestions: Vec<String>,
}
