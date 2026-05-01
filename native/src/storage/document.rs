//! High-level document I/O operations.
//! Orchestrates format detection, conversion, caching, and SQLite persistence.

use crate::core::error::{AppError, AppResult};
use crate::core::types::Document;
use crate::db::Database;
use crate::storage::cache::DocCache;
use crate::storage::pm_converter::{html_to_pm, pm_to_html, pm_to_md, md_to_pm};
use crate::storage::prose_mirror::{count_chars, count_words, parse_pm_json};
use crate::storage::compression;
use std::path::Path;
use std::process::Command;
use uuid::Uuid;

/// Open a document from a file path. Detects format by extension,
/// converts to ProseMirror JSON, stores in SQLite, and caches.
pub fn open_document(
    db: &Database,
    cache: &DocCache,
    file_path: &str,
) -> AppResult<Document> {
    let path = Path::new(file_path);
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let pm_json = match ext.as_str() {
        "docx" => open_docx(file_path)?,
        "html" | "htm" => {
            let html = std::fs::read_to_string(file_path)?;
            html_to_pm(&html).map_err(|e| AppError::Parse(e))?
        }
        "md" | "markdown" => {
            let md = std::fs::read_to_string(file_path)?;
            md_to_pm(&md).map_err(|e| AppError::Parse(e))?
        }
        "txt" => {
            let text = std::fs::read_to_string(file_path)?;
            txt_to_pm(&text)
        }
        other => {
            // Try as plain text
            return Err(AppError::Parse(format!("Unsupported format: {}", other)));
        }
    };

    let doc = parse_pm_json(&pm_json)
        .map_err(|e| AppError::Serialization(e.to_string()))?;

    let word_count = count_words(&doc) as i32;
    let char_count = count_chars(&doc) as i32;
    let title = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let now = js_timestamp();

    // Save to SQLite
    let doc_id = Uuid::new_v4().to_string();
    let compressed = compression::compress_str(&pm_json)?;

    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO documents (id, title, file_path, content_json, content_compressed,
             prosemirror_version, word_count, char_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, '2.27', ?5, ?6, ?7, ?7)
             ON CONFLICT(id) DO UPDATE SET
             title=excluded.title, file_path=excluded.file_path,
             content_json=excluded.content_json, content_compressed=1,
             word_count=excluded.word_count, char_count=excluded.char_count,
             updated_at=excluded.updated_at",
            rusqlite::params![
                doc_id,
                title,
                file_path,
                compressed,
                word_count,
                char_count,
                now,
            ],
        )?;
        Ok(())
    })?;

    // Cache
    cache.put(doc_id.clone(), doc, pm_json.len());

    Ok(Document {
        id: doc_id,
        title,
        file_path: Some(file_path.to_string()),
        content_json: pm_json,
        prosemirror_version: "2.27".to_string(),
        word_count,
        char_count,
        created_at: now,
        updated_at: now,
        metadata_json: None,
    })
}

/// Save a ProseMirror JSON document to a file path.
/// Converts to the appropriate format based on extension.
pub fn save_document(
    file_path: &str,
    pm_json: &str,
    db: &Database,
    cache: &DocCache,
) -> AppResult<()> {
    let path = Path::new(file_path);
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("html")
        .to_lowercase();

    let doc = parse_pm_json(pm_json)
        .map_err(|e| AppError::Serialization(e.to_string()))?;

    let word_count = count_words(&doc) as i32;
    let char_count = count_chars(&doc) as i32;
    let title = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let now = js_timestamp();

    match ext.as_str() {
        "docx" => save_docx(file_path, pm_json)?,
        "html" | "htm" => {
            let html = pm_to_html(pm_json)
                .map_err(|e| AppError::Parse(e))?;
            std::fs::write(file_path, html)?;
        }
        "md" | "markdown" => {
            let md = pm_to_md(pm_json)
                .map_err(|e| AppError::Parse(e))?;
            std::fs::write(file_path, md)?;
        }
        "pdf" => {
            crate::storage::pdf::pm_to_pdf(pm_json, file_path, Some(&title))
                .map_err(|e| AppError::Parse(e))?;
        }
        "txt" => {
            let text = crate::storage::prose_mirror::extract_text(&doc);
            std::fs::write(file_path, text)?;
        }
        other => return Err(AppError::Parse(format!("Unsupported format: {}", other))),
    }

    // Update SQLite
    let compressed = compression::compress_str(pm_json)?;
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE documents SET content_json=?1, content_compressed=1, word_count=?2,
             char_count=?3, updated_at=?4, file_path=?5
             WHERE id = (SELECT id FROM documents WHERE file_path=?5 LIMIT 1)",
            rusqlite::params![compressed, word_count, char_count, now, file_path],
        )?;
        Ok(())
    })?;

    // Update cache
    cache.put(file_path.to_string(), doc, pm_json.len());

    Ok(())
}

// ─── DOCX Sidecar ───

fn open_docx(file_path: &str) -> AppResult<String> {
    let sidecar = find_sidecar()?;
    let output = Command::new("node")
        .arg(&sidecar)
        .arg("import")
        .arg(file_path)
        .output()
        .map_err(|e| AppError::Io(e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Parse(format!("DOCX import failed: {}", stderr)));
    }

    let html = String::from_utf8_lossy(&output.stdout).to_string();
    html_to_pm(&html).map_err(|e| AppError::Parse(e))
}

fn save_docx(file_path: &str, pm_json: &str) -> AppResult<()> {
    let html = pm_to_html(pm_json)
        .map_err(|e| AppError::Parse(e))?;

    let sidecar = find_sidecar()?;
    let output = Command::new("node")
        .arg(&sidecar)
        .arg("export")
        .arg(file_path)
        .arg(&html)
        .output()
        .map_err(|e| AppError::Io(e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Parse(format!("DOCX export failed: {}", stderr)));
    }

    Ok(())
}

fn find_sidecar() -> AppResult<String> {
    // Look for sidecar relative to the app: resources/sidecar/index.js in dist,
    // or sidecar/index.js in development
    let candidates = [
        "sidecar/index.js",
        "../sidecar/index.js",
        "resources/sidecar/index.js",
        "../../sidecar/index.js",
    ];

    for candidate in &candidates {
        if Path::new(candidate).exists() {
            return Ok(candidate.to_string());
        }
    }

    // Fallback: assume sidecar is in the project root
    Ok(Path::new(file!())
        .parent()          // storage/
        .and_then(|p| p.parent())  // src/
        .and_then(|p| p.parent())  // native/
        .and_then(|p| p.parent())  // project root
        .map(|p| p.join("sidecar/index.js"))
        .unwrap_or_else(|| Path::new("sidecar/index.js").to_path_buf())
        .to_string_lossy()
        .to_string())
}

fn txt_to_pm(text: &str) -> String {
    use crate::storage::prose_mirror::PMNode;
    let mut nodes = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            nodes.push(PMNode::paragraph(vec![]));
        } else {
            nodes.push(PMNode::paragraph(vec![
                PMNode::text(trimmed, None),
            ]));
        }
    }
    let doc = PMNode::doc(nodes);
    serde_json::to_string(&doc).unwrap_or_else(|_| "{}".to_string())
}

/// Get current time as JavaScript-compatible timestamp (ms since epoch).
fn js_timestamp() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}
