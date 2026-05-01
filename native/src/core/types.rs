//! Domain types matching src/shared/types.ts with napi derives for IPC-bound types.

use napi_derive::napi;
use serde::{Deserialize, Serialize};

// ─── Core Document Types ───

/// Document metadata stored in SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub file_path: Option<String>,
    pub content_json: String,       // ProseMirror JSON as string
    pub prosemirror_version: String,
    pub word_count: i32,
    pub char_count: i32,
    pub created_at: f64,
    pub updated_at: f64,
    pub metadata_json: Option<String>,  // AnalysisResult as JSON
}

// ─── VCS Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsCommit {
    pub id: String,
    pub message: String,
    pub content: String,
    pub timestamp: f64,
    pub parents: Vec<String>,
    pub branch: String,
    pub tags: Vec<String>,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsBranchInfo {
    pub name: String,
    pub head: String,
    pub current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsTag {
    pub name: String,
    pub commit_id: String,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsMergeConflict {
    pub path: String,
    pub ours: String,
    pub theirs: String,
    pub base: String,
    pub resolved: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsGraphNode {
    pub id: String,
    pub message: String,
    pub timestamp: f64,
    pub branch: String,
    pub parents: Vec<String>,
    pub tags: Vec<String>,
    pub is_merge: bool,
    pub branches: Vec<String>,
    pub lane: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsDiffLine {
    pub r#type: String,  // "add" | "remove" | "same"
    pub line: i32,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsStashEntry {
    pub id: String,
    pub content: String,
    pub branch: String,
    pub message: String,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct VcsBlameLine {
    pub line: i32,
    pub text: String,
    pub commit_id: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

// ─── Agent Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct ChatMessage {
    pub role: String,       // "user" | "assistant" | "system" | "tool"
    pub content: String,
    pub tool_call_id: Option<String>,
    pub tool_calls: Option<String>,  // JSON string
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct AgentConfig {
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct AgentSession {
    pub id: String,
    pub name: String,
    pub profile_id: Option<String>,
    pub messages_json: String,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct AgentPreset {
    pub id: String,
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct AgentTool {
    pub name: String,
    pub description: String,
    pub parameters_json: String,  // JSON Schema string
}

// ─── Analysis Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct ReadabilityScores {
    pub flesch_kincaid_grade: f64,
    pub flesch_reading_ease: f64,
    pub gunning_fog: f64,
    pub smog_index: f64,
    pub coleman_liau: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct TextStats {
    pub word_count: i32,
    pub char_count: i32,
    pub char_no_spaces_count: i32,
    pub sentence_count: i32,
    pub paragraph_count: i32,
    pub avg_sentence_length: f64,
    pub avg_word_length: f64,
    pub reading_time_minutes_200wpm: f64,
    pub reading_time_minutes_250wpm: f64,
    pub reading_time_minutes_300wpm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct ToneAnalysis {
    pub formality_score: f64,
    pub sentiment_score: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct KeywordEntry {
    pub word: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct AnalysisResult {
    pub readability: Option<ReadabilityScores>,
    pub stats: Option<TextStats>,
    pub tone: Option<ToneAnalysis>,
    pub keywords: Vec<KeywordEntry>,
}

// ─── Search & Sync Types (stubs) ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct SearchResult {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct CollabRoom {
    pub code: String,
    pub user_count: i32,
    pub document_id: Option<String>,
}
