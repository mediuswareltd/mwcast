use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub password_hash: Option<String>,
    pub google_id: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Auth request / response types ────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(default)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,

    #[validate(length(min = 2, max = 50, message = "Display name must be 2–50 characters"))]
    pub display_name: String,

    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
}

impl Default for RegisterRequest {
    fn default() -> Self {
        Self {
            email: String::new(),
            display_name: String::new(),
            password: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(default)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,

    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

impl Default for LoginRequest {
    fn default() -> Self {
        Self {
            email: String::new(),
            password: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserPublic,
}

/// Safe subset of User for API responses — never includes password_hash.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublic {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}

impl From<User> for UserPublic {
    fn from(u: User) -> Self {
        Self {
            id: u.id.to_string(),
            email: u.email,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
        }
    }
}

/// Claims embedded in the JWT.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,        // user UUID as string
    pub email: String,
    pub display_name: String,
    pub exp: usize,         // expiry as Unix timestamp
}
