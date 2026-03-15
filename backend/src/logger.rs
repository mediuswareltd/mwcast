use std::fs::create_dir_all;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use tracing_appender::rolling;
use tracing_appender::non_blocking::WorkerGuard;

/// Initialize logger and return guard to keep alive
pub fn init() -> WorkerGuard {
    create_dir_all("logs").expect("Failed to create logs directory");

    let file_appender = rolling::daily("logs", "mwcast.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // Set default log level to info if RUST_LOG is not set
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let console_layer = fmt::layer()
        .pretty()
        .with_target(true)
        .with_level(true);
    
    let file_layer = fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .with_level(true);

    tracing_subscriber::registry()
        .with(console_layer)
        .with(file_layer)
        .with(env_filter)
        .init();

    guard
}