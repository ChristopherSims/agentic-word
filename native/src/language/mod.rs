//! Language module: spell checking, grammar rules, and smart formatting.
//! All operations work on plain text extracted from ProseMirror JSON.

pub mod spell;
pub mod grammar;
pub mod format;

use crate::core::types::GrammarIssue;

/// Run full language check pipeline on ProseMirror JSON content.
pub fn check_language(pm_json: &str) -> LanguageCheckResult {
    let text = crate::storage::prose_mirror::extract_text_from_json(pm_json);
    let spell_issues = spell::check_text(&text);
    let grammar_issues = grammar::check_grammar(&text);
    LanguageCheckResult {
        spell_issues,
        grammar_issues,
    }
}

/// Run smart formatting on ProseMirror JSON content.
pub fn format_document(pm_json: &str) -> String {
    let text = crate::storage::prose_mirror::extract_text_from_json(pm_json);
    let formatted = format::apply_smart_formatting(&text);
    // For now, wrap formatted text in a simple paragraph
    format!("<p>{}</p>", formatted)
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
