//! System prompt templates.

use crate::core::types::AgentPreset;

pub fn build_messages(
    preset: Option<&AgentPreset>,
    user_message: &str,
    history_messages: &str,  // JSON array of ChatMessage
) -> Result<String, String> {
    let mut messages: Vec<serde_json::Value> = Vec::new();

    // System prompt
    if let Some(p) = preset {
        messages.push(serde_json::json!({
            "role": "system",
            "content": p.system_prompt
        }));
    } else {
        messages.push(serde_json::json!({
            "role": "system",
            "content": "You are an AI writing assistant integrated into a document editor. Help the user with writing, editing, research, and document management. Be concise and helpful."
        }));
    }

    // History
    if !history_messages.is_empty() {
        if let Ok(history) = serde_json::from_str::<Vec<serde_json::Value>>(history_messages) {
            messages.extend(history);
        }
    }

    // User message
    messages.push(serde_json::json!({
        "role": "user",
        "content": user_message
    }));

    serde_json::to_string(&messages).map_err(|e| format!("JSON error: {}", e))
}
