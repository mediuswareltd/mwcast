use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::User;

pub struct UserRepository;

impl UserRepository {
    pub async fn create(
        pool: &PgPool,
        email: String,
        display_name: String,
        password_hash: Option<String>,
        google_id: Option<String>,
        avatar_url: Option<String>,
    ) -> Result<User, AppError> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        sqlx::query_as::<_, User>(
            "INSERT INTO users (id, email, display_name, password_hash, google_id, avatar_url, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *",
        )
        .bind(id)
        .bind(email)
        .bind(display_name)
        .bind(password_hash)
        .bind(google_id)
        .bind(avatar_url)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref db_err) if db_err.constraint() == Some("users_email_key") => {
                AppError::Conflict("An account with this email already exists".to_string())
            }
            _ => AppError::from(e),
        })
    }

    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, AppError> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(pool)
            .await
            .map_err(AppError::from)
    }

    pub async fn find_by_google_id(pool: &PgPool, google_id: &str) -> Result<Option<User>, AppError> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE google_id = $1")
            .bind(google_id)
            .fetch_optional(pool)
            .await
            .map_err(AppError::from)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>, AppError> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(AppError::from)
    }

    /// Upsert a Google OAuth user: find by google_id or email, or create new.
    pub async fn upsert_google_user(
        pool: &PgPool,
        google_id: String,
        email: String,
        display_name: String,
        avatar_url: Option<String>,
    ) -> Result<User, AppError> {
        // 1) Try finding by google_id
        if let Some(user) = Self::find_by_google_id(pool, &google_id).await? {
            return Ok(user);
        }

        // 2) Try finding by email (link accounts)
        if let Some(user) = Self::find_by_email(pool, &email).await? {
            // Link the google_id to the existing account
            let now = Utc::now();
            let updated = sqlx::query_as::<_, User>(
                "UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url), updated_at = $3
                 WHERE id = $4 RETURNING *",
            )
            .bind(&google_id)
            .bind(&avatar_url)
            .bind(now)
            .bind(user.id)
            .fetch_one(pool)
            .await
            .map_err(AppError::from)?;
            return Ok(updated);
        }

        // 3) Create new user
        Self::create(pool, email, display_name, None, Some(google_id), avatar_url).await
    }
}
