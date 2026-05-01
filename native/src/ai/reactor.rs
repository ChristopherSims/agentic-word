//! AI Conversation Reactor — manages the full LLM conversation loop.
//!
//! The reactor uses a polling model for napi integration. TS calls:
//!   start_conversation() → poll_conversation() in a loop → provide_tool_results()
//! Events are buffered in an mpsc channel. The tokio task handles SSE streaming,
//! tool call detection, and multi-turn follow-ups.
//!
//! Poll event types:
//!   {"type":"token","data":"hello"}     — content delta
//!   {"type":"tool_calls","data":[...]}   — tool calls to execute
//!   {"type":"done","data":{"fullContent":"...","chainComplete":true}}
//!   {"type":"error","data":"message"}    — error occurred
//!   "waiting"                            — no events yet, keep polling

use crate::ai::client::{ChatCompletionRequest, ChatMessage, chat_completion};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::sync::OnceLock;

/// Lazy global tokio runtime for spawning reactor tasks from sync napi context.
fn reactor_runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Runtime::new()
            .expect("Failed to create tokio runtime for AI reactor")
    })
}

// ─── Types ───

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolCallInfo {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub tool_name: String,
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize)]
struct ReactorEvent {
    #[serde(rename = "type")]
    event_type: String,
    data: serde_json::Value,
}

// ─── Conversation State ───

pub struct ReactorState {
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub tools_json: String,
    pub max_turns: i32,
    pub temperature: f64,
    pub abort_flag: Arc<AtomicBool>,
    /// Events from the async task to the poller
    pub events_rx: Arc<Mutex<tokio::sync::mpsc::UnboundedReceiver<String>>>,
    /// Channel to receive tool results from TS
    pub tool_results_tx: tokio::sync::mpsc::UnboundedSender<Vec<ToolResult>>,
}

// ─── Global Registry ───

static REGISTRY: Mutex<Option<HashMap<String, ConversationHandle>>> = Mutex::new(None);

struct ConversationHandle {
    abort_flag: Arc<AtomicBool>,
    events_rx: Arc<Mutex<tokio::sync::mpsc::UnboundedReceiver<String>>>,
    tool_results_tx: tokio::sync::mpsc::UnboundedSender<Vec<ToolResult>>,
}

fn registry_map() -> &'static Mutex<Option<HashMap<String, ConversationHandle>>> {
    let reg = &REGISTRY;
    {
        let mut guard = reg.lock().unwrap();
        if guard.is_none() {
            *guard = Some(HashMap::new());
        }
    }
    reg
}

fn generate_conv_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("conv_{}", ts)
}

// ─── Public API ───

/// Start a new AI conversation. Returns a conversation ID.
pub fn start_conversation(
    endpoint: String,
    api_key: String,
    model: String,
    messages_json: String,
    tools_json: String,
    max_turns: i32,
    temperature: f64,
) -> Result<String, String> {
    let conv_id = generate_conv_id();
    let abort_flag = Arc::new(AtomicBool::new(false));

    let messages: Vec<ChatMessage> = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Failed to parse messages: {}", e))?;

    let (events_tx, events_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let (tool_results_tx, tool_results_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<ToolResult>>();

    // Register handle
    {
        let mut guard = registry_map().lock().unwrap();
        let map = guard.as_mut().unwrap();
        map.insert(conv_id.clone(), ConversationHandle {
            abort_flag: abort_flag.clone(),
            events_rx: Arc::new(Mutex::new(events_rx)),
            tool_results_tx: tool_results_tx.clone(),
        });
    }

    // Spawn the async conversation loop
    let conv_id_clone = conv_id.clone();
    reactor_runtime().spawn(async move {
        let events = events_tx;
        let _ = run_conversation_loop(
            endpoint, api_key, model, messages, tools_json,
            max_turns, temperature, abort_flag, events,
            tool_results_rx,
        ).await;

        // Cleanup: remove from registry
        if let Ok(mut guard) = REGISTRY.lock() {
            if let Some(ref mut map) = *guard {
                map.remove(&conv_id_clone);
            }
        }
    });

    Ok(conv_id)
}

/// Poll for the next event from an ongoing conversation.
/// Returns a JSON event string, or "\"waiting\"" if no events available.
pub fn poll_conversation(conv_id: &str) -> Result<String, String> {
    let guard = registry_map().lock().unwrap();
    let map = guard.as_ref().unwrap();
    let handle = map.get(conv_id)
        .ok_or_else(|| format!("Conversation {} not found", conv_id))?;

    let mut rx = handle.events_rx.lock().unwrap();
    match rx.try_recv() {
        Ok(event) => Ok(event),
        Err(tokio::sync::mpsc::error::TryRecvError::Empty) => Ok("\"waiting\"".to_string()),
        Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
            Ok(serde_json::json!({
                "type": "done",
                "data": { "fullContent": "", "chainComplete": false }
            }).to_string())
        }
    }
}

/// Provide tool execution results back to an ongoing conversation.
pub fn provide_tool_results(conv_id: &str, results_json: &str) -> Result<(), String> {
    let guard = registry_map().lock().unwrap();
    let map = guard.as_ref().unwrap();
    let handle = map.get(conv_id)
        .ok_or_else(|| format!("Conversation {} not found", conv_id))?;

    let results: Vec<ToolResult> = serde_json::from_str(results_json)
        .map_err(|e| format!("Failed to parse tool results: {}", e))?;

    handle.tool_results_tx.send(results)
        .map_err(|e| format!("Failed to send tool results: {}", e))
}

/// Abort an ongoing conversation.
pub fn abort_conversation(conv_id: &str) -> Result<(), String> {
    let guard = registry_map().lock().unwrap();
    let map = guard.as_ref().unwrap();
    let handle = map.get(conv_id)
        .ok_or_else(|| format!("Conversation {} not found", conv_id))?;
    handle.abort_flag.store(true, Ordering::SeqCst);
    Ok(())
}

// ─── Core Conversation Loop ───

async fn run_conversation_loop(
    endpoint: String,
    api_key: String,
    model: String,
    mut messages: Vec<ChatMessage>,
    tools_json: String,
    max_turns: i32,
    temperature: f64,
    abort_flag: Arc<AtomicBool>,
    events_tx: tokio::sync::mpsc::UnboundedSender<String>,
    mut tool_results_rx: tokio::sync::mpsc::UnboundedReceiver<Vec<ToolResult>>,
) -> Result<(), String> {
    let emit = |event: ReactorEvent| {
        let _ = events_tx.send(serde_json::to_string(&event).unwrap_or_default());
    };

    let mut turn = 0;

    loop {
        if abort_flag.load(Ordering::SeqCst) {
            emit(ReactorEvent {
                event_type: "done".to_string(),
                data: serde_json::json!({ "fullContent": "", "chainComplete": false }),
            });
            return Ok(());
        }

        if turn >= max_turns {
            emit(ReactorEvent {
                event_type: "error".to_string(),
                data: serde_json::json!(format!("Max turns ({}) reached", max_turns)),
            });
            emit(ReactorEvent {
                event_type: "done".to_string(),
                data: serde_json::json!({ "fullContent": "", "chainComplete": false }),
            });
            return Ok(());
        }

        let is_first_turn = turn == 0;
        let (full_content, tool_calls) = if is_first_turn {
            stream_turn(
                &endpoint, &api_key, &model, &messages, &tools_json,
                temperature, &abort_flag, &events_tx,
            ).await?
        } else {
            let (content, tcs) = follow_up_turn(
                &endpoint, &api_key, &model, &messages, &tools_json, &abort_flag,
            ).await?;
            // Send follow-up content as a single token burst
            if !content.is_empty() {
                emit(ReactorEvent {
                    event_type: "token".to_string(),
                    data: serde_json::json!(content),
                });
            }
            (content, tcs)
        };

        if tool_calls.is_empty() {
            emit(ReactorEvent {
                event_type: "done".to_string(),
                data: serde_json::json!({ "fullContent": full_content, "chainComplete": true }),
            });
            return Ok(());
        }

        // Emit tool calls
        emit(ReactorEvent {
            event_type: "tool_calls".to_string(),
            data: serde_json::to_value(&tool_calls).unwrap_or_default(),
        });

        // Append assistant message to history
        messages.push(build_assistant_message(&full_content, &tool_calls));

        // Wait for tool results
        let results = match tokio::time::timeout(
            std::time::Duration::from_secs(30),
            tool_results_rx.recv(),
        ).await {
            Ok(Some(r)) => r,
            Ok(None) => {
                emit(ReactorEvent {
                    event_type: "error".to_string(),
                    data: serde_json::json!("Tool result channel closed"),
                });
                emit(ReactorEvent {
                    event_type: "done".to_string(),
                    data: serde_json::json!({ "fullContent": full_content, "chainComplete": false }),
                });
                return Ok(());
            }
            Err(_) => {
                emit(ReactorEvent {
                    event_type: "error".to_string(),
                    data: serde_json::json!("Timeout waiting for tool results"),
                });
                emit(ReactorEvent {
                    event_type: "done".to_string(),
                    data: serde_json::json!({ "fullContent": full_content, "chainComplete": false }),
                });
                return Ok(());
            }
        };

        // Append tool result messages
        for r in &results {
            messages.push(ChatMessage {
                role: "tool".to_string(),
                content: serde_json::to_string(&r.content).unwrap_or_else(|_| r.content.clone()),
                tool_call_id: Some(r.tool_call_id.clone()),
                tool_calls: None,
            });
        }

        turn += 1;
    }
}

// ─── Streaming First Turn ───

async fn stream_turn(
    endpoint: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    tools_json: &str,
    temperature: f64,
    abort_flag: &Arc<AtomicBool>,
    events_tx: &tokio::sync::mpsc::UnboundedSender<String>,
) -> Result<(String, Vec<ToolCallInfo>), String> {
    let tools: Option<Vec<serde_json::Value>> = if tools_json.is_empty() || tools_json == "[]" {
        None
    } else {
        Some(serde_json::from_str(tools_json).map_err(|e| format!("Invalid tools JSON: {}", e))?)
    };

    let client = reqwest::Client::new();
    let request = ChatCompletionRequest {
        model: model.to_string(),
        messages: messages.to_vec(),
        tools,
        temperature: Some(temperature as f32),
        max_tokens: Some(4096),
        stream: Some(true),
    };

    let resp = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    let emit = |event: ReactorEvent| {
        let _ = events_tx.send(serde_json::to_string(&event).unwrap_or_default());
    };

    let mut stream = resp.bytes_stream();
    let mut full_content = String::new();
    let mut tool_call_buf: Vec<ToolCallAccum> = Vec::new();

    while let Some(chunk) = stream.next().await {
        if abort_flag.load(Ordering::SeqCst) {
            return Err("Aborted".to_string());
        }

        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    break;
                }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    // Content delta
                    if let Some(delta_content) = event["choices"][0]["delta"]["content"].as_str() {
                        full_content.push_str(delta_content);
                        emit(ReactorEvent {
                            event_type: "token".to_string(),
                            data: serde_json::json!(delta_content),
                        });
                    }

                    // Tool call deltas
                    if let Some(tcs) = event["choices"][0]["delta"]["tool_calls"].as_array() {
                        for tc in tcs {
                            if let Some(id) = tc["id"].as_str() {
                                tool_call_buf.push(ToolCallAccum {
                                    id: id.to_string(),
                                    name: tc["function"]["name"].as_str().unwrap_or("").to_string(),
                                    arguments: tc["function"]["arguments"].as_str().unwrap_or("").to_string(),
                                });
                            } else if let Some(last) = tool_call_buf.last_mut() {
                                if let Some(arg) = tc["function"]["arguments"].as_str() {
                                    last.arguments.push_str(arg);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let tool_calls: Vec<ToolCallInfo> = tool_call_buf
        .into_iter()
        .map(|tc| ToolCallInfo {
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
        })
        .collect();

    Ok((full_content, tool_calls))
}

// ─── Non-Streaming Follow-Up Turn ───

async fn follow_up_turn(
    endpoint: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    tools_json: &str,
    abort_flag: &Arc<AtomicBool>,
) -> Result<(String, Vec<ToolCallInfo>), String> {
    if abort_flag.load(Ordering::SeqCst) {
        return Err("Aborted".to_string());
    }

    let tools: Option<Vec<serde_json::Value>> = if tools_json.is_empty() || tools_json == "[]" {
        None
    } else {
        Some(serde_json::from_str(tools_json).map_err(|e| format!("Invalid tools JSON: {}", e))?)
    };

    let request = ChatCompletionRequest {
        model: model.to_string(),
        messages: messages.to_vec(),
        tools,
        temperature: Some(0.7),
        max_tokens: Some(4096),
        stream: Some(false),
    };

    let response = chat_completion(endpoint, api_key, &request).await?;

    let first_choice = response.choices.into_iter().next()
        .ok_or("No choices in response")?;

    let content = first_choice.message.content.unwrap_or_default();

    let tool_calls = first_choice.message.tool_calls
        .unwrap_or_default()
        .into_iter()
        .map(|tc| ToolCallInfo {
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
        })
        .collect();

    Ok((content, tool_calls))
}

// ─── Helpers ───

#[derive(Debug, serde::Serialize)]
struct ToolCallAccum {
    id: String,
    name: String,
    arguments: String,
}

fn build_assistant_message(content: &str, tool_calls: &[ToolCallInfo]) -> ChatMessage {
    let tcs: Vec<serde_json::Value> = tool_calls
        .iter()
        .map(|tc| serde_json::json!({
            "id": tc.id,
            "type": "function",
            "function": {
                "name": tc.name,
                "arguments": tc.arguments,
            }
        }))
        .collect();

    ChatMessage {
        role: "assistant".to_string(),
        content: content.to_string(),
        tool_call_id: None,
        tool_calls: if tcs.is_empty() { None } else { Some(serde_json::Value::Array(tcs)) },
    }
}
