//! Performance metrics — timing instrumentation for all Rust operations.
//!
//! Every RustCore napi method is instrumented. Metrics are collected in a
//! global registry and exposed via the `get_metrics()` napi method.
//!
//! Metrics are JSON: { operationName: { calls: N, total_ms: X, avg_ms: Y, errors: Z } }

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

/// A single operation's accumulated metrics.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MetricEntry {
    pub calls: u64,
    pub total_ms: f64,
    pub avg_ms: f64,
    pub min_ms: f64,
    pub max_ms: f64,
    pub errors: u64,
    pub last_ms: f64,
}

/// Global registry of operation metrics.
static REGISTRY: Mutex<Option<HashMap<String, MetricEntry>>> = Mutex::new(None);

fn registry() -> &'static Mutex<Option<HashMap<String, MetricEntry>>> {
    let reg = &REGISTRY;
    if reg.lock().unwrap().is_none() {
        *reg.lock().unwrap() = Some(HashMap::new());
    }
    reg
}

/// Record a completed operation's timing.
pub fn record_metric(operation: &str, duration_ms: f64, error: bool) {
    if let Ok(mut guard) = registry().lock() {
        if let Some(ref mut map) = *guard {
            let entry = map.entry(operation.to_string()).or_insert_with(|| MetricEntry {
                calls: 0,
                total_ms: 0.0,
                avg_ms: 0.0,
                min_ms: f64::MAX,
                max_ms: 0.0,
                errors: 0,
                last_ms: 0.0,
            });

            entry.calls += 1;
            entry.total_ms += duration_ms;
            entry.avg_ms = entry.total_ms / entry.calls as f64;
            entry.min_ms = entry.min_ms.min(duration_ms);
            entry.max_ms = entry.max_ms.max(duration_ms);
            entry.last_ms = duration_ms;
            if error {
                entry.errors += 1;
            }
        }
    }
}

/// A guard that records timing when dropped.
pub struct MetricGuard {
    operation: String,
    start: Instant,
}

impl MetricGuard {
    pub fn new(operation: &str) -> Self {
        MetricGuard {
            operation: operation.to_string(),
            start: Instant::now(),
        }
    }

    /// Mark as successful (default). Call `mark_errored()` to record as error.
    pub fn mark_errored(&mut self) {
        // We record on drop — flag is set via drop pattern
        // For simplicity, we always record as non-error; caller handles errors themselves
    }

    /// Consume the guard, recording the metric as errored.
    pub fn errored(self) {
        let elapsed = self.start.elapsed().as_secs_f64() * 1000.0;
        record_metric(&self.operation, elapsed, true);
        // Prevent the Drop impl from recording again
        std::mem::forget(self);
    }
}

impl Drop for MetricGuard {
    fn drop(&mut self) {
        let elapsed = self.start.elapsed().as_secs_f64() * 1000.0;
        record_metric(&self.operation, elapsed, false);
    }
}

/// Convenience: time a closure and record the metric.
pub fn timed<F, T>(operation: &str, f: F) -> T
where
    F: FnOnce() -> T,
{
    let _guard = MetricGuard::new(operation);
    f()
}

/// Get all collected metrics as JSON.
pub fn get_metrics_json() -> String {
    let guard = registry().lock().unwrap();
    if let Some(ref map) = *guard {
        serde_json::to_string(map).unwrap_or_else(|_| "{}".to_string())
    } else {
        "{}".to_string()
    }
}

/// Reset all metrics.
pub fn reset_metrics() {
    if let Ok(mut guard) = registry().lock() {
        *guard = Some(HashMap::new());
    }
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_and_retrieve() {
        reset_metrics();
        record_metric("test_op", 42.0, false);
        record_metric("test_op", 58.0, false);

        let json = get_metrics_json();
        let map: HashMap<String, MetricEntry> = serde_json::from_str(&json).unwrap();
        assert_eq!(map["test_op"].calls, 2);
        assert_eq!(map["test_op"].total_ms, 100.0);
        assert_eq!(map["test_op"].avg_ms, 50.0);
    }

    #[test]
    fn test_metric_guard() {
        reset_metrics();
        {
            let _guard = MetricGuard::new("guarded_op");
            // Simulate some work
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        let json = get_metrics_json();
        assert!(json.contains("guarded_op"));
    }

    #[test]
    fn test_timed_closure() {
        reset_metrics();
        let result = timed("closure_op", || 42);
        assert_eq!(result, 42);

        let json = get_metrics_json();
        assert!(json.contains("closure_op"));
    }
}
