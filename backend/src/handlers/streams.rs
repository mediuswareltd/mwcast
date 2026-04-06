use actix_web::{web, HttpRequest, HttpResponse, Responder};
use rdkafka::admin::AdminClient;
use rdkafka::client::DefaultClientContext;
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::error::AppError;
use crate::extractors::ValidatedJson;
use crate::kafka;
use crate::models::{CreateStreamRequest, StreamListItem, StreamMetadata, StreamResponse, StopStreamRequest, StopStreamResponse, ViewerJoinResponse};
use crate::repository::StreamRepository;
use crate::response::ApiResponse;

pub async fn list(
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let streams = StreamRepository::get_all(&pool).await?;
    let items: Vec<StreamListItem> = streams
        .into_iter()
        .map(|s| StreamListItem {
            id: s.id.to_string(),
            host_name: s.host_name,
            title: s.title,
            status: s.status,
            created_at: s.created_at,
        })
        .collect();
    Ok(HttpResponse::Ok().json(ApiResponse::success(items)))
}

pub async fn start(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    admin: web::Data<AdminClient<DefaultClientContext>>,
    ValidatedJson(req): ValidatedJson<CreateStreamRequest>,
) -> Result<impl Responder, AppError> {
    let stream = StreamRepository::create(&pool, req.host_name, req.title).await?;

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
        host_name: stream.host_name,
        status: stream.status,
    })))
}

pub async fn join(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    path: web::Path<Uuid>,
) -> Result<impl Responder, AppError> {
    let stream = StreamRepository::get_by_id(&pool, path.into_inner())
        .await?
        .ok_or_else(|| AppError::NotFound("Stream not found".to_string()))?;

    // Derive media host from the incoming request's Host header so remote
    // clients (mobile, other PCs) get URLs pointing to this server, not localhost.
    let media_host = req
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .map(|h| h.split(':').next().unwrap_or("localhost").to_string())
        .unwrap_or_else(|| "localhost".to_string());

    Ok(HttpResponse::Ok().json(ApiResponse::success(ViewerJoinResponse {
        hls_url: format!("http://{}:8888/live/{}/index.m3u8", media_host, stream.id),
        hls_720p_url: format!("http://{}:8888/live/{}_720p/index.m3u8", media_host, stream.id),
        hls_480p_url: format!("http://{}:8888/live/{}_480p/index.m3u8", media_host, stream.id),
        hls_360p_url: format!("http://{}:8888/live/{}_360p/index.m3u8", media_host, stream.id),
        hls_240p_url: format!("http://{}:8888/live/{}_240p/index.m3u8", media_host, stream.id),
        hls_144p_url: format!("http://{}:8888/live/{}_144p/index.m3u8", media_host, stream.id),
        webrtc_url: format!("http://{}:8889/live/{}", media_host, stream.id),
        chat_room_id: stream.id.to_string(),
        username: stream.host_name.clone(),
        title: stream.title.clone(),
    })))
}
