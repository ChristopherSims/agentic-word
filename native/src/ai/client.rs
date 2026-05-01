//! OpenAI-compatible HTTP client via reqwest.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatCompletionResponse {
    pub choices: Vec<Choice>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Choice {
    pub message: AssistantMessage,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssistantMessage {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

/// Non-streaming chat completion.
pub async fn chat_completion(
    endpoint: &str,
    api_key: &str,
    request: &ChatCompletionRequest,
) -> Result<ChatCompletionResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(request)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    resp.json::<ChatCompletionResponse>()
        .await
        .map_err(|e| format!("Parse error: {}", e))
}

/// Streaming chat completion via SSE.
/// Calls `on_token` for each content delta.
pub async fn stream_chat_completion(
    endpoint: &str,
    api_key: &str,
    request: &ChatCompletionRequest,
    mut on_token: impl FnMut(String),
) -> Result<String, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let stream_req = ChatCompletionRequest {
        stream: Some(true),
        ..request.clone()
    };

    let resp = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&stream_req)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    let mut full_content = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    return Ok(full_content);
                }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = event["choices"][0]["delta"]["content"].as_str() {
                        full_content.push_str(delta);
                        on_token(delta.to_string());
                    }
                }
            }
        }
    }

    Ok(full_content)
}
