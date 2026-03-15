use actix_web::{web, HttpResponse, Responder};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::error::AppError;
use crate::models::{CreateStreamRequest, StreamResponse, StopStreamRequest, StopStreamResponse};
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

pub async fn stop(
    pool: web::Data<PgPool>,
    req: web::Json<StopStreamRequest>,
) -> Result<impl Responder, AppError> {
    if req.stream_id.trim().is_empty() {
        return Err(AppError::ValidationErrors(vec![ValidationError {
            field: "stream_id".to_string(),
            message: "stream_id is required".to_string(),
        }]));
    }

    let id = Uuid::parse_str(&req.stream_id)
        .map_err(|_| AppError::BadRequest("Invalid stream_id format".to_string()))?;

    // Ensure stream exists
    let stream = StreamRepository::get_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Stream not found")))?;

    // Guard: only stop a live stream
    if stream.status != "live" {
        return Err(AppError::BadRequest(format!(
            "Stream is already '{}'",
            stream.status
        )));
    }

    StreamRepository::update_status(&pool, id, "stopped").await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(StopStreamResponse {
        status: "stopped".to_string(),
    })))
}
