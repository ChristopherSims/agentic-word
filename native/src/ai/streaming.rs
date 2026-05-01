//! Streaming bridge — wraps AI client streaming with napi callbacks.

use crate::ai::client::{stream_chat_completion, ChatCompletionRequest, ChatMessage};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use std::sync::{Arc, Mutex};

pub struct StreamState {
    pub abort: Arc<Mutex<bool>>,
}

impl StreamState {
    pub fn new() -> Self { StreamState { abort: Arc::new(Mutex::new(false)) } }
    pub fn abort(&self) { *self.abort.lock().unwrap() = true; }
}

pub fn run_streaming(
    endpoint: String,
    api_key: String,
    messages_json: String,
    model: String,
    temperature: f32,
    max_tokens: i32,
    callback: ThreadsafeFunction<String>,
    state: &StreamState,
) -> Result<String, String> {
    let messages: Vec<ChatMessage> = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Invalid messages JSON: {}", e))?;

    let abort = state.abort.clone();
    let cb = Arc::new(Mutex::new(callback));

    let future = async move {
        let request = ChatCompletionRequest {
            model,
            messages,
            tools: None,
            temperature: Some(temperature),
            max_tokens: Some(max_tokens),
            stream: Some(true),
        };
        stream_chat_completion(
            &endpoint,
            &api_key,
            &request,
            |token| {
                if *abort.lock().unwrap() { return; }
                if let Ok(cb_ref) = cb.lock() {
                    let _ = cb_ref.call(Ok(token), ThreadsafeFunctionCallMode::Blocking);
                }
            },
        )
        .await
    };

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Tokio error: {}", e))?;

    rt.block_on(future)
}
