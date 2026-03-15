use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Stream {
    pub id: Uuid,
    pub host_id: String,
    pub title: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(default)]
pub struct CreateStreamRequest {
    #[validate(length(min = 1, message = "host_id is required"))]
    pub host_id: String,

    #[validate(length(min = 1, message = "title is required"))]
    pub title: String,
}

impl Default for CreateStreamRequest {
    fn default() -> Self {
        Self {
            host_id: String::new(),
            title: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamResponse {
    pub stream_id: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(default)]
pub struct StopStreamRequest {
    #[validate(length(min = 1, message = "stream_id is required"))]
    pub stream_id: String,
}

impl Default for StopStreamRequest {
    fn default() -> Self {
        Self {
            stream_id: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StopStreamResponse {
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ViewerJoinResponse {
    pub stream_url: String,
    pub chat_room_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamMetadata {
    pub title: String,
    pub host_id: String,
    pub status: String,
}
