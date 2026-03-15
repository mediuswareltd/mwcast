use actix_web::{web, HttpRequest, Responder};
use actix_ws::Message;
use chrono::Utc;
use futures_util::StreamExt;
use serde::Deserialize;
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use crate::chat::ChatRooms;
use crate::error::AppError;
use crate::repository::StreamRepository;

#[derive(Debug, Deserialize)]
pub struct ChatQuery {
    pub user_id: Option<String>,
    pub username: Option<String>,
}

pub async fn ws_chat(
    req: HttpRequest,
    stream: web::Payload,
    pool: web::Data<PgPool>,
    rooms: web::Data<ChatRooms>,
    path: web::Path<String>,
    query: web::Query<ChatQuery>,
) -> Result<impl Responder, AppError> {
    let chat_room_id = path.into_inner();

    // Validate the room maps to a live stream
    let stream_id = chat_room_id
        .parse::<Uuid>()
        .map_err(|_| AppError::BadRequest("Invalid chat_room_id".to_string()))?;

    let stream_record = StreamRepository::get_by_id(&pool, stream_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Stream not found".to_string()))?;

    if stream_record.status != "live" {
        return Err(AppError::BadRequest("Stream is not live".to_string()));
    }

    // Resolve identity from query params — fallback to guest if not provided
    let user_id = query
        .user_id
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let username = query
        .username
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("guest_{}", &user_id[..8]));

    // Upgrade to WebSocket
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let rooms_clone = rooms.clone();
    let room_id = chat_room_id.clone();

    // Register this session in the room
    rooms
        .get_ref()
        .entry(chat_room_id.clone())
        .or_default()
        .push(session.clone());

    info!("'{}' joined chat room: {}", username, chat_room_id);

    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Text(text) => {
                    // Parse incoming — override user_id/username with connection identity
                    let broadcast = match serde_json::from_str::<serde_json::Value>(&text) {
                        Ok(mut val) => {
                            val["user_id"] = serde_json::json!(user_id);
                            val["username"] = serde_json::json!(username);
                            val["timestamp"] = serde_json::json!(Utc::now().to_rfc3339());
                            val.to_string()
                        }
                        Err(_) => text.to_string(),
                    };

                    // Broadcast to all sessions in the room, drop dead ones
                    if let Some(mut clients) = rooms_clone.get_mut(&room_id) {
                        let mut alive = Vec::new();
                        for mut s in clients.drain(..) {
                            if s.text(broadcast.clone()).await.is_ok() {
                                alive.push(s);
                            }
                        }
                        *clients = alive;
                    }
                }
                Message::Ping(bytes) => {
                    let _ = session.pong(&bytes).await;
                }
                Message::Close(_) => break,
                _ => {}
            }
        }

        if let Some(mut clients) = rooms_clone.get_mut(&room_id) {
            clients.retain(|_| false);
        }

        warn!("'{}' disconnected from chat room: {}", username, room_id);
    });

    Ok(response)
}
