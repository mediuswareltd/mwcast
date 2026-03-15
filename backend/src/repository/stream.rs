use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::Stream;

pub struct StreamRepository;

impl StreamRepository {
    /// Create a new stream
    pub async fn create(
        pool: &PgPool,
        host_id: String,
        title: String,
    ) -> Result<Stream, AppError> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        sqlx::query_as::<_, Stream>(
            "INSERT INTO streams (id, host_id, title, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, host_id, title, status, created_at, updated_at",
        )
        .bind(id)
        .bind(host_id)
        .bind(title)
        .bind("live")
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::from(e))
    }

    /// Get stream by ID
    pub async fn get_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Stream>, AppError> {
        sqlx::query_as::<_, Stream>(
            "SELECT id, host_id, title, status, created_at, updated_at FROM streams WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::from(e))
    }

    /// Update stream status
    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        status: &str,
    ) -> Result<Stream, AppError> {
        let now = Utc::now();

        sqlx::query_as::<_, Stream>(
            "UPDATE streams SET status = $1, updated_at = $2 WHERE id = $3
             RETURNING id, host_id, title, status, created_at, updated_at",
        )
        .bind(status)
        .bind(now)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::from(e))
    }

    /// Get all active streams
    pub async fn get_active(pool: &PgPool) -> Result<Vec<Stream>, AppError> {
        sqlx::query_as::<_, Stream>(
            "SELECT id, host_id, title, status, created_at, updated_at FROM streams WHERE status = 'live' ORDER BY created_at DESC",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::from(e))
    }
}
