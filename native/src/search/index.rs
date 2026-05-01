//! Search index stub — uses regex-based in-memory search.
//! Full Tantivy integration deferred to post-Phase 7 due to API complexity.

use crate::core::error::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::Mutex;

use napi_derive::napi;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[napi(object)]
pub struct IndexedDoc {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

/// In-memory search index (Phase 6 stub).
/// Full Tantivy integration planned for a future phase.
pub struct SearchIndex {
    docs: Mutex<HashMap<String, IndexedDoc>>,
    full_text: Mutex<HashMap<String, String>>,  // doc_id → full text
}

impl SearchIndex {
    pub fn open(_index_dir: &std::path::Path) -> AppResult<Self> {
        Ok(SearchIndex {
            docs: Mutex::new(HashMap::new()),
            full_text: Mutex::new(HashMap::new()),
        })
    }

    pub fn index_document(&self, document_id: &str, title: &str, content: &str) -> AppResult<()> {
        if let Ok(mut docs) = self.docs.lock() {
            docs.insert(document_id.to_string(), IndexedDoc {
                document_id: document_id.to_string(),
                title: title.to_string(),
                snippet: content.chars().take(200).collect(),
                score: 1.0,
            });
        }
        if let Ok(mut texts) = self.full_text.lock() {
            texts.insert(document_id.to_string(), content.to_string());
        }
        Ok(())
    }

    pub fn remove_document(&self, document_id: &str) -> AppResult<()> {
        if let Ok(mut docs) = self.docs.lock() { docs.remove(document_id); }
        if let Ok(mut texts) = self.full_text.lock() { texts.remove(document_id); }
        Ok(())
    }

    pub fn search(&self, query_str: &str, limit: usize) -> AppResult<Vec<IndexedDoc>> {
        let query_lower = query_str.to_lowercase();
        let mut results = Vec::new();

        if let Ok(texts) = self.full_text.lock() {
            for (id, text) in texts.iter() {
                let text_lower = text.to_lowercase();
                if text_lower.contains(&query_lower) {
                    // Score by frequency of occurrence
                    let count = text_lower.matches(&query_lower).count();
                    let snippet = find_snippet(text, &query_lower, 200);

                    if let Ok(docs) = self.docs.lock() {
                        if let Some(doc) = docs.get(id) {
                            results.push(IndexedDoc {
                                document_id: id.clone(),
                                title: doc.title.clone(),
                                snippet,
                                score: count as f64,
                            });
                        }
                    }
                }
            }
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        Ok(results)
    }
}

fn find_snippet(text: &str, query: &str, max_len: usize) -> String {
    let pos = text.to_lowercase().find(query).unwrap_or(0);
    let start = pos.saturating_sub(40);
    let end = (pos + query.len() + 40).min(text.len());
    let mut snippet: String = text[start..end].chars().collect();
    if start > 0 { snippet.insert_str(0, "..."); }
    if end < text.len() { snippet.push_str("..."); }
    snippet.truncate(max_len);
    snippet
}
