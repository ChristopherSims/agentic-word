//! Agent session persistence in SQLite.
use crate::core::error::{AppResult};
use crate::core::types::AgentSession;
use crate::db::Database;
use rusqlite::params;


pub fn list_sessions(db: &Database) -> AppResult<Vec<AgentSession>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, profile_id, messages_json, created_at, updated_at FROM agent_sessions ORDER BY updated_at DESC",
        )?;
        let sessions = stmt
            .query_map([], |row| {
                Ok(AgentSession {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    profile_id: row.get(2)?,
                    messages_json: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(sessions)
    })
}

pub fn save_session(db: &Database, session: &AgentSession) -> AppResult<()> {
    let now = js_now();
    db.with_conn(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO agent_sessions (id, name, profile_id, messages_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![session.id, session.name, session.profile_id, session.messages_json, now, now],
        )?;
        Ok(())
    })
}

pub fn delete_session(db: &Database, id: &str) -> AppResult<()> {
    db.with_conn(|conn| {
        conn.execute("DELETE FROM agent_sessions WHERE id=?1", params![id])?;
        Ok(())
    })
}

fn js_now() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as f64
}
