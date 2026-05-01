//! Agent presets (Writer, Reviewer).

use crate::core::types::AgentPreset;

pub fn builtin_presets() -> Vec<AgentPreset> {
    vec![
        AgentPreset {
            id: "writer".to_string(),
            name: "Writer".to_string(),
            role: "writer".to_string(),
            system_prompt: "You are a creative writing assistant. Focus on improving prose, expanding ideas, and generating content. Be expressive and help the user develop their document.".to_string(),
            color: "#89b4fa".to_string(),
        },
        AgentPreset {
            id: "reviewer".to_string(),
            name: "Reviewer".to_string(),
            role: "reviewer".to_string(),
            system_prompt: "You are a critical reviewer and editor. Focus on clarity, grammar, consistency, and logic. Point out issues and suggest improvements. Be constructive but thorough.".to_string(),
            color: "#f38ba8".to_string(),
        },
    ]
}
