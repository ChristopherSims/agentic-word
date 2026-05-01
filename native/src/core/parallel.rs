//! Parallel document processing using Rayon thread pool.
//!
//! Splits ProseMirror documents into paragraph-level chunks, processes each
//! in parallel, and merges results. Operations: spell_check, grammar_check,
//! find_all, replace_all, stats.

use rayon::prelude::*;
use crate::storage::prose_mirror::{PMDoc, PMNode, parse_pm_json, to_json, extract_text};
use crate::language::spell;
use crate::language::grammar;
use crate::language::{SpellIssue, LanguageCheckResult};
use crate::core::types::GrammarIssue;

// ─── Generic Utilities ───

/// Run a function on each item in parallel and collect results.
pub fn parallel_map<T, R, F>(items: Vec<T>, f: F) -> Vec<R>
where
    T: Send,
    R: Send,
    F: Fn(T) -> R + Send + Sync,
{
    items.into_par_iter().map(f).collect()
}

/// Run a function on each item in parallel (fire-and-forget).
pub fn parallel_for_each<T, F>(items: Vec<T>, f: F)
where
    T: Send,
    F: Fn(T) + Send + Sync,
{
    items.into_par_iter().for_each(f);
}

// ─── Document Chunking ───

/// A chunk of a document: a paragraph with its index and text content.
#[derive(Debug, Clone)]
pub struct DocChunk {
    pub index: usize,
    pub node_type: String,
    pub text: String,
}

/// Split a PM document into paragraph/heading chunks for parallel processing.
fn chunk_document(doc: &PMDoc) -> Vec<DocChunk> {
    let mut chunks = Vec::new();

    if let Some(ref children) = doc.content {
        for (i, child) in children.iter().enumerate() {
            if is_text_block(child) {
                chunks.push(DocChunk {
                    index: i,
                    node_type: child.node_type.clone(),
                    text: extract_text(child),
                });
            } else if let Some(ref content) = child.content {
                // Recurse into block elements (lists, blockquotes)
                for sub in content {
                    if is_text_block(sub) {
                        chunks.push(DocChunk {
                            index: chunks.len(),
                            node_type: format!("{} > {}", child.node_type, sub.node_type),
                            text: extract_text(sub),
                        });
                    }
                }
            }
        }
    }

    chunks
}

fn is_text_block(node: &PMNode) -> bool {
    matches!(
        node.node_type.as_str(),
        "paragraph" | "heading" | "listItem" | "codeBlock"
    )
}

// ─── Parallel Operations ───

/// Result from parallel document processing.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ParallelResult {
    pub operation: String,
    /// Number of chunks processed
    pub chunks_processed: usize,
    /// Spell issues (for spell_check)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spell_issues: Option<Vec<SpellIssue>>,
    /// Grammar issues (for grammar_check)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grammar_issues: Option<Vec<GrammarIssue>>,
    /// Find results (for find_all)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub find_results: Option<Vec<FindResult>>,
    /// Replaced PM JSON (for replace_all)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replaced_document: Option<String>,
    /// Stats (for stats)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<ParallelStats>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FindResult {
    pub chunk_index: usize,
    pub node_type: String,
    pub positions: Vec<usize>,
    pub context: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ParallelStats {
    pub word_count: usize,
    pub char_count: usize,
    pub sentence_count: usize,
    pub paragraph_count: usize,
}

/// Process a PM document in parallel with the given operation.
///
/// Operations:
///   "spell_check"  — returns all spell issues
///   "grammar_check" — returns all grammar issues
///   "find_all"     — finds all occurrences (requires search param)
///   "replace_all"  — replaces all occurrences (requires search + replace params),
///                    returns the modified PM JSON
///   "stats"        — returns word/char/sentence/paragraph counts
pub fn process_document_parallel(
    pm_json: &str,
    operation: &str,
    search: Option<&str>,
    replace: Option<&str>,
) -> Result<ParallelResult, String> {
    let doc = parse_pm_json(pm_json).map_err(|e| format!("Invalid PM JSON: {}", e))?;

    let chunks = chunk_document(&doc);
    let chunks_processed = chunks.len();

    match operation {
        "spell_check" => {
            let all_issues: Vec<Vec<SpellIssue>> = parallel_map(chunks, |chunk| {
                spell::check_text(&chunk.text)
            });
            let spell_issues: Vec<SpellIssue> = all_issues.into_iter().flatten().collect();
            Ok(ParallelResult {
                operation: operation.to_string(),
                chunks_processed,
                spell_issues: Some(spell_issues),
                grammar_issues: None,
                find_results: None,
                replaced_document: None,
                stats: None,
            })
        }

        "grammar_check" => {
            let all_issues: Vec<Vec<GrammarIssue>> = parallel_map(chunks, |chunk| {
                grammar::check_grammar(&chunk.text)
            });
            let grammar_issues: Vec<GrammarIssue> = all_issues.into_iter().flatten().collect();
            Ok(ParallelResult {
                operation: operation.to_string(),
                chunks_processed,
                spell_issues: None,
                grammar_issues: Some(grammar_issues),
                find_results: None,
                replaced_document: None,
                stats: None,
            })
        }

        "find_all" => {
            let search_term = search.ok_or("search parameter required for find_all")?;
            let all_results: Vec<Vec<FindResult>> = parallel_map(chunks, |chunk| {
                let mut results = Vec::new();
                let mut positions = Vec::new();
                let lower_text = chunk.text.to_lowercase();
                let lower_search = search_term.to_lowercase();

                let mut start = 0;
                while let Some(pos) = lower_text[start..].find(&lower_search) {
                    let abs_pos = start + pos;
                    positions.push(abs_pos);
                    start = abs_pos + lower_search.len();
                }

                if !positions.is_empty() {
                    let context_start = positions[0].saturating_sub(20);
                    let context_end = (positions[positions.len() - 1] + search_term.len() + 20)
                        .min(chunk.text.len());
                    results.push(FindResult {
                        chunk_index: chunk.index,
                        node_type: chunk.node_type.clone(),
                        positions: positions.clone(),
                        context: chunk.text[context_start..context_end].to_string(),
                    });
                }

                results
            });
            let find_results: Vec<FindResult> = all_results.into_iter().flatten().collect();
            Ok(ParallelResult {
                operation: operation.to_string(),
                chunks_processed,
                spell_issues: None,
                grammar_issues: None,
                find_results: Some(find_results),
                replaced_document: None,
                stats: None,
            })
        }

        "replace_all" => {
            let search_term = search.ok_or("search parameter required for replace_all")?;
            let replace_with = replace.ok_or("replace parameter required for replace_all")?;

            // Replace in each text node, rebuild document
            let mut new_doc = doc.clone();
            let _ = replace_text_nodes_parallel(&mut new_doc, search_term, replace_with);

            let new_json = to_json(&new_doc).map_err(|e| format!("Serialization error: {}", e))?;
            Ok(ParallelResult {
                operation: operation.to_string(),
                chunks_processed,
                spell_issues: None,
                grammar_issues: None,
                find_results: None,
                replaced_document: Some(new_json),
                stats: None,
            })
        }

        "stats" => {
            let all_stats: Vec<ParallelStats> = parallel_map(chunks, |chunk| {
                let text = &chunk.text;
                let word_count = text.split_whitespace().count();
                let char_count = text.chars().count();
                let sentence_count = text.split(|c| c == '.' || c == '!' || c == '?')
                    .filter(|s| !s.trim().is_empty())
                    .count();
                ParallelStats {
                    word_count,
                    char_count,
                    sentence_count,
                    paragraph_count: 1,
                }
            });

            let total_stats = ParallelStats {
                word_count: all_stats.iter().map(|s| s.word_count).sum(),
                char_count: all_stats.iter().map(|s| s.char_count).sum(),
                sentence_count: all_stats.iter().map(|s| s.sentence_count).sum(),
                paragraph_count: chunks.len(),
            };

            Ok(ParallelResult {
                operation: operation.to_string(),
                chunks_processed,
                spell_issues: None,
                grammar_issues: None,
                find_results: None,
                replaced_document: None,
                stats: Some(total_stats),
            })
        }

        other => Err(format!("Unknown operation: {}. Valid: spell_check, grammar_check, find_all, replace_all, stats", other)),
    }
}

// ─── Parallel Text Replacement ───

/// Replace all occurrences of `search` with `replace` in text nodes,
/// processing children in parallel where possible.
fn replace_text_nodes_parallel(doc: &mut PMDoc, search: &str, replace: &str) -> usize {
    let mut count = 0;

    // Replace in this node's text
    if let Some(ref text) = doc.text {
        let new_text = text.replace(search, replace);
        count += text.matches(search).count();
        doc.text = Some(new_text);
    }

    // Process children in parallel
    if let Some(ref mut children) = doc.content {
        let mut results: Vec<usize> = children
            .par_iter_mut()
            .map(|child| replace_text_nodes_parallel(child, search, replace))
            .collect();
        count += results.iter().sum::<usize>();
    }

    // Process marks (inline formatting nodes)
    if let Some(ref mut marks) = doc.marks {
        for mark in marks {
            if let Some(ref mut attrs) = mark.attrs {
                for (_key, value) in attrs.iter_mut() {
                    if let Some(s) = value.as_str() {
                        let new_val = s.replace(search, replace);
                        if &new_val != s {
                            *value = serde_json::Value::String(new_val);
                        }
                    }
                }
            }
        }
    }

    count
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_document() {
        let doc = PMDoc::doc(vec![
            PMNode::paragraph(vec![PMNode::text("Hello world", None)]),
            PMNode::paragraph(vec![PMNode::text("Second paragraph", None)]),
        ]);
        let chunks = chunk_document(&doc);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].text, "Hello world");
    }

    #[test]
    fn test_parallel_spell_check() {
        let json = serde_json::to_string(&PMDoc::doc(vec![
            PMNode::paragraph(vec![PMNode::text("The qwick brown fox", None)]),
            PMNode::paragraph(vec![PMNode::text("jumps ovr the lazy dogg", None)]),
        ])).unwrap();

        let result = process_document_parallel(&json, "spell_check", None, None).unwrap();
        assert_eq!(result.operation, "spell_check");
        assert_eq!(result.chunks_processed, 2);
        // "qwick", "ovr", "dogg" should be flagged by our minimal dictionary
        let issues = result.spell_issues.unwrap();
        assert!(issues.len() >= 2, "Expected at least 2 spelling issues, got {}", issues.len());
    }

    #[test]
    fn test_parallel_find_all() {
        let json = serde_json::to_string(&PMDoc::doc(vec![
            PMNode::paragraph(vec![PMNode::text("Hello world hello again", None)]),
            PMNode::paragraph(vec![PMNode::text("world of hello worlds", None)]),
        ])).unwrap();

        let result = process_document_parallel(&json, "find_all", Some("hello"), None).unwrap();
        let findings = result.find_results.unwrap();
        assert!(findings.len() >= 2);
    }

    #[test]
    fn test_parallel_replace() {
        let json = serde_json::to_string(&PMDoc::doc(vec![
            PMNode::paragraph(vec![PMNode::text("foo bar baz", None)]),
            PMNode::paragraph(vec![PMNode::text("foo again", None)]),
        ])).unwrap();

        let result = process_document_parallel(&json, "replace_all", Some("foo"), Some("qux")).unwrap();
        let replaced = result.replaced_document.unwrap();
        assert!(replaced.contains("qux"));
        assert!(!replaced.contains("foo"));
    }

    #[test]
    fn test_parallel_stats() {
        let json = serde_json::to_string(&PMDoc::doc(vec![
            PMNode::paragraph(vec![PMNode::text("Hello world. How are you?", None)]),
            PMNode::paragraph(vec![PMNode::text("I am fine.", None)]),
        ])).unwrap();

        let result = process_document_parallel(&json, "stats", None, None).unwrap();
        let stats = result.stats.unwrap();
        assert_eq!(stats.paragraph_count, 2);
        assert!(stats.word_count > 5);
        assert_eq!(stats.sentence_count, 3); // "Hello world.", "How are you?", "I am fine."
    }
}
