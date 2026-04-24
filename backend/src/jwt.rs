use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};

use crate::error::AppError;
use crate::models::Claims;

const JWT_EXPIRY_HOURS: i64 = 24 * 7; // 7 days

pub fn create_token(
    user_id: &str,
    email: &str,
    display_name: &str,
    secret: &str,
) -> Result<String, AppError> {
    let exp = (Utc::now() + Duration::hours(JWT_EXPIRY_HOURS)).timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_string(),
        display_name: display_name.to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::InternalError(e.to_string()))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|td| td.claims)
    .map_err(|e| AppError::Unauthorized(format!("Invalid token: {}", e)))
}
