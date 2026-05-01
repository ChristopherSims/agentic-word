//! ProseMirror JSON ↔ HTML ↔ Markdown converters.
//!
//! HTML → PM: uses scraper crate to parse HTML, walks DOM, maps tags to PM nodes.
//! PM → HTML: walks PM tree, emits HTML tags.
//! MD → PM: uses pulldown-cmark to parse MD AST, maps to PM nodes.
//! PM → MD: walks PM tree, emits CommonMark syntax.

use crate::storage::prose_mirror::{PMDoc, PMMark, PMNode};
use scraper::{ElementRef, Html, Node, Selector};


// ═══════════════════════════════════════════════════════════════
// HTML → ProseMirror JSON
// ═══════════════════════════════════════════════════════════════

/// Convert HTML string to ProseMirror JSON string.
pub fn html_to_pm(html: &str) -> Result<String, String> {
    let document = Html::parse_document(html);
    let body_sel = Selector::parse("body").map_err(|e| format!("Selector error: {}", e))?;

    let body = document.select(&body_sel).next()
        .ok_or_else(|| "No body element found".to_string())?;

    let mut nodes = Vec::new();

    // Process direct children of body
    for child in body.children() {
        match child.value() {
            Node::Element(_) => {
                if let Some(el) = ElementRef::wrap(child) {
                    if let Some(node) = convert_element(el, &mut Vec::new(), 0) {
                        nodes.push(node);
                    }
                }
            }
            Node::Text(text) => {
                let trimmed = text.text.trim();
                if !trimmed.is_empty() {
                    nodes.push(PMNode::paragraph(vec![PMNode::text(trimmed, None)]));
                }
            }
            _ => {}
        }
    }

    if nodes.is_empty() {
        nodes.push(PMNode::paragraph(vec![PMNode::text("(empty document)", None)]));
    }

    let doc = PMNode::doc(nodes);
    serde_json::to_string(&doc).map_err(|e| format!("Serialization error: {}", e))
}

fn convert_element(
    el: ElementRef,
    inherited_marks: &mut Vec<PMMark>,
    _depth: usize,
) -> Option<PMNode> {
    let tag = el.value().name.local.as_ref();
    match tag {
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let level = tag[1..].parse::<u8>().unwrap_or(1);
            let children = convert_children_elements(el, inherited_marks);
            Some(PMNode::heading(level, children))
        }
        "p" | "div" => {
            let children = convert_children_elements(el, inherited_marks);
            if children.is_empty() { None } else { Some(PMNode::paragraph(children)) }
        }
        "blockquote" => {
            let children = convert_children_elements(el, inherited_marks);
            if children.is_empty() { None } else { Some(PMNode::blockquote(children)) }
        }
        "pre" => {
            // Extract text from <code> child or the <pre> itself
            let text = el.text().collect::<Vec<_>>().join("");
            let trimmed = text.trim().to_string();
            if trimmed.is_empty() { None }
            else { Some(PMNode::code_block(vec![PMNode::text(trimmed, None)])) }
        }
        "ul" => {
            let items = convert_list_items(el, inherited_marks, false);
            if items.is_empty() { None } else { Some(PMNode::bullet_list(items)) }
        }
        "ol" => {
            let items = convert_list_items(el, inherited_marks, true);
            if items.is_empty() { None } else { Some(PMNode::ordered_list(items)) }
        }
        "li" => {
            let children = convert_children_elements(el, inherited_marks);
            Some(PMNode::list_item(children))
        }
        "hr" => Some(PMNode::horizontal_rule()),
        "br" => Some(PMNode::hard_break()),
        "img" => {
            let src = el.value().attr("src").unwrap_or("");
            let alt = el.value().attr("alt");
            let title = el.value().attr("title");
            Some(PMNode::image(
                src,
                alt.map(|s| s.to_string()),
                title.map(|s| s.to_string()),
            ))
        }
        // Inline formatting
        "strong" | "b" => {
            inherited_marks.push(PMNode::bold());
            let result = convert_inline(el, inherited_marks);
            inherited_marks.pop();
            result
        }
        "em" | "i" => {
            inherited_marks.push(PMNode::italic());
            let result = convert_inline(el, inherited_marks);
            inherited_marks.pop();
            result
        }
        "u" | "ins" => {
            inherited_marks.push(PMNode::underline());
            let result = convert_inline(el, inherited_marks);
            inherited_marks.pop();
            result
        }
        "s" | "strike" | "del" => {
            inherited_marks.push(PMNode::strikethrough());
            let result = convert_inline(el, inherited_marks);
            inherited_marks.pop();
            result
        }
        "code" => {
            inherited_marks.push(PMNode::code_mark());
            let result = convert_inline(el, inherited_marks);
            inherited_marks.pop();
            result
        }
        "a" => {
            if let Some(href) = el.value().attr("href") {
                inherited_marks.push(PMNode::link_mark(href));
            }
            let result = convert_inline(el, inherited_marks);
            if el.value().attr("href").is_some() {
                inherited_marks.pop();
            }
            result
        }
        // Inline pass-through elements
        "span" | "label" | "abbr" | "cite" | "dfn" | "kbd" | "mark"
        | "q" | "samp" | "small" | "sub" | "sup" | "time" | "var" => {
            convert_inline(el, inherited_marks)
        }
        // Skip non-content
        "script" | "style" | "head" | "meta" | "link" | "title" => None,
        // Unknown: try as inline
        _ => convert_inline(el, inherited_marks),
    }
}

fn convert_children_elements(parent: ElementRef, inherited_marks: &mut Vec<PMMark>) -> Vec<PMNode> {
    let mut children = Vec::new();
    let mut current_text = String::new();

    for child in parent.children() {
        match child.value() {
            Node::Text(text) => {
                current_text.push_str(&text.text);
            }
            Node::Element(_) => {
                // Flush accumulated text
                if !current_text.trim().is_empty() {
                    let marks = if inherited_marks.is_empty() { None } else { Some(inherited_marks.clone()) };
                    children.push(PMNode::text(current_text.trim(), marks));
                    current_text.clear();
                }
                if let Some(el) = ElementRef::wrap(child) {
                    if let Some(node) = convert_element(el, inherited_marks, 0) {
                        children.push(node);
                    }
                }
            }
            _ => {}
        }
    }

    // Flush remaining text
    if !current_text.trim().is_empty() {
        let marks = if inherited_marks.is_empty() { None } else { Some(inherited_marks.clone()) };
        children.push(PMNode::text(current_text.trim(), marks));
    }

    children
}

fn convert_inline(parent: ElementRef, inherited_marks: &mut Vec<PMMark>) -> Option<PMNode> {
    let children = convert_children_elements(parent, inherited_marks);
    if children.is_empty() { None }
    else if children.len() == 1 && children[0].text.is_some() {
        Some(children[0].clone())
    } else {
        Some(PMNode::paragraph(children))
    }
}

fn convert_list_items(
    list: ElementRef,
    inherited_marks: &mut Vec<PMMark>,
    _ordered: bool,
) -> Vec<PMNode> {
    let mut items = Vec::new();
    for child in list.children() {
        if let Node::Element(_) = child.value() {
            if let Some(el) = ElementRef::wrap(child) {
                if el.value().name.local.as_ref() == "li" {
                    let content = convert_children_elements(el, inherited_marks);
                    if !content.is_empty() {
                        items.push(PMNode::list_item(content));
                    }
                }
            }
        }
    }
    items
}

// ═══════════════════════════════════════════════════════════════
// ProseMirror JSON → HTML
// ═══════════════════════════════════════════════════════════════

/// Convert ProseMirror JSON string to HTML string.
pub fn pm_to_html(pm_json: &str) -> Result<String, String> {
    let doc: PMDoc = serde_json::from_str(pm_json)
        .map_err(|e| format!("Invalid PM JSON: {}", e))?;
    Ok(pm_node_to_html(&doc))
}

fn pm_node_to_html(node: &PMNode) -> String {
    match node.node_type.as_str() {
        "doc" => {
            if let Some(ref children) = node.content {
                children.iter().map(|c| pm_node_to_html(c)).collect::<Vec<_>>().join("\n")
            } else {
                String::new()
            }
        }
        "text" => {
            let text = html_escape::encode_text(node.text.as_deref().unwrap_or(""));
            apply_marks(&text, &node.marks)
        }
        "paragraph" => format!("<p>{}</p>", children_html(node)),
        "heading" => {
            let level = node.attrs.as_ref()
                .and_then(|a| a.get("level"))
                .and_then(|v| v.as_u64())
                .unwrap_or(1) as u8;
            format!("<h{level}>{}</h{level}>", children_html(node))
        }
        "blockquote" => format!("<blockquote>{}</blockquote>", children_html(node)),
        "codeBlock" => format!("<pre><code>{}</code></pre>", children_html(node)),
        "bulletList" => format!("<ul>{}</ul>", children_html(node)),
        "orderedList" => format!("<ol>{}</ol>", children_html(node)),
        "listItem" => format!("<li>{}</li>", children_html(node)),
        "hardBreak" => "<br>".to_string(),
        "horizontalRule" => "<hr>".to_string(),
        "image" => {
            let src = node.attrs.as_ref()
                .and_then(|a| a.get("src")).and_then(|v| v.as_str()).unwrap_or("");
            let alt = node.attrs.as_ref()
                .and_then(|a| a.get("alt")).and_then(|v| v.as_str()).unwrap_or("");
            let title = node.attrs.as_ref()
                .and_then(|a| a.get("title")).and_then(|v| v.as_str());
            match title {
                Some(t) => format!("<img src=\"{}\" alt=\"{}\" title=\"{}\">", src, alt, t),
                None => format!("<img src=\"{}\" alt=\"{}\">", src, alt),
            }
        }
        "table" => format!("<table>{}</table>", children_html(node)),
        "tableRow" => format!("<tr>{}</tr>", children_html(node)),
        "tableCell" => format!("<td>{}</td>", children_html(node)),
        "tableHeader" => format!("<th>{}</th>", children_html(node)),
        _ => children_html(node),
    }
}

fn children_html(node: &PMNode) -> String {
    if let Some(ref children) = node.content {
        children.iter().map(|c| pm_node_to_html(c)).collect::<Vec<_>>().join("")
    } else {
        String::new()
    }
}

fn apply_marks(text: &str, marks: &Option<Vec<PMMark>>) -> String {
    let mut result = text.to_string();
    if let Some(ref marks) = marks {
        for mark in marks {
            result = match mark.mark_type.as_str() {
                "bold" => format!("<strong>{}</strong>", result),
                "italic" => format!("<em>{}</em>", result),
                "underline" => format!("<u>{}</u>", result),
                "strike" => format!("<s>{}</s>", result),
                "code" => format!("<code>{}</code>", result),
                "link" => {
                    let href = mark.attrs.as_ref()
                        .and_then(|a| a.get("href"))
                        .and_then(|v| v.as_str()).unwrap_or("#");
                    format!("<a href=\"{}\">{}</a>", href, result)
                }
                _ => result,
            };
        }
    }
    result
}

// ═══════════════════════════════════════════════════════════════
// Markdown → ProseMirror JSON
// ═══════════════════════════════════════════════════════════════

/// Convert Markdown string to ProseMirror JSON string.
pub fn md_to_pm(md: &str) -> Result<String, String> {
    use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

    let parser = Parser::new_ext(md, Options::all());
    let mut nodes: Vec<PMNode> = Vec::new();
    let mut current_paragraph: Vec<PMNode> = Vec::new();
    let mut in_code_block = false;
    let mut code_content = String::new();
    let mut _heading_level: Option<u8> = None;
    let mut list_stack: Vec<(bool, Vec<PMNode>)> = Vec::new(); // (ordered, items)

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Heading { level, .. } => {
                    flush_paragraph(&mut current_paragraph, &mut nodes);
                    _heading_level = Some(level as u8);
                }
                Tag::Paragraph => {}
                Tag::BlockQuote(_) => {
                    flush_paragraph(&mut current_paragraph, &mut nodes);
                }
                Tag::CodeBlock(_) => {
                    flush_paragraph(&mut current_paragraph, &mut nodes);
                    in_code_block = true;
                    code_content.clear();
                }
                Tag::List(ordered) => {
                    flush_paragraph(&mut current_paragraph, &mut nodes);
                    list_stack.push((ordered.is_some(), Vec::new()));
                }
                Tag::Item => {}
                Tag::Table(_) => { flush_paragraph(&mut current_paragraph, &mut nodes); }
                Tag::TableHead | Tag::TableRow | Tag::TableCell => {}
                Tag::Emphasis | Tag::Strong | Tag::Strikethrough => {}
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Heading(level) => {
                    let heading = PMNode::heading(level as u8, std::mem::take(&mut current_paragraph));
                    nodes.push(heading);
                }
                TagEnd::Paragraph => {
                    flush_paragraph(&mut current_paragraph, &mut nodes);
                }
                TagEnd::CodeBlock => {
                    in_code_block = false;
                    let code = code_content.trim().to_string();
                    nodes.push(PMNode::code_block(vec![PMNode::text(code, None)]));
                    code_content.clear();
                }
                TagEnd::Item => {
                    let item = PMNode::list_item(std::mem::take(&mut current_paragraph));
                    if let Some((_, ref mut items)) = list_stack.last_mut() {
                        items.push(item);
                    }
                }
                TagEnd::List(_) => {
                    if let Some((ordered, items)) = list_stack.pop() {
                        if !items.is_empty() {
                            if ordered {
                                nodes.push(PMNode::ordered_list(items));
                            } else {
                                nodes.push(PMNode::bullet_list(items));
                            }
                        }
                    }
                }
                _ => {}
            },
            Event::Text(text) => {
                if in_code_block {
                    code_content.push_str(&text);
                } else {
                    current_paragraph.push(PMNode::text(text.to_string(), None));
                }
            }
            Event::Code(text) => {
                if !in_code_block {
                    current_paragraph.push(PMNode::text(
                        text.to_string(),
                        Some(vec![PMNode::code_mark()]),
                    ));
                } else {
                    code_content.push_str(&text);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                current_paragraph.push(PMNode::hard_break());
            }
            Event::Rule => {
                flush_paragraph(&mut current_paragraph, &mut nodes);
                nodes.push(PMNode::horizontal_rule());
            }
            _ => {}
        }
    }

    flush_paragraph(&mut current_paragraph, &mut nodes);

    let doc = PMNode::doc(nodes);
    serde_json::to_string(&doc).map_err(|e| format!("Serialization error: {}", e))
}

fn flush_paragraph(current: &mut Vec<PMNode>, nodes: &mut Vec<PMNode>) {
    if !current.is_empty() {
        nodes.push(PMNode::paragraph(std::mem::take(current)));
    }
}

// ═══════════════════════════════════════════════════════════════
// ProseMirror JSON → Markdown
// ═══════════════════════════════════════════════════════════════

/// Convert ProseMirror JSON string to Markdown string.
pub fn pm_to_md(pm_json: &str) -> Result<String, String> {
    let doc: PMDoc = serde_json::from_str(pm_json)
        .map_err(|e| format!("Invalid PM JSON: {}", e))?;
    Ok(pm_node_to_md(&doc))
}

fn pm_node_to_md(node: &PMNode) -> String {
    match node.node_type.as_str() {
        "doc" => {
            if let Some(ref children) = node.content {
                children.iter().map(|c| pm_node_to_md(c)).collect::<Vec<_>>().join("\n\n")
            } else { String::new() }
        }
        "text" => {
            let text = node.text.as_deref().unwrap_or("");
            apply_md_marks(text, &node.marks)
        }
        "paragraph" => children_md(node),
        "heading" => {
            let level = node.attrs.as_ref().and_then(|a| a.get("level")).and_then(|v| v.as_u64()).unwrap_or(1) as usize;
            let prefix = "#".repeat(level);
            format!("{} {}", prefix, children_md(node))
        }
        "blockquote" => {
            let content = children_md(node);
            content.lines().map(|l| format!("> {}", l)).collect::<Vec<_>>().join("\n")
        }
        "codeBlock" => format!("```\n{}\n```", children_md(node)),
        "bulletList" => {
            if let Some(ref children) = node.content {
                children.iter().map(|c| format!("- {}", pm_node_to_md(c))).collect::<Vec<_>>().join("\n")
            } else { String::new() }
        }
        "orderedList" => {
            if let Some(ref children) = node.content {
                children.iter().enumerate().map(|(i, c)| format!("{}. {}", i + 1, pm_node_to_md(c))).collect::<Vec<_>>().join("\n")
            } else { String::new() }
        }
        "listItem" => children_md(node),
        "hardBreak" => "  \n".to_string(),
        "horizontalRule" => "---".to_string(),
        "image" => {
            let src = node.attrs.as_ref().and_then(|a| a.get("src")).and_then(|v| v.as_str()).unwrap_or("");
            let alt = node.attrs.as_ref().and_then(|a| a.get("alt")).and_then(|v| v.as_str()).unwrap_or("image");
            format!("![{}]({})", alt, src)
        }
        "table" => children_md(node),
        "tableRow" => {
            let cells = if let Some(ref children) = node.content {
                children.iter().map(|c| pm_node_to_md(c)).collect::<Vec<_>>()
            } else { Vec::new() };
            format!("| {} |", cells.join(" | "))
        }
        "tableHeader" => format!("**{}**", children_md(node)),
        "tableCell" => children_md(node),
        _ => children_md(node),
    }
}

fn children_md(node: &PMNode) -> String {
    if let Some(ref children) = node.content {
        children.iter().map(|c| pm_node_to_md(c)).collect::<Vec<_>>().join("")
    } else { String::new() }
}

fn apply_md_marks(text: &str, marks: &Option<Vec<PMMark>>) -> String {
    let mut result = text.to_string();
    if let Some(ref marks) = marks {
        for mark in marks {
            result = match mark.mark_type.as_str() {
                "bold" => format!("**{}**", result),
                "italic" => format!("*{}*", result),
                "underline" => format!("<u>{}</u>", result),
                "strike" => format!("~~{}~~", result),
                "code" => format!("`{}`", result),
                "link" => {
                    let href = mark.attrs.as_ref().and_then(|a| a.get("href")).and_then(|v| v.as_str()).unwrap_or("#");
                    format!("[{}]({})", result, href)
                }
                _ => result,
            };
        }
    }
    result
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_html_to_pm_heading() {
        let html = "<h1>Hello World</h1>";
        let pm = html_to_pm(html).unwrap();
        let doc: PMDoc = serde_json::from_str(&pm).unwrap();
        assert_eq!(doc.node_type, "doc");
        assert!(doc.content.unwrap()[0].node_type == "heading");
    }

    #[test]
    fn test_html_to_pm_paragraph() {
        let html = "<p>Simple paragraph.</p>";
        let pm = html_to_pm(html).unwrap();
        let doc: PMDoc = serde_json::from_str(&pm).unwrap();
        assert_eq!(doc.content.unwrap()[0].node_type, "paragraph");
    }

    #[test]
    fn test_html_to_pm_bold() {
        let html = "<p>Hello <strong>world</strong></p>";
        let pm = html_to_pm(html).unwrap();
        // Just verify it parses without error
        assert!(!pm.is_empty());
    }

    #[test]
    fn test_pm_to_html_roundtrip() {
        let html = "<p>Hello world</p>";
        let pm = html_to_pm(html).unwrap();
        let html2 = pm_to_html(&pm).unwrap();
        assert!(html2.contains("<p>Hello world</p>"));
    }

    #[test]
    fn test_md_to_pm_heading() {
        let md = "# Hello";
        let pm = md_to_pm(md).unwrap();
        let doc: PMDoc = serde_json::from_str(&pm).unwrap();
        let content = doc.content.unwrap();
        assert_eq!(content[0].node_type, "heading");
    }

    #[test]
    fn test_pm_to_md_roundtrip() {
        let md = "# Hello\n\nWorld.";
        let pm = md_to_pm(md).unwrap();
        let md2 = pm_to_md(&pm).unwrap();
        assert!(md2.contains("Hello"));
        assert!(md2.contains("World"));
    }
}
