//! AI tool registry — 17 tools matching agent-bridge.ts.

use serde_json::{json, Value};

/// Tool definition sent to the LLM.
pub fn get_tool_definitions() -> Vec<Value> {
    vec![
        tool_def("read_document", "Read the current document content", json!({
            "type": "object",
            "properties": {}
        })),
        tool_def("write_document", "Replace the entire document content", json!({
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "New document content (HTML or markdown)"}
            },
            "required": ["content"]
        })),
        tool_def("search_document", "Search within the current document", json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"}
            },
            "required": ["query"]
        })),
        tool_def("get_selection", "Get the currently selected text in the document", json!({
            "type": "object", "properties": {}
        })),
        tool_def("replace_selection", "Replace the currently selected text", json!({
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Replacement text"}
            },
            "required": ["text"]
        })),
        tool_def("vcs_log", "Show commit history", json!({
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max commits to show"}
            }
        })),
        tool_def("vcs_diff", "Show diff between two commits", json!({
            "type": "object",
            "properties": {
                "from": {"type": "string", "description": "From commit ID"},
                "to": {"type": "string", "description": "To commit ID"}
            },
            "required": ["from", "to"]
        })),
        tool_def("vcs_commit", "Create a new version commit", json!({
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Commit message"}
            },
            "required": ["message"]
        })),
        tool_def("vcs_branch_list", "List all branches", json!({
            "type": "object", "properties": {}
        })),
        tool_def("vcs_merge", "Merge a branch into current", json!({
            "type": "object",
            "properties": {
                "branch": {"type": "string", "description": "Source branch name"}
            },
            "required": ["branch"]
        })),
        tool_def("web_search", "Search the web", json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"}
            },
            "required": ["query"]
        })),
        tool_def("web_extract", "Extract content from URLs", json!({
            "type": "object",
            "properties": {
                "urls": {"type": "array", "items": {"type": "string"}, "description": "URLs to extract"}
            },
            "required": ["urls"]
        })),
        tool_def("generate_image", "Generate an image from a prompt", json!({
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Image generation prompt"}
            },
            "required": ["prompt"]
        })),
        tool_def("plugin_list", "List installed plugins", json!({
            "type": "object", "properties": {}
        })),
        tool_def("plugin_run", "Run a plugin command", json!({
            "type": "object",
            "properties": {
                "plugin_id": {"type": "string"},
                "command": {"type": "string"}
            },
            "required": ["plugin_id", "command"]
        })),
        tool_def("get_stats", "Get document statistics", json!({
            "type": "object", "properties": {}
        })),
        tool_def("get_outline", "Get document outline (headings)", json!({
            "type": "object", "properties": {}
        })),
        tool_def("translate", "Translate text to another language", json!({
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "target_language": {"type": "string"}
            },
            "required": ["text", "target_language"]
        })),
    ]
}

fn tool_def(name: &str, description: &str, parameters: Value) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": parameters
        }
    })
}
