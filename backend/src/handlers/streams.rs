use actix_web::{web, HttpResponse, Responder};
use sqlx::PgPool;

use crate::config::Config;
use crate::error::AppError;
use crate::models::{CreateStreamRequest, StreamResponse};
use crate::repository::StreamRepository;
use crate::response::{ApiResponse, ValidationError};

pub async fn start(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    req: web::Json<CreateStreamRequest>,
) -> Result<impl Responder, AppError> {
    // Validate request and collect all errors
    let mut errors = Vec::new();

    // Check host_id
    if req.host_id.trim().is_empty() {
        errors.push(ValidationError {
            field: "host_id".to_string(),
            message: "host_id is required".to_string(),
        });
    }

    // Check title
    if req.title.trim().is_empty() {
        errors.push(ValidationError {
            field: "title".to_string(),
            message: "title is required".to_string(),
        });
    }

    // Return all errors if any
    if !errors.is_empty() {
        return Err(AppError::ValidationErrors(errors));
    }

    let stream = StreamRepository::create(&pool, req.host_id.clone(), req.title.clone()).await?;

    // Shareable URL for viewers to join
    let response = StreamResponse {
        stream_id: stream.id.to_string(),
        url: format!("{}/watch/{}", config.api_base_url, stream.id),
    };

    Ok(HttpResponse::Created().json(ApiResponse::success(response)))
}
