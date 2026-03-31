use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tracing::info;

use crate::error::AppError;

pub async fn connect(database_url: &str) -> Result<PgPool, AppError> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await
        .map_err(|e| AppError::DatabaseError(e.to_string()))?;

    info!("Database connection pool initialized");

    // Run migrations automatically
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Migration failed: {}", e)))?;

    info!("Database migrations applied");

    Ok(pool)
}

