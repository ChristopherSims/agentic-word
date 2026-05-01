//! ProseMirror JSON types, parsing, text extraction, and canonical serialization.
//! These are internal Rust types (no napi annotations) — passed as serde_json::Value across napi.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A ProseMirror mark (inline formatting).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PMMark {
    #[serde(rename = "type")]
    pub mark_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attrs: Option<HashMap<String, serde_json::Value>>,
}

/// A ProseMirror node (block or inline element).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PMNode {
    #[serde(rename = "type", default)]
    pub node_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attrs: Option<HashMap<String, serde_json::Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<PMNode>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marks: Option<Vec<PMMark>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// The root ProseMirror document.
pub type PMDoc = PMNode;

impl PMNode {
    /// Create a root document node.
    pub fn doc(content: Vec<PMNode>) -> Self {
        PMNode {
            node_type: "doc".to_string(),
            attrs: None,
            content: Some(content),
            marks: None,
            text: None,
        }
    }

    /// Create a text node with optional marks.
    pub fn text(text: impl Into<String>, marks: Option<Vec<PMMark>>) -> Self {
        PMNode {
            node_type: "text".to_string(),
            attrs: None,
            content: None,
            marks,
            text: Some(text.into()),
        }
    }

    /// Create a paragraph node with content.
    pub fn paragraph(content: Vec<PMNode>) -> Self {
        PMNode {
            node_type: "paragraph".to_string(),
            attrs: None,
            content: Some(content),
            marks: None,
            text: None,
        }
    }

    /// Create a heading node.
    pub fn heading(level: u8, content: Vec<PMNode>) -> Self {
        let mut attrs = HashMap::new();
        attrs.insert("level".to_string(), serde_json::Value::from(level));
        PMNode {
            node_type: "heading".to_string(),
            attrs: Some(attrs),
            content: Some(content),
            marks: None,
            text: None,
        }
    }

    /// Create a hard break node.
    pub fn hard_break() -> Self {
        PMNode {
            node_type: "hardBreak".to_string(),
            attrs: None,
            content: None,
            marks: None,
            text: None,
        }
    }

    /// Create a horizontal rule node.
    pub fn horizontal_rule() -> Self {
        PMNode {
            node_type: "horizontalRule".to_string(),
            attrs: None,
            content: None,
            marks: None,
            text: None,
        }
    }

    /// Create a code block node.
    pub fn code_block(content: Vec<PMNode>) -> Self {
        PMNode {
            node_type: "codeBlock".to_string(),
            attrs: None,
            content: Some(content),
            marks: None,
            text: None,
        }
    }

    /// Create a blockquote node.
    pub fn blockquote(content: Vec<PMNode>) -> Self {
        PMNode {
            node_type: "blockquote".to_string(),
            attrs: None,
            content: Some(content),
            marks: None,
            text: None,
        }
    }

    /// Create a bullet list node.
    pub fn bullet_list(items: Vec<PMNode>) -> Self {
        PMNode {
            node_type: "bulletList".to_string(),
            attrs: None,
            content: Some(items),
            marks: None,
            text: None,
        }
    }

    /// Create a numbered/ordered list node.
    pub fn ordered_list(items: Vec<PMNode>) -> Self {
        PMNode {
            node_type: "orderedList".to_string(),
            attrs: None,
            content: Some(items),
            marks: None,
            text: None,
        }
    }

    /// Create a list item node.
    pub fn list_item(content: Vec<PMNode>) -> Self {
        PMNode {
            node_type: "listItem".to_string(),
            attrs: None,
            content: Some(content),
            marks: None,
            text: None,
        }
    }

    /// Create an image node.
    pub fn image(src: impl Into<String>, alt: Option<String>, title: Option<String>) -> Self {
        let mut attrs = HashMap::new();
        attrs.insert("src".to_string(), serde_json::Value::String(src.into()));
        if let Some(a) = alt {
            attrs.insert("alt".to_string(), serde_json::Value::String(a));
        }
        if let Some(t) = title {
            attrs.insert("title".to_string(), serde_json::Value::String(t));
        }
        PMNode {
            node_type: "image".to_string(),
            attrs: Some(attrs),
            content: None,
            marks: None,
            text: None,
        }
    }

    // ─── Marks (inline formatting helpers) ───

    pub fn bold() -> PMMark {
        PMMark { mark_type: "bold".to_string(), attrs: None }
    }

    pub fn italic() -> PMMark {
        PMMark { mark_type: "italic".to_string(), attrs: None }
    }

    pub fn underline() -> PMMark {
        PMMark { mark_type: "underline".to_string(), attrs: None }
    }

    pub fn strikethrough() -> PMMark {
        PMMark { mark_type: "strike".to_string(), attrs: None }
    }

    pub fn code_mark() -> PMMark {
        PMMark { mark_type: "code".to_string(), attrs: None }
    }

    pub fn link_mark(href: impl Into<String>) -> PMMark {
        let mut attrs = HashMap::new();
        attrs.insert("href".to_string(), serde_json::Value::String(href.into()));
        PMMark { mark_type: "link".to_string(), attrs: Some(attrs) }
    }
}

// ─── Text Extraction ───

/// Extract all plain text from a ProseMirror JSON document.
/// Walks the node tree and concatenates text from all text nodes.
pub fn extract_text(node: &PMNode) -> String {
    let mut text = String::new();
    extract_text_impl(node, &mut text);
    text
}

fn extract_text_impl(node: &PMNode, output: &mut String) {
    if let Some(ref t) = node.text {
        if !output.is_empty() && !node.node_type.is_empty() {
            output.push(' ');
        }
        output.push_str(t);
    }
    if let Some(ref children) = node.content {
        for child in children {
            extract_text_impl(child, output);
        }
    }
}

/// Count words in a ProseMirror document.
pub fn count_words(node: &PMNode) -> usize {
    extract_text(node).split_whitespace().count()
}

/// Count characters (including spaces) in a ProseMirror document.
pub fn count_chars(node: &PMNode) -> usize {
    extract_text(node).chars().count()
}

/// Count characters (excluding spaces) in a ProseMirror document.
pub fn count_chars_no_spaces(node: &PMNode) -> usize {
    extract_text(node).chars().filter(|c| !c.is_whitespace()).count()
}

// ─── Canonical Serialization for Diffing ───

/// Serialize a PMDoc to canonical JSON text for diffing.
/// Sorts attrs, normalizes whitespace, and produces one node per line
/// for meaningful line-based diffs.
pub fn canonical_serialize(doc: &PMDoc) -> String {
    let mut output = String::new();
    canonical_serialize_node(doc, &mut output, 0);
    output
}

fn canonical_serialize_node(node: &PMNode, output: &mut String, indent: usize) {
    let indent_str = " ".repeat(indent);
    output.push_str(&format!("{}[{}]", indent_str, node.node_type));

    // Sorted attrs
    if let Some(ref attrs) = node.attrs {
        let mut keys: Vec<&String> = attrs.keys().collect();
        keys.sort();
        output.push('(');
        for (i, key) in keys.iter().enumerate() {
            if i > 0 { output.push_str(", "); }
            output.push_str(&format!("{}={}", key, attrs[*key]));
        }
        output.push(')');
    }

    // Marks (for text nodes)
    if let Some(ref marks) = node.marks {
        let mut mark_strs: Vec<String> = marks.iter()
            .map(|m| m.mark_type.clone())
            .collect();
        mark_strs.sort();
        output.push_str(&format!("<{}>", mark_strs.join("+")));
    }

    // Text content
    if let Some(ref text) = node.text {
        output.push_str(&format!(" \"{}\"", text));
    }

    output.push('\n');

    // Children
    if let Some(ref children) = node.content {
        for child in children {
            canonical_serialize_node(child, output, indent + 2);
        }
    }
}

// ─── Parse ProseMirror JSON ───

/// Parse a ProseMirror JSON string into a PMDoc.
pub fn parse_pm_json(json: &str) -> Result<PMDoc, serde_json::Error> {
    serde_json::from_str(json)
}

/// Serialize a PMDoc to JSON string.
pub fn to_json(doc: &PMDoc) -> Result<String, serde_json::Error> {
    serde_json::to_string(doc)
}
