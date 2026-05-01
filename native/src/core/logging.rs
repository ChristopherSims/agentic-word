//! Logging initialization via tracing subscriber.
//! Writes structured logs to file and console (in debug mode).

use tracing_subscriber::{fmt, EnvFilter};

/// Initialize logging to a file in the user data directory.
pub fn init_logging(log_dir: &str, debug: bool) {
    let filter = if debug {
        EnvFilter::new("debug")
    } else {
        EnvFilter::new("info")
    };

    let file_appender = tracing_appender::rolling::daily(log_dir, "lexicon-core.log");

    let subscriber = fmt()
        .with_env_filter(filter)
        .with_writer(file_appender)
        .with_target(true)
        .with_thread_ids(true);

    // In debug mode, also log to stderr
    if debug {
        let subscriber = subscriber.with_writer(std::io::stderr);
        subscriber.init();
    } else {
        // We need a non-consuming version for file-only
        subscriber.try_init().ok();
    }
}

/// Simple log macro helpers
#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => { tracing::info!($($arg)*); };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => { tracing::error!($($arg)*); };
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => { tracing::debug!($($arg)*); };
}
