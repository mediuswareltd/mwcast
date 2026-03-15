use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Stream {
    pub id: Uuid,
    pub host_id: String,
    pub title: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateStreamRequest {
    pub host_id: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamResponse {
    pub stream_id: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamMetadata {
    pub title: String,
    pub host_id: String,
    pub status: String,
}
