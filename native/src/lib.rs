#[macro_use]
mod core;
mod analysis;
mod db;
mod storage;

use napi_derive::napi;
use std::sync::Arc;

use crate::core::config::AppConfig;
use crate::core::types::{AnalysisResult, Document};
use crate::db::Database;
use crate::storage::cache::DocCache;
use crate::storage::pm_converter::{html_to_pm, pm_to_html, pm_to_md, md_to_pm};
use crate::storage::{pdf, image};
use crate::storage::document as doc_io;

// ─── Basic API (Phase 1 - proof of life) ───

#[napi]
pub fn ping() -> String {
    "pong from Rust".to_string()
}

// ─── RustCore — main application handle exposed to Electron ───

#[napi]
pub struct RustCore {
    db: Arc<Database>,
    cache: Arc<DocCache>,
}

#[napi]
impl RustCore {
    /// Initialize the Rust core with the user data path.
    #[napi(constructor)]
    pub fn new(user_data_path: String) -> napi::Result<Self> {
        let config = AppConfig::new(user_data_path);
        config.ensure_dirs().map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let db = Database::open(config).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let cache = DocCache::new(32);

        Ok(RustCore {
            db: Arc::new(db),
            cache: Arc::new(cache),
        })
    }

    // ─── Status ───

    #[napi]
    pub fn status(&self) -> napi::Result<String> {
        let db_ok = self.db.with_conn(|_| Ok(())).is_ok();
        Ok(format!(
            "RustCore v0.3.0 — DB: {}, path: {}",
            if db_ok { "connected" } else { "error" },
            self.db.config().db_path.display()
        ))
    }

    // ─── Document I/O ───

    /// Open a document from any supported format (DOCX, HTML, MD, TXT).
    /// Returns Document metadata with ProseMirror JSON content.
    #[napi]
    pub fn open_document(&self, file_path: String) -> napi::Result<Document> {
        doc_io::open_document(&self.db, &self.cache, &file_path)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Save a ProseMirror JSON document to a file.
    #[napi]
    pub fn save_document(&self, file_path: String, pm_json: String) -> napi::Result<()> {
        doc_io::save_document(&file_path, &pm_json, &self.db, &self.cache)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    // ─── Format Converters ───

    /// Convert HTML to ProseMirror JSON.
    #[napi]
    pub fn html_to_pm(&self, html: String) -> napi::Result<String> {
        html_to_pm(&html).map_err(|e| napi::Error::from_reason(e))
    }

    /// Convert ProseMirror JSON to HTML.
    #[napi]
    pub fn pm_to_html(&self, pm_json: String) -> napi::Result<String> {
        pm_to_html(&pm_json).map_err(|e| napi::Error::from_reason(e))
    }

    /// Convert Markdown to ProseMirror JSON.
    #[napi]
    pub fn md_to_pm(&self, md: String) -> napi::Result<String> {
        md_to_pm(&md).map_err(|e| napi::Error::from_reason(e))
    }

    /// Convert ProseMirror JSON to Markdown.
    #[napi]
    pub fn pm_to_md(&self, pm_json: String) -> napi::Result<String> {
        pm_to_md(&pm_json).map_err(|e| napi::Error::from_reason(e))
    }

    /// Export ProseMirror JSON to PDF at the given output path.
    #[napi]
    pub fn export_pdf(&self, pm_json: String, output_path: String, title: Option<String>) -> napi::Result<()> {
        pdf::pm_to_pdf(&pm_json, &output_path, title.as_deref())
            .map_err(|e| napi::Error::from_reason(e))
    }

    // ─── Image Processing ───

    /// Process an image: resize, compress to WebP, generate thumbnail.
    /// Returns JSON with { webp_path, thumbnail_path, width, height }.
    #[napi]
    pub fn process_image(&self, image_data: Vec<u8>, image_id: String, max_width: u32) -> napi::Result<String> {
        let images_dir = self.db.config().images_path.to_string_lossy().to_string();
        let result = image::process_image(&image_data, &images_dir, &image_id, max_width)
            .map_err(|e| napi::Error::from_reason(e))?;
        let json = serde_json::json!({
            "webp_path": result.webp_path,
            "thumbnail_path": result.thumbnail_path,
            "width": result.dimensions.0,
            "height": result.dimensions.1,
        });
        serde_json::to_string(&json).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    // ─── Document Analysis ───

    #[napi]
    pub fn analyze_document(&self, pm_json: String) -> AnalysisResult {
        crate::analysis::run_analysis(&pm_json)
    }

    // ─── Encryption ───

    /// Encrypt data with a password. Returns JSON { nonce, ciphertext, salt } (all base64).
    #[napi]
    pub fn encrypt_text(&self, plaintext: String, password: String) -> napi::Result<String> {
        let (nonce, ciphertext, salt) =
            crate::storage::encryption::encrypt(plaintext.as_bytes(), &password)
                .map_err(|e| napi::Error::from_reason(e))?;
        let json = serde_json::json!({
            "nonce": nonce,
            "ciphertext": ciphertext,
            "salt": salt,
        });
        serde_json::to_string(&json).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Decrypt data. Takes base64 nonce, ciphertext, salt, and password.
    #[napi]
    pub fn decrypt_text(
        &self,
        ciphertext: String,
        nonce: String,
        salt: String,
        password: String,
    ) -> napi::Result<String> {
        let bytes = crate::storage::encryption::decrypt(&ciphertext, &nonce, &salt, &password)
            .map_err(|e| napi::Error::from_reason(e))?;
        String::from_utf8(bytes).map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}