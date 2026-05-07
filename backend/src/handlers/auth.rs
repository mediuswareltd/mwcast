use actix_web::{web, HttpResponse, Responder};
use bcrypt::{hash, verify, DEFAULT_COST};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::config::Config;
use crate::error::AppError;
use crate::extractors::ValidatedJson;
use crate::jwt;
use crate::models::{AuthResponse, LoginRequest, RegisterRequest, UserPublic};
use crate::repository::UserRepository;
use crate::response::ApiResponse;

// ── Email / Password ──────────────────────────────────────────────────────────

pub async fn register(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    ValidatedJson(req): ValidatedJson<RegisterRequest>,
) -> Result<impl Responder, AppError> {
    let password_hash = hash(&req.password, DEFAULT_COST)
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let user = UserRepository::create(
        &pool,
        req.email.to_lowercase(),
        req.display_name,
        Some(password_hash),
        None,
        None,
    )
    .await?;

    let token = jwt::create_token(&user.id.to_string(), &user.email, &user.display_name, &config.jwt_secret)?;

    Ok(HttpResponse::Created().json(ApiResponse::success(AuthResponse {
        token,
        user: UserPublic::from(user),
    })))
}

pub async fn login(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    ValidatedJson(req): ValidatedJson<LoginRequest>,
) -> Result<impl Responder, AppError> {
    let user = UserRepository::find_by_email(&pool, &req.email.to_lowercase())
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid email or password".to_string()))?;

    let hash = user
        .password_hash
        .as_deref()
        .ok_or_else(|| AppError::Unauthorized("This account uses Google Sign-In. Please log in with Google.".to_string()))?;

    let valid = verify(&req.password, hash)
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    if !valid {
        return Err(AppError::Unauthorized("Invalid email or password".to_string()));
    }

    let token = jwt::create_token(&user.id.to_string(), &user.email, &user.display_name, &config.jwt_secret)?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(AuthResponse {
        token,
        user: UserPublic::from(user),
    })))
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct GoogleCallbackQuery {
    pub code: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct GoogleTokenResponse {
    access_token: String,
    id_token: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GoogleUserInfo {
    id: String,
    email: String,
    name: String,
    picture: Option<String>,
}

pub async fn google_callback(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    query: web::Query<GoogleCallbackQuery>,
) -> Result<impl Responder, AppError> {
    // Exchange authorization code for tokens
    let http = reqwest::Client::new();

    let redirect_uri = format!("{}/api/v1/auth/google/callback", config.api_base_url);

    let token_res: GoogleTokenResponse = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", query.code.as_str()),
            ("client_id", config.google_client_id.as_str()),
            ("client_secret", config.google_client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::InternalError(format!("Token parse error: {}", e)))?;

    // Fetch user info from Google
    let user_info: GoogleUserInfo = http
        .get("https://www.googleapis.com/oauth2/v1/userinfo")
        .bearer_auth(&token_res.access_token)
        .send()
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::InternalError(format!("User info parse error: {}", e)))?;

    let user = UserRepository::upsert_google_user(
        &pool,
        user_info.id,
        user_info.email,
        user_info.name,
        user_info.picture,
    )
    .await?;

    let token = jwt::create_token(&user.id.to_string(), &user.email, &user.display_name, &config.jwt_secret)?;

    // Redirect to frontend with token in URL (frontend will store it)
    let frontend_redirect = format!(
        "{}/auth/callback?token={}",
        config.frontend_url,
        urlencoding_encode(&token)
    );

    Ok(HttpResponse::Found()
        .append_header(("Location", frontend_redirect))
        .finish())
}

fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

// ── Google OAuth initiation URL ───────────────────────────────────────────────

#[derive(Serialize)]
struct GoogleAuthUrl {
    url: String,
}

pub async fn google_login_url(config: web::Data<Config>) -> Result<impl Responder, AppError> {
    let redirect_uri = format!("{}/api/v1/auth/google/callback", config.api_base_url);

    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=select_account",
        urlencoding_encode(&config.google_client_id),
        urlencoding_encode(&redirect_uri),
    );

    Ok(HttpResponse::Ok().json(ApiResponse::success(GoogleAuthUrl { url })))
}

// ── Get current user (me) ─────────────────────────────────────────────────────

pub async fn me(
    pool: web::Data<PgPool>,
    req: actix_web::HttpRequest,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    let claims = extract_claims_from_request(&req, &config.jwt_secret)?;
    let user_id = uuid::Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Unauthorized("Invalid user ID in token".to_string()))?;

    let user = UserRepository::find_by_id(&pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(UserPublic::from(user))))
}

pub fn extract_claims_from_request(
    req: &actix_web::HttpRequest,
    secret: &str,
) -> Result<crate::models::Claims, AppError> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".to_string()))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| AppError::Unauthorized("Authorization header must use Bearer scheme".to_string()))?;

    crate::jwt::verify_token(token, secret)
}
