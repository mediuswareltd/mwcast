use actix_web::{web, HttpResponse, Responder};
use rdkafka::admin::AdminClient;
use rdkafka::client::DefaultClientContext;
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::error::AppError;
use crate::extractors::ValidatedJson;
use crate::kafka;
use crate::models::{CreateStreamRequest, StreamMetadata, StreamResponse, StopStreamRequest, StopStreamResponse, ViewerJoinResponse};
use crate::repository::StreamRepository;
use crate::response::ApiResponse;

pub async fn start(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    admin: web::Data<AdminClient<DefaultClientContext>>,
    ValidatedJson(req): ValidatedJson<CreateStreamRequest>,
) -> Result<impl Responder, AppError> {
    let stream = StreamRepository::create(&pool, req.host_id, req.title).await?;

    kafka::create_topic(&admin, &stream.id.to_string()).await;

    let response = StreamResponse {
        stream_id: stream.id.to_string(),
        url: format!("{}/watch/{}", config.api_base_url, stream.id),
    };

    Ok(HttpResponse::Created().json(ApiResponse::success(response)))
}

pub async fn stop(
    pool: web::Data<PgPool>,
    admin: web::Data<AdminClient<DefaultClientContext>>,
    ValidatedJson(req): ValidatedJson<StopStreamRequest>,
) -> Result<impl Responder, AppError> {
    let id = Uuid::parse_str(&req.stream_id)
        .map_err(|_| AppError::BadRequest("Invalid stream_id format".to_string()))?;

    let stream = StreamRepository::get_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Stream not found".to_string()))?;

    if stream.status != "live" {
        return Err(AppError::BadRequest(format!(
            "Stream is already '{}'",
            stream.status
        )));
    }

    StreamRepository::update_status(&pool, id, "stopped").await?;

    kafka::delete_topic(&admin, &id.to_string()).await;

    Ok(HttpResponse::Ok().json(ApiResponse::success(StopStreamResponse {
        status: "stopped".to_string(),
    })))
}

pub async fn metadata(
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
) -> Result<impl Responder, AppError> {
    let stream = StreamRepository::get_by_id(&pool, path.into_inner())
        .await?
        .ok_or_else(|| AppError::NotFound("Stream not found".to_string()))?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(StreamMetadata {
        title: stream.title,
        host_id: stream.host_id,
        status: stream.status,
    })))
}

pub async fn join(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    path: web::Path<Uuid>,
) -> Result<impl Responder, AppError> {
    let stream = StreamRepository::get_by_id(&pool, path.into_inner())
        .await?
        .ok_or_else(|| AppError::NotFound("Stream not found".to_string()))?;

    if stream.status != "live" {
        return Err(AppError::BadRequest("Stream is not live".to_string()));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(ViewerJoinResponse {
        hls_url: format!("http://localhost:8888/live/{}/index.m3u8", stream.id),
        hls_720p_url: format!("http://localhost:8888/live/{}_720p/index.m3u8", stream.id),
        hls_480p_url: format!("http://localhost:8888/live/{}_480p/index.m3u8", stream.id),
        hls_360p_url: format!("http://localhost:8888/live/{}_360p/index.m3u8", stream.id),
        hls_240p_url: format!("http://localhost:8888/live/{}_240p/index.m3u8", stream.id),
        hls_144p_url: format!("http://localhost:8888/live/{}_144p/index.m3u8", stream.id),
        webrtc_url: format!("http://localhost:8889/live/{}", stream.id),
        chat_room_id: stream.id.to_string(),
    })))
}
