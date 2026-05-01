//! Smart formatting as a ProseMirror document transformation pipeline.
//!
//! Applies formatting rules while preserving document structure:
//!   - Whitespace cleanup in text nodes
//!   - Smart quotes / em dashes / en dashes
//!   - List normalization (same-type merge, paragraph wrapping)
//!   - Heading hierarchy enforcement
//!   - Blockquote content standardization
//!   - Empty block removal

use crate::storage::prose_mirror::PMNode;


/// Apply all formatting rules to a ProseMirror document.
/// Returns the transformed document.
pub fn apply_smart_formatting(doc: &PMNode) -> PMNode {
    let mut doc = doc.clone();

    // 1. Text-level: whitespace, smart quotes, dashes
    doc = transform_text_nodes(&doc, &text_formatting_rules);

    // 2. Structural: list normalization
    doc = normalize_lists(&doc);

    // 3. Structural: heading hierarchy
    doc = enforce_heading_hierarchy(&doc);

    // 4. Structural: blockquote standardization
    doc = standardize_blockquotes(&doc);

    // 5. Cleanup: remove empty blocks
    doc = remove_empty_blocks(&doc);

    doc
}

// ─── 1. Text-level formatting ───

/// Apply text-level formatting rules without parsing PM JSON.
/// Used as a fallback when PM JSON can't be parsed.
pub fn text_formatting_rules(text: &str) -> String {
    let mut result = text.to_string();

    // Normalize multiple spaces to single space
    result = result.split_whitespace().collect::<Vec<_>>().join(" ");

    // Smart quotes (paired)
    result = replace_smart_quotes(&result);

    // Em dashes (-- → —)
    result = replace_em_dashes(&result);

    // En dashes (number-number → number–number)
    result = replace_en_dashes(&result);

    // Remove spaces before punctuation
    result = remove_spaces_before_punctuation(&result);

    // Ensure single space after sentence-ending punctuation
    result = ensure_space_after_punctuation(&result);

    result
}

/// Walk the PM tree and apply a transform to every text node's content.
fn transform_text_nodes(node: &PMNode, f: &dyn Fn(&str) -> String) -> PMNode {
    let mut transformed = node.clone();

    // Transform text content
    if let Some(ref text) = node.text {
        let new_text = f(text);
        // Only update if changed
        if &new_text != text {
            transformed.text = Some(new_text);
        }
    }

    // Recurse into children
    if let Some(ref children) = node.content {
        let new_children: Vec<PMNode> = children
            .iter()
            .map(|child| transform_text_nodes(child, f))
            .collect();
        transformed.content = Some(new_children);
    }

    transformed
}

// ─── 2. List Normalization ───

/// Merge adjacent same-type lists and ensure listItems have paragraph children.
fn normalize_lists(node: &PMNode) -> PMNode {
    let mut transformed = node.clone();

    if let Some(ref children) = node.content {
        let mut new_children: Vec<PMNode> = Vec::new();

        for child in children {
            let normalized_child = normalize_lists(child); // recurse first

            // Merge adjacent same-type lists
            if is_list_type(&normalized_child) {
                if let Some(last) = new_children.last_mut() {
                    if last.node_type == normalized_child.node_type {
                        // Same list type — merge their items
                        if let Some(ref mut last_items) = last.content {
                            if let Some(ref new_items) = normalized_child.content {
                                last_items.extend(new_items.clone());
                            }
                        }
                        continue;
                    }
                }
            }

            // Ensure listItem has a paragraph wrapper
            let fixed = if normalized_child.node_type == "listItem" {
                ensure_list_item_has_paragraph(&normalized_child)
            } else {
                normalized_child
            };

            new_children.push(fixed);
        }

        transformed.content = Some(new_children);
    }

    transformed
}

fn is_list_type(node: &PMNode) -> bool {
    node.node_type == "bulletList" || node.node_type == "orderedList"
}

/// Ensure a listItem's first child is a paragraph. If it has text directly, wrap it.
fn ensure_list_item_has_paragraph(item: &PMNode) -> PMNode {
    let mut item = item.clone();

    if let Some(ref children) = item.content {
        if children.is_empty() {
            return item;
        }

        let first = &children[0];
        // If first child is already a block, it's fine
        if is_block_node(first) {
            return item;
        }

        // Wrap inline content in a paragraph
        let para = PMNode {
            node_type: "paragraph".to_string(),
            attrs: None,
            content: Some(children.clone()),
            marks: None,
            text: None,
        };
        item.content = Some(vec![para]);
    }

    item
}

fn is_block_node(node: &PMNode) -> bool {
    matches!(
        node.node_type.as_str(),
        "paragraph" | "heading" | "codeBlock" | "blockquote" |
        "bulletList" | "orderedList" | "listItem" | "horizontalRule" |
        "image" | "table" | "tableRow" | "tableCell"
    )
}

// ─── 3. Heading Hierarchy ───

/// Enforce proper heading nesting: levels must not increase by more than 1.
/// e.g., after h1 the next heading must be h2, not h3 or h4.
fn enforce_heading_hierarchy(node: &PMNode) -> PMNode {
    let mut transformed = node.clone();

    if let Some(ref children) = node.content {
        let mut last_heading_level: u8 = 0;
        let mut new_children: Vec<PMNode> = Vec::new();

        for child in children {
            let mut child = child.clone();

            if child.node_type == "heading" {
                if let Some(ref attrs) = child.attrs {
                    if let Some(level_val) = attrs.get("level") {
                        let current_level = level_val.as_u64().unwrap_or(1) as u8;

                        let corrected = if current_level > last_heading_level + 1 && last_heading_level > 0 {
                            last_heading_level + 1
                        } else {
                            current_level
                        };

                        if corrected != current_level {
                            let mut new_attrs = attrs.clone();
                            new_attrs.insert("level".to_string(), serde_json::Value::from(corrected));
                            child.attrs = Some(new_attrs);
                            last_heading_level = corrected;
                        } else {
                            last_heading_level = current_level;
                        }
                    }
                }
            }

            // Recurse
            let child = enforce_heading_hierarchy(&child);
            new_children.push(child);
        }

        transformed.content = Some(new_children);
    }

    transformed
}

// ─── 4. Blockquote Standardization ───

/// Ensure blockquote children are block-level elements.
/// Wrap inline text in a paragraph.
fn standardize_blockquotes(node: &PMNode) -> PMNode {
    let mut transformed = node.clone();

    if node.node_type == "blockquote" {
        if let Some(ref children) = node.content {
            let new_children: Vec<PMNode> = children
                .iter()
                .map(|child| {
                    if is_block_node(child) {
                        standardize_blockquotes(child) // recurse
                    } else {
                        // Wrap inline in paragraph
                        let para = PMNode {
                            node_type: "paragraph".to_string(),
                            attrs: None,
                            content: Some(vec![child.clone()]),
                            marks: None,
                            text: None,
                        };
                        para
                    }
                })
                .collect();
            transformed.content = Some(new_children);
        }
    } else if let Some(ref children) = node.content {
        let new_children: Vec<PMNode> = children
            .iter()
            .map(|child| standardize_blockquotes(child))
            .collect();
        transformed.content = Some(new_children);
    }

    transformed
}

// ─── 5. Empty Block Removal ───

/// Remove paragraph and heading nodes that contain only whitespace.
fn remove_empty_blocks(node: &PMNode) -> PMNode {
    let mut transformed = node.clone();

    if let Some(ref children) = node.content {
        let new_children: Vec<PMNode> = children
            .iter()
            .filter_map(|child| {
                let child = remove_empty_blocks(child); // recurse

                // Check if block is empty
                if is_whitespace_only_block(&child) {
                    return None; // remove it
                }

                Some(child)
            })
            .collect();
        transformed.content = Some(new_children);
    }

    transformed
}

fn is_whitespace_only_block(node: &PMNode) -> bool {
    if node.node_type != "paragraph" && node.node_type != "heading" {
        return false;
    }

    if let Some(ref children) = node.content {
        children.iter().all(|child| {
            if let Some(ref text) = child.text {
                text.trim().is_empty()
            } else {
                // Non-text child (image, hardBreak etc.) — not empty
                false
            }
        })
    } else {
        // No content at all → empty
        true
    }
}

// ─── Smart Character Replacement ───

fn replace_smart_quotes(text: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut in_double = false;
    let mut in_single = false;

    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '"' | '\u{201c}' | '\u{201d}' => {
                if !in_double {
                    result.push('\u{201c}');
                    in_double = true;
                } else {
                    result.push('\u{201d}');
                    in_double = false;
                }
            }
            '\'' | '\u{2018}' | '\u{2019}' => {
                if !in_single {
                    result.push('\u{2018}');
                    in_single = true;
                } else {
                    result.push('\u{2019}');
                    in_single = false;
                }
            }
            other => {
                result.push(other);
            }
        }
        i += 1;
    }
    result
}

fn replace_em_dashes(text: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if i + 1 < chars.len() && chars[i] == '-' && chars[i + 1] == '-' {
            result.push('\u{2014}');
            i += 2;
            // Skip a third hyphen if present (--- → —)
            if i < chars.len() && chars[i] == '-' {
                i += 1;
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

fn replace_en_dashes(text: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if i > 0
            && i + 1 < chars.len()
            && chars[i] == '-'
            && chars[i - 1].is_ascii_digit()
            && chars[i + 1].is_ascii_digit()
        {
            result.push('\u{2013}');
        } else {
            result.push(chars[i]);
        }
        i += 1;
    }
    result
}

fn remove_spaces_before_punctuation(text: &str) -> String {
    let mut result = text.to_string();
    for punct in &[",", ".", "!", "?", ";", ":"] {
        result = result.replace(&format!(" {}", punct), punct);
    }
    result
}

fn ensure_space_after_punctuation(text: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        result.push(chars[i]);
        if matches!(chars[i], '.' | '!' | '?' | ';' | ':') {
            if i + 1 < chars.len()
                && chars[i + 1] != ' '
                && chars[i + 1] != '\n'
                && !chars[i + 1].is_ascii_punctuation()
            {
                result.push(' ');
            }
        }
        i += 1;
    }
    result
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smart_quotes_in_text() {
        assert_eq!(replace_smart_quotes("He said \"hello\""), "He said \u{201c}hello\u{201d}");
    }

    #[test]
    fn test_em_dash() {
        assert!(replace_em_dashes("hello--world").contains('\u{2014}'));
    }

    #[test]
    fn test_single_spaces() {
        let result = text_formatting_rules("hello    world");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_ensure_paragraph_in_list_item() {
        let item = PMNode {
            node_type: "listItem".to_string(),
            attrs: None,
            content: Some(vec![PMNode::text("hello", None)]),
            marks: None,
            text: None,
        };
        let result = ensure_list_item_has_paragraph(&item);
        if let Some(ref children) = result.content {
            assert_eq!(children[0].node_type, "paragraph");
        } else {
            panic!("Expected content");
        }
    }

    #[test]
    fn test_merge_adjacent_lists() {
        let doc = PMNode::doc(vec![
            PMNode::bullet_list(vec![PMNode::list_item(vec![
                PMNode::paragraph(vec![PMNode::text("One", None)]),
            ])]),
            PMNode::bullet_list(vec![PMNode::list_item(vec![
                PMNode::paragraph(vec![PMNode::text("Two", None)]),
            ])]),
        ]);
        let result = normalize_lists(&doc);
        let children = result.content.unwrap();
        assert_eq!(children.len(), 1, "Two same-type lists should be merged");
        assert_eq!(children[0].node_type, "bulletList");
        let items = children[0].content.as_ref().unwrap();
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn test_heading_hierarchy() {
        let doc = PMNode::doc(vec![
            PMNode::heading(1, vec![PMNode::text("H1", None)]),
            PMNode::heading(4, vec![PMNode::text("Should be H2", None)]),
        ]);
        let result = enforce_heading_hierarchy(&doc);
        let children = result.content.unwrap();
        if let Some(ref attrs) = children[1].attrs {
            let level = attrs["level"].as_u64().unwrap();
            assert_eq!(level, 2, "H4 should be downgraded to H2 after H1");
        }
    }

    #[test]
    fn test_remove_empty_paragraph() {
        let doc = PMNode::doc(vec![
            PMNode::paragraph(vec![PMNode::text("Keep me", None)]),
            PMNode::paragraph(vec![PMNode::text("   ", None)]), // whitespace only
            PMNode::paragraph(vec![PMNode::text("Also keep", None)]),
        ]);
        let result = remove_empty_blocks(&doc);
        let children = result.content.unwrap();
        assert_eq!(children.len(), 2);
    }

    #[test]
    fn test_full_pipeline() {
        let doc = PMNode::doc(vec![
            PMNode::paragraph(vec![PMNode::text("hello    world", None)]),
            PMNode::paragraph(vec![PMNode::text("She said \"yes\"", None)]),
            PMNode::paragraph(vec![PMNode::text("page 5--10", None)]),
        ]);
        let result = apply_smart_formatting(&doc);
        let children = result.content.unwrap();

        // First para: single space
        let t1 = extract_first_text(&children[0]);
        assert_eq!(t1, "hello world");

        // Second para: smart quotes
        let t2 = extract_first_text(&children[1]);
        assert!(t2.contains('\u{201c}'));
        assert!(t2.contains('\u{201d}'));

        // Third para: em dash
        let t3 = extract_first_text(&children[2]);
        assert!(t3.contains('\u{2014}'));
    }

    fn extract_first_text(node: &PMNode) -> String {
        if let Some(ref text) = node.text {
            return text.clone();
        }
        if let Some(ref children) = node.content {
            for child in children {
                let t = extract_first_text(child);
                if !t.is_empty() {
                    return t;
                }
            }
        }
        String::new()
    }
}
