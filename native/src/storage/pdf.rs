//! PDF export stub — Phase 3 writes a text file.
//! Full PDF rendering with genpdf will be implemented in a later phase
//! once font embedding is properly set up.

use crate::storage::prose_mirror::{PMDoc, PMNode};
use std::fs;
use std::path::Path;

/// Export ProseMirror JSON to a formatted text file (PDF stub).
/// Full PDF rendering deferred to post-Phase 3.
pub fn pm_to_pdf(
    pm_json: &str,
    output_path: &str,
    _title: Option<&str>,
) -> Result<(), String> {
    let doc: PMDoc = serde_json::from_str(pm_json)
        .map_err(|e| format!("Invalid PM JSON: {}", e))?;

    let file_path = Path::new(output_path);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create output directory: {}", e))?;
    }

    let text = render_to_text(&doc);
    fs::write(output_path, text).map_err(|e| format!("Write error: {}", e))?;

    Ok(())
}

fn render_to_text(doc: &PMDoc) -> String {
    let mut output = String::new();
    if let Some(ref children) = doc.content {
        for child in children { render_node_text(child, &mut output); }
    }
    if output.is_empty() { output.push_str("(empty document)"); }
    output
}

fn render_node_text(node: &PMNode, output: &mut String) {
    match node.node_type.as_str() {
        "paragraph" => { output.push_str(&collect_inline_text(node)); output.push_str("\n\n"); }
        "heading" => {
            let level = node.attrs.as_ref().and_then(|a| a.get("level")).and_then(|v| v.as_u64()).unwrap_or(1) as u8;
            let prefix = match level { 1 => "========= ", 2 => "-------- ", _ => "" };
            output.push_str(&format!("{}{}\n\n", prefix, collect_inline_text(node)));
        }
        "blockquote" => {
            let text = collect_inline_text(node);
            for line in text.lines() { output.push_str(&format!("  | {}\n", line)); }
            output.push('\n');
        }
        "codeBlock" => {
            let text = collect_inline_text(node);
            for line in text.lines() { output.push_str(&format!("      {}\n", line)); }
            output.push('\n');
        }
        "bulletList" | "orderedList" => {
            if let Some(ref items) = node.content {
                for (i, item) in items.iter().enumerate() {
                    let bullet = if node.node_type == "orderedList" { format!(" {}.", i + 1) } else { " \u{2022}".to_string() };
                    if item.node_type == "listItem" {
                        output.push_str(&format!("{} {}\n", bullet, collect_inline_text(item)));
                    }
                }
            }
            output.push('\n');
        }
        "horizontalRule" => output.push_str("──────────────────────────\n\n"),
        "hardBreak" => output.push('\n'),
        "image" => {
            let alt = node.attrs.as_ref().and_then(|a| a.get("alt")).and_then(|v| v.as_str()).unwrap_or("Image");
            output.push_str(&format!("[Image: {}]\n\n", alt));
        }
        _ => { if let Some(ref c) = node.content { for child in c { render_node_text(child, output); } } }
    }
}

fn collect_inline_text(node: &PMNode) -> String {
    let mut text = String::new();
    collect_inline(node, &mut text);
    text.trim().to_string()
}

fn collect_inline(node: &PMNode, output: &mut String) {
    if let Some(ref t) = node.text { output.push_str(t); }
    if let Some(ref children) = node.content {
        for child in children { collect_inline(child, output); }
    }
}
