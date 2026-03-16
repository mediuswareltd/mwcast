use actix_web::{web, HttpRequest, Responder};
use actix_ws::Message;
use chrono::Utc;
use futures_util::StreamExt;
use rdkafka::consumer::Consumer;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::Message as KafkaMessage;
use serde::Deserialize;
use sqlx::PgPool;
use std::time::Duration;
use tracing::{info, warn};
use uuid::Uuid;

use crate::chat::ChatRooms;
use crate::error::AppError;
use crate::kafka::{chat_topic, create_consumer};
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
    producer: web::Data<FutureProducer>,
    kafka_brokers: web::Data<String>,
    path: web::Path<String>,
    query: web::Query<ChatQuery>,
) -> Result<impl Responder, AppError> {
    let chat_room_id = path.into_inner();

    let stream_id = chat_room_id
        .parse::<Uuid>()
        .map_err(|_| AppError::BadRequest("Invalid chat_room_id".to_string()))?;

    let stream_record = StreamRepository::get_by_id(&pool, stream_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Stream not found".to_string()))?;

    if stream_record.status != "live" {
        return Err(AppError::BadRequest("Stream is not live".to_string()));
    }

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

    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let room_id = chat_room_id.clone();
    let topic = chat_topic(&room_id);

    // Register session — spawn one consumer per room (only if this is the first connection)
    let is_first = {
        let mut entry = rooms.get_ref().entry(chat_room_id.clone()).or_default();
        let first = entry.is_empty();
        entry.push(session.clone());
        first
    };

    info!("'{}' joined chat room: {}", username, chat_room_id);

    // One Kafka consumer per room — broadcasts to all local sessions
    if is_first {
        let rooms_consumer = rooms.clone();
        let brokers = kafka_brokers.get_ref().clone();
        let consumer_topic = topic.clone();
        let consumer_room_id = room_id.clone();

        actix_web::rt::spawn(async move {
            let consumer =
                create_consumer(&brokers, &format!("mwcast-chat-{}", consumer_room_id));
            if consumer.subscribe(&[&consumer_topic]).is_err() {
                warn!("Failed to subscribe to topic: {}", consumer_topic);
                return;
            }

            let mut stream = consumer.stream();
            while let Some(Ok(msg)) = stream.next().await {
                if let Some(Ok(payload)) = msg.payload_view::<str>() {
                    let broadcast = payload.to_string();
                    if let Some(mut clients) = rooms_consumer.get_mut(&consumer_room_id) {
                        if clients.is_empty() {
                            break;
                        }
                        let mut alive = Vec::new();
                        for mut s in clients.drain(..) {
                            if s.text(broadcast.clone()).await.is_ok() {
                                alive.push(s);
                            }
                        }
                        *clients = alive;
                    } else {
                        break;
                    }
                }
            }

            info!("Kafka consumer stopped for room: {}", consumer_room_id);
        });
    }

    // Handle incoming WS messages — publish to Kafka
    let producer_clone = producer.clone();
    let disconnect_username = username.clone();
    let disconnect_room_id = room_id.clone();

    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Text(text) => {
                    let broadcast = match serde_json::from_str::<serde_json::Value>(&text) {
                        Ok(mut val) => {
                            val["user_id"] = serde_json::json!(user_id);
                            val["username"] = serde_json::json!(username);
                            val["timestamp"] = serde_json::json!(Utc::now().to_rfc3339());
                            val.to_string()
                        }
                        Err(_) => text.to_string(),
                    };

                    let _ = producer_clone
                        .send(
                            FutureRecord::to(&topic)
                                .payload(&broadcast)
                                .key(&room_id),
                            Duration::from_secs(0),
                        )
                        .await;
                }
                Message::Ping(bytes) => {
                    let _ = session.pong(&bytes).await;
                }
                Message::Close(_) => break,
                _ => {}
            }
        }

        // Remove only this session — close it first so it's detected as dead on next broadcast
        let _ = session.close(None).await;

        warn!(
            "'{}' disconnected from chat room: {}",
            disconnect_username, disconnect_room_id
        );
    });

    Ok(response)
}
