use std::fs::create_dir_all;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use tracing_appender::rolling;
use tracing_appender::non_blocking::WorkerGuard;

/// Initialize logger and return guard to keep alive
pub fn init() -> WorkerGuard {
    create_dir_all("logs").expect("Failed to create logs directory");

    let file_appender = rolling::daily("logs", "mwcast.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let console_layer = fmt::layer(); // console
    let file_layer = fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false); // no color in file

    tracing_subscriber::registry()
        .with(console_layer)
        .with(file_layer)
        .with(EnvFilter::from_default_env())
        .init();

    guard
}