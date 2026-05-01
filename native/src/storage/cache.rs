//! LRU in-memory cache for parsed ProseMirror documents.
//! Reduces repeated SQLite reads and JSON parsing for the active document.

use crate::storage::prose_mirror::PMDoc;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::Mutex;

/// Thread-safe LRU cache for PMDoc instances.
pub struct DocCache {
    cache: Mutex<LruCache<String, CachedDoc>>,
}

struct CachedDoc {
    doc: PMDoc,
    size_bytes: usize,
}

impl DocCache {
    /// Create a new cache with the given capacity (max entries).
    pub fn new(capacity: usize) -> Self {
        let cap = NonZeroUsize::new(capacity.max(1)).unwrap();
        DocCache {
            cache: Mutex::new(LruCache::new(cap)),
        }
    }

    /// Get a document from the cache by ID.
    pub fn get(&self, id: &str) -> Option<PMDoc> {
        let mut cache = self.cache.lock().ok()?;
        cache.get(id).map(|c| c.doc.clone())
    }

    /// Put a document into the cache.
    pub fn put(&self, id: String, doc: PMDoc, json_size: usize) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.put(
                id,
                CachedDoc {
                    doc,
                    size_bytes: json_size,
                },
            );
        }
    }

    /// Remove a document from the cache.
    pub fn remove(&self, id: &str) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.pop(id);
        }
    }

    /// Clear the entire cache.
    pub fn clear(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
    }
}
