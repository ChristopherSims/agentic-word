//! Search query engine — substring-based full-text search.
//! Regex and Tantivy integrations planned for future phases.

use crate::core::error::AppResult;
use crate::search::index::{IndexedDoc, SearchIndex};

pub fn search_documents(
    index: &SearchIndex,
    query: &str,
    limit: usize,
) -> AppResult<Vec<IndexedDoc>> {
    index.search(query, limit)
}

pub fn find_in_text(text: &str, pattern: &str, case_sensitive: bool) -> Vec<(usize, usize, String)> {
    let mut results = Vec::new();
    let check = |t: &str, p: &str| -> bool {
        if case_sensitive { t.contains(p) } else { t.to_lowercase().contains(&p.to_lowercase()) }
    };

    for (line_idx, line) in text.lines().enumerate() {
        if check(line, pattern) {
            let pos = if case_sensitive {
                line.find(pattern).unwrap_or(0)
            } else {
                line.to_lowercase().find(&pattern.to_lowercase()).unwrap_or(0)
            };
            let start = pos.saturating_sub(20);
            let end = (pos + pattern.len() + 20).min(line.len());
            let snippet = line[start..end].to_string();
            results.push((line_idx, pos, snippet));
        }
    }
    results
}

pub fn replace_in_text(text: &str, find: &str, replace: &str, case_sensitive: bool) -> String {
    if case_sensitive {
        text.replace(find, replace)
    } else {
        // Simple case-insensitive replace using split and join
        let lower = text.to_lowercase();
        let find_lower = find.to_lowercase();
        let mut result = String::with_capacity(text.len());
        let mut last = 0;
        for (pos, _) in lower.match_indices(&find_lower) {
            result.push_str(&text[last..pos]);
            result.push_str(replace);
            last = pos + find.len();
        }
        result.push_str(&text[last..]);
        result
    }
}
