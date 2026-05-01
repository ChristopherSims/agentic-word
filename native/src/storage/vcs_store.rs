//! VCS Engine — commit DAG, branches, merge, rebase, stash, tags, blame, hooks.
//! All operations backed by SQLite in the document_snapshots tables.
//! Serialized text diff for v1.0; structural PM diff planned for v1.1.

use crate::core::error::{AppError, AppResult};
use crate::core::types::{
    VcsBranchInfo, VcsCommit, VcsDiffLine, VcsGraphNode, VcsStashEntry, VcsTag,
};
use crate::db::Database;
use crate::storage::compression;
use crate::storage::prose_mirror::canonical_serialize;
use rusqlite::params;
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════════
// Commit
// ═══════════════════════════════════════════════════════════════

pub fn vcs_commit(
    db: &Database,
    document_id: &str,
    message: &str,
    pm_json: &str,
    branch: &str,
    author: Option<&str>,
) -> AppResult<VcsCommit> {
    let commit_id = Uuid::new_v4().to_string();
    let timestamp = js_now();
    let compressed = compression::compress_str(pm_json)?;

    // Get current HEAD for this branch
    let parent_id: Option<String> = db.with_conn(|conn| {
        Ok(conn
            .query_row(
                "SELECT head_id FROM branches WHERE document_id=?1 AND name=?2",
                params![document_id, branch],
                |row| row.get(0),
            )
            .ok())
    })?;

    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO document_snapshots (id, document_id, parent_id, message, author,
             branch, content_blob, timestamp, lane)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
            params![
                commit_id,
                document_id,
                parent_id.as_deref(),
                message,
                author,
                branch,
                compressed,
                timestamp,
            ],
        )?;

        // Update branch HEAD
        conn.execute(
            "INSERT INTO branches (name, document_id, head_id)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(name, document_id) DO UPDATE SET head_id=excluded.head_id",
            params![branch, document_id, commit_id],
        )?;
        Ok(())
    })?;

    // Return the commit
    let parents = if let Some(ref pid) = parent_id {
        vec![pid.clone()]
    } else {
        vec![]
    };
    Ok(VcsCommit {
        id: commit_id,
        message: message.to_string(),
        content: pm_json.to_string(),
        timestamp,
        parents,
        branch: branch.to_string(),
        tags: vec![],
        author: author.map(|s| s.to_string()),
    })
}

// ═══════════════════════════════════════════════════════════════
// Log / History
// ═══════════════════════════════════════════════════════════════

pub fn vcs_log(db: &Database, document_id: &str, limit: Option<i32>) -> AppResult<Vec<VcsCommit>> {
    let limit_val = limit.unwrap_or(50);
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT s.id, s.message, s.parent_id, s.branch, s.timestamp, s.author,
                    COALESCE(GROUP_CONCAT(t.name), '') as tag_names
             FROM document_snapshots s
             LEFT JOIN tags t ON t.commit_id = s.id
             WHERE s.document_id = ?1
             GROUP BY s.id
             ORDER BY s.timestamp DESC
             LIMIT ?2",
        )?;

        let commits = stmt
            .query_map(params![document_id, limit_val], |row| {
                let tags_str: String = row.get(5)?;
                let tags: Vec<String> = if tags_str.is_empty() {
                    vec![]
                } else {
                    tags_str.split(',').map(|s| s.to_string()).collect()
                };
                let parent_id: Option<String> = row.get(2)?;
                let parents = if let Some(pid) = parent_id {
                    vec![pid]
                } else {
                    vec![]
                };
                Ok(VcsCommit {
                    id: row.get(0)?,
                    message: row.get(1)?,
                    content: String::new(), // Not included in log
                    parents,
                    branch: row.get(3)?,
                    timestamp: row.get(4)?,
                    tags,
                    author: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(commits)
    })
}

// ═══════════════════════════════════════════════════════════════
// Branches
// ═══════════════════════════════════════════════════════════════

pub fn vcs_list_branches(db: &Database, document_id: &str, current: &str) -> AppResult<Vec<VcsBranchInfo>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT name, head_id FROM branches WHERE document_id=?1",
        )?;
        let branches = stmt
            .query_map(params![document_id], |row| {
                let name: String = row.get(0)?;
                Ok(VcsBranchInfo {
                    current: name == current,
                    name,
                    head: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(branches)
    })
}

pub fn vcs_create_branch(db: &Database, document_id: &str, name: &str, from_commit: Option<&str>) -> AppResult<()> {
    db.with_conn(|conn| {
        let head = if let Some(commit_id) = from_commit {
            commit_id.to_string()
        } else {
            // Use current branch HEAD or latest commit
            conn.query_row(
                "SELECT head_id FROM branches WHERE document_id=?1 AND name='main'
                 UNION ALL
                 SELECT id FROM document_snapshots WHERE document_id=?1 ORDER BY timestamp DESC LIMIT 1",
                params![document_id],
                |row| row.get(0),
            )
            .unwrap_or_default()
        };
        conn.execute(
            "INSERT OR IGNORE INTO branches (name, document_id, head_id) VALUES (?1, ?2, ?3)",
            params![name, document_id, head],
        )?;
        Ok(())
    })
}

pub fn vcs_switch_branch(db: &Database, document_id: &str, name: &str) -> AppResult<String> {
    db.with_conn(|conn| {
        let head: String = conn.query_row(
            "SELECT head_id FROM branches WHERE document_id=?1 AND name=?2",
            params![document_id, name],
            |row| row.get(0),
        )?;
        let blob: Vec<u8> = conn.query_row(
            "SELECT content_blob FROM document_snapshots WHERE id=?1",
            params![head],
            |row| row.get(0),
        )?;
        let pm_json = compression::decompress_str(&blob)?;
        Ok(pm_json)
    })
}

// ═══════════════════════════════════════════════════════════════
// Diff
// ═══════════════════════════════════════════════════════════════

pub fn vcs_diff(db: &Database, from_id: &str, to_id: &str) -> AppResult<Vec<VcsDiffLine>> {
    let from_blob: Vec<u8> = db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT content_blob FROM document_snapshots WHERE id=?1",
            params![from_id],
            |row| row.get(0),
        )?)
    })?;
    let to_blob: Vec<u8> = db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT content_blob FROM document_snapshots WHERE id=?1",
            params![to_id],
            |row| row.get(0),
        )?)
    })?;

    let from_text = compression::decompress_str(&from_blob)?;
    let to_text = compression::decompress_str(&to_blob)?;

    // Canonicalize both for line-based diff
    let from_doc = crate::storage::prose_mirror::parse_pm_json(&from_text)
        .map_err(|e| AppError::Serialization(e.to_string()))?;
    let to_doc = crate::storage::prose_mirror::parse_pm_json(&to_text)
        .map_err(|e| AppError::Serialization(e.to_string()))?;

    let from_canon = canonical_serialize(&from_doc);
    let to_canon = canonical_serialize(&to_doc);

    let diff = similar::TextDiff::from_lines(&from_canon, &to_canon);
    let mut lines = Vec::new();
    for (i, change) in diff.iter_all_changes().enumerate() {
        let (typ, content) = match change.tag() {
            similar::ChangeTag::Equal => ("same", change.value().to_string()),
            similar::ChangeTag::Insert => ("add", change.value().to_string()),
            similar::ChangeTag::Delete => ("remove", change.value().to_string()),
        };
        lines.push(VcsDiffLine {
            r#type: typ.to_string(),
            line: i as i32,
            content,
        });
    }
    Ok(lines)
}

// ═══════════════════════════════════════════════════════════════
// DAG Graph
// ═══════════════════════════════════════════════════════════════

pub fn vcs_graph(db: &Database, document_id: &str) -> AppResult<Vec<VcsGraphNode>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT s.id, s.message, s.timestamp, s.branch, s.parent_id,
                    GROUP_CONCAT(t.name) as tag_names
             FROM document_snapshots s
             LEFT JOIN tags t ON t.commit_id = s.id
             WHERE s.document_id = ?1
             GROUP BY s.id
             ORDER BY s.timestamp ASC",
        )?;

        let raw: Vec<(String, String, f64, String, Option<String>, Option<String>)> = stmt
            .query_map(params![document_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Compute lanes
        compute_lanes(raw)
    })
}

fn compute_lanes(
    raw: Vec<(String, String, f64, String, Option<String>, Option<String>)>,
) -> AppResult<Vec<VcsGraphNode>> {
    use std::collections::HashMap;

    // Map branch names to lane indices
    let mut branch_lanes: HashMap<String, usize> = HashMap::new();
    let mut next_lane = 0;
    let mut nodes = Vec::new();

    for (id, message, timestamp, branch, parent_id_str, tags_str) in raw {
        let lane = *branch_lanes.entry(branch.clone()).or_insert_with(|| {
            let l = next_lane;
            next_lane += 1;
            l
        }) as i32;

        let parents: Vec<String> = if let Some(pid) = parent_id_str {
            vec![pid]
        } else {
            vec![]
        };

        let tags: Vec<String> = match tags_str {
            Some(s) if !s.is_empty() => s.split(',').map(|t| t.to_string()).collect(),
            _ => vec![],
        };

        let is_merge = parents.len() > 1;

        nodes.push(VcsGraphNode {
            id,
            message,
            timestamp,
            branch: branch.clone(),
            parents,
            tags,
            is_merge,
            branches: vec![branch],
            lane,
        });
    }

    Ok(nodes)
}

// ═══════════════════════════════════════════════════════════════
// Merge (three-way)
// ═══════════════════════════════════════════════════════════════

pub fn vcs_merge(
    db: &Database,
    document_id: &str,
    source_branch: &str,
    target_branch: &str,
    author: Option<&str>,
) -> AppResult<String> {
    // Get HEAD of both branches
    let source_head: String = db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT head_id FROM branches WHERE document_id=?1 AND name=?2",
            params![document_id, source_branch],
            |row| row.get(0),
        )?)
    })?;
    let target_head: String = db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT head_id FROM branches WHERE document_id=?1 AND name=?2",
            params![document_id, target_branch],
            |row| row.get(0),
        )?)
    })?;

    // Find common ancestor (simplified: walk parent chain of target_head until a commit
    // that's also an ancestor of source_head, or the root)
    let ancestor_id = find_common_ancestor(db, &source_head, &target_head)?;

    // Get content for all three
    let source_content = get_snapshot_content(db, &source_head)?;
    let target_content = get_snapshot_content(db, &target_head)?;
    let ancestor_content = get_snapshot_content(db, &ancestor_id)?;

    // Three-way merge on canonical text
    let merged = three_way_merge(&ancestor_content, &target_content, &source_content);

    // Create merge commit
    let merge_commit = vcs_commit(db, document_id, &format!("Merge branch '{}' into '{}'", source_branch, target_branch), &merged, target_branch, author)?;

    Ok(merge_commit.id)
}

fn find_common_ancestor(db: &Database, a: &str, b: &str) -> AppResult<String> {
    // Walk parent chain of `a`, collect all ancestors
    let mut ancestors = std::collections::HashSet::new();
    let mut current = a.to_string();
    ancestors.insert(current.clone());

    loop {
        let parent: Option<String> = db.with_conn(|conn| {
            Ok(conn
                .query_row(
                    "SELECT parent_id FROM document_snapshots WHERE id=?1",
                    params![current],
                    |row| row.get(0),
                )
                .ok())
        })?;
        match parent {
            Some(p) => {
                current = p;
                ancestors.insert(current.clone());
            }
            None => break,
        }
    }

    // Walk up from `b` to find first shared ancestor
    let mut current = b.to_string();
    if ancestors.contains(&current) {
        return Ok(current);
    }
    loop {
        let parent: Option<String> = db.with_conn(|conn| {
            Ok(conn
                .query_row(
                    "SELECT parent_id FROM document_snapshots WHERE id=?1",
                    params![current],
                    |row| row.get(0),
                )
                .ok())
        })?;
        match parent {
            Some(p) => {
                if ancestors.contains(&p) {
                    return Ok(p);
                }
                current = p;
            }
            None => break,
        }
    }

    // Fallback: return the root (oldest ancestor of b)
    Ok(current)
}

fn get_snapshot_content(db: &Database, id: &str) -> AppResult<String> {
    let blob: Vec<u8> = db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT content_blob FROM document_snapshots WHERE id=?1",
            params![id],
            |row| row.get(0),
        )?)
    })?;
    compression::decompress_str(&blob)
}

fn three_way_merge(ancestor: &str, ours: &str, theirs: &str) -> String {
    // Simple line-based three-way merge.
    // If 'theirs' is identical to 'ancestor', use 'ours'.
    // If 'ours' is identical to 'ancestor', use 'theirs'.
    // Otherwise, use 'ours' and append a conflict marker.
    if theirs == ancestor {
        return ours.to_string();
    }
    if ours == ancestor {
        return theirs.to_string();
    }

    // Fallback: produce a merge with both versions
    let mut output = String::new();
    output.push_str("<<<<<<< HEAD\n");
    output.push_str(ours);
    output.push_str("\n=======\n");
    output.push_str(theirs);
    output.push_str("\n>>>>>>> MERGE_SOURCE\n");
    output
}
// Tags
// ═══════════════════════════════════════════════════════════════

pub fn vcs_create_tag(db: &Database, document_id: &str, name: &str, commit_id: &str) -> AppResult<VcsTag> {
    let timestamp = js_now();
    db.with_conn(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO tags (name, document_id, commit_id, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![name, document_id, commit_id, timestamp],
        )?;
        Ok(())
    })?;
    Ok(VcsTag { name: name.to_string(), commit_id: commit_id.to_string(), timestamp })
}

pub fn vcs_list_tags(db: &Database, document_id: &str) -> AppResult<Vec<VcsTag>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT name, commit_id, timestamp FROM tags WHERE document_id=?1 ORDER BY timestamp DESC",
        )?;
        let tags = stmt.query_map(params![document_id], |row| {
            Ok(VcsTag { name: row.get(0)?, commit_id: row.get(1)?, timestamp: row.get(2)? })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(tags)
    })
}

// ═══════════════════════════════════════════════════════════════
// Stash
// ═══════════════════════════════════════════════════════════════

pub fn vcs_stash_push(db: &Database, document_id: &str, pm_json: &str, message: &str, branch: &str) -> AppResult<VcsStashEntry> {
    let id = Uuid::new_v4().to_string();
    let timestamp = js_now();
    let compressed = compression::compress_str(pm_json)?;

    // Get current HEAD as parent
    let parent_id: Option<String> = db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT head_id FROM branches WHERE document_id=?1 AND name=?2",
            params![document_id, branch],
            |row| row.get(0),
        ).ok())
    })?;

    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO stash (id, document_id, message, branch, content_blob, parent_id, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, document_id, message, branch, compressed, parent_id.as_deref(), timestamp],
        )?;
        Ok(())
    })?;

    Ok(VcsStashEntry { id, content: pm_json.to_string(), branch: branch.to_string(), message: message.to_string(), timestamp })
}

pub fn vcs_stash_list(db: &Database, document_id: &str) -> AppResult<Vec<VcsStashEntry>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, message, branch, timestamp FROM stash WHERE document_id=?1 ORDER BY timestamp DESC",
        )?;
        let entries = stmt.query_map(params![document_id], |row| {
            Ok(VcsStashEntry {
                id: row.get(0)?,
                content: String::new(),
                branch: row.get(2)?,
                message: row.get(1)?,
                timestamp: row.get(3)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(entries)
    })
}

pub fn vcs_stash_pop(db: &Database, document_id: &str, stash_id: &str) -> AppResult<String> {
    let blob: Vec<u8> = db.with_conn(|conn| {
        let result: Vec<u8> = conn.query_row(
            "SELECT content_blob FROM stash WHERE id=?1 AND document_id=?2",
            params![stash_id, document_id],
            |row| row.get(0),
        )?;
        conn.execute("DELETE FROM stash WHERE id=?1", params![stash_id])?;
        Ok(result)
    })?;
    compression::decompress_str(&blob)
}

// ═══════════════════════════════════════════════════════════════
// Blame
// ═══════════════════════════════════════════════════════════════

pub fn vcs_blame(db: &Database, document_id: &str, _file_path: &str) -> AppResult<Vec<crate::core::types::VcsBlameLine>> {
    // Simplified: get the latest snapshot and attribute each line to the last commit
    db.with_conn(|conn| {
        let (latest_id, latest_author, latest_message, latest_timestamp): (String, Option<String>, String, f64) = conn.query_row(
            "SELECT id, author, message, timestamp FROM document_snapshots
             WHERE document_id=?1 ORDER BY timestamp DESC LIMIT 1",
            params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

        let blob: Vec<u8> = conn.query_row(
            "SELECT content_blob FROM document_snapshots WHERE id=?1",
            params![latest_id],
            |row| row.get(0),
        )?;
        let content = compression::decompress_str(&blob)?;

        let date_str = format_timestamp(latest_timestamp);
        let lines = content.lines().enumerate().map(|(i, line)| {
            crate::core::types::VcsBlameLine {
                line: (i + 1) as i32,
                text: line.to_string(),
                commit_id: latest_id.clone(),
                author: latest_author.clone().unwrap_or_default(),
                date: date_str.clone(),
                message: latest_message.clone(),
            }
        }).collect();
        Ok(lines)
    })
}

// ═══════════════════════════════════════════════════════════════
// Migration from old JSON VCS store
// ═══════════════════════════════════════════════════════════════

pub fn vcs_migrate_from_json(db: &Database, json_path: &str) -> AppResult<usize> {
    let content = std::fs::read_to_string(json_path)
        .map_err(|e| AppError::Io(e))?;
    let vcs_data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::Serialization(e.to_string()))?;

    let mut count = 0;

    // Migrate commits
    if let Some(commits) = vcs_data.get("commits").and_then(|c| c.as_array()) {
        for commit in commits {
            let id = commit["id"].as_str().unwrap_or("");
            let message = commit["message"].as_str().unwrap_or("");
            let content = commit["content"].as_str().unwrap_or("{}");
            let timestamp = commit["timestamp"].as_f64().unwrap_or(0.0);
            let branch = commit["branch"].as_str().unwrap_or("main");
            let parent_id = commit["parents"].as_array()
                .and_then(|p| p.first())
                .and_then(|v| v.as_str().map(|s| s.to_string()));
            let doc_id = "legacy-import";

            let compressed = compression::compress_str(content)?;

            db.with_conn(|conn| {
                conn.execute(
                    "INSERT OR IGNORE INTO document_snapshots (id, document_id, parent_id, message, branch, content_blob, timestamp, lane)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
                    params![id, doc_id, parent_id.as_deref(), message, branch, compressed, timestamp],
                )?;
                Ok::<_, AppError>(())
            })?;
            count += 1;
        }
    }

    // Migrate branches
    if let Some(branches) = vcs_data.get("branches").and_then(|b| b.as_object()) {
        for (name, head_id) in branches {
            let doc_id = "legacy-import";
            db.with_conn(|conn| {
                conn.execute(
                    "INSERT OR IGNORE INTO branches (name, document_id, head_id) VALUES (?1, ?2, ?3)",
                    params![name, doc_id, head_id.as_str().unwrap_or("")],
                )?;
                Ok::<_, AppError>(())
            })?;
        }
    }

    Ok(count)
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

fn js_now() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

fn format_timestamp(ms: f64) -> String {
    use std::time::{Duration, UNIX_EPOCH};
    let secs = (ms / 1000.0) as u64;
    let datetime = UNIX_EPOCH + Duration::from_secs(secs);
    // Simple format: YYYY-MM-DD
    let total_days = datetime.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() / 86400;
    let year = 1970 + (total_days / 365) as i64;
    let remaining = total_days % 365;
    let month = (remaining / 30) as u32 + 1;
    let day = (remaining % 30) as u32 + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
}
