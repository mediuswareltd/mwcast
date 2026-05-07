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

    // Unique suffix so each consumer instance gets a fresh group — avoids
    // stale offset issues when Kafka restarts.
    let consumer_instance_id = Uuid::new_v4().to_string()[..8].to_string();

    let is_first = {
        let mut entry = rooms.get_ref().entry(chat_room_id.clone()).or_default();
        entry.is_empty()
        // Note: new session is added AFTER the join broadcast below
    };

    info!("'{}' joined chat room: {}", username, chat_room_id);

    // Broadcast join notification to existing clients BEFORE adding the new session
    {
        let join_msg = serde_json::json!({
            "type": "system",
            "event": "join",
            "username": username,
        }).to_string();
        if let Some(mut clients) = rooms.get_mut(&chat_room_id) {
            let mut alive = Vec::with_capacity(clients.len());
            for mut s in clients.drain(..) {
                if s.text(join_msg.clone()).await.is_ok() {
                    alive.push(s);
                }
            }
            *clients = alive;
        }
    }

    // Now add the new session to the room
    rooms.get_ref().entry(chat_room_id.clone()).or_default().push(session.clone());

    // One Kafka consumer per room. Restarts automatically on failure.
    // Exits only when the room has no more clients.
    if is_first {
        let rooms_consumer = rooms.clone();
        let brokers = kafka_brokers.get_ref().clone();
        let consumer_topic = topic.clone();
        let consumer_room_id = room_id.clone();

        actix_web::rt::spawn(async move {
            loop {
                let has_clients = rooms_consumer
                    .get(&consumer_room_id)
                    .map(|c| !c.is_empty())
                    .unwrap_or(false);

                if !has_clients {
                    info!("Kafka consumer exiting — room empty: {}", consumer_room_id);
                    break;
                }

                // Unique group ID per instance avoids Kafka holding stale offsets
                let group_id = format!("mwcast-{}-{}", &consumer_room_id[..8], consumer_instance_id);

                let consumer = match std::panic::catch_unwind(|| create_consumer(&brokers, &group_id)) {
                    Ok(c) => c,
                    Err(_) => {
                        warn!("Failed to create Kafka consumer for room {} — retrying in 3s", consumer_room_id);
                        tokio::time::sleep(Duration::from_secs(3)).await;
                        continue;
                    }
                };

                if consumer.subscribe(&[&consumer_topic]).is_err() {
                    warn!("Failed to subscribe to {} — retrying in 3s", consumer_topic);
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    continue;
                }

                info!("Kafka consumer connected for room: {}", consumer_room_id);

                let mut kafka_stream = consumer.stream();
                loop {
                    match tokio::time::timeout(Duration::from_secs(5), kafka_stream.next()).await {
                        Ok(Some(Ok(msg))) => {
                            if let Some(Ok(payload)) = msg.payload_view::<str>() {
                                let broadcast = payload.to_string();
                                if let Some(mut clients) = rooms_consumer.get_mut(&consumer_room_id) {
                                    if clients.is_empty() {
                                        info!("Kafka consumer exiting — room empty: {}", consumer_room_id);
                                        return;
                                    }
                                    let mut alive = Vec::with_capacity(clients.len());
                                    for mut s in clients.drain(..) {
                                        if s.text(broadcast.clone()).await.is_ok() {
                                            alive.push(s);
                                        }
                                    }
                                    *clients = alive;
                                } else {
                                    return;
                                }
                            }
                        }
                        Ok(Some(Err(e))) => {
                            warn!("Kafka error for room {}: {} — reconnecting in 3s", consumer_room_id, e);
                            break;
                        }
                        Ok(None) => {
                            warn!("Kafka stream ended for room {} — reconnecting in 3s", consumer_room_id);
                            break;
                        }
                        // Heartbeat — check if room still has clients
                        Err(_) => {
                            if !rooms_consumer.get(&consumer_room_id).map(|c| !c.is_empty()).unwrap_or(false) {
                                info!("Kafka consumer exiting — room empty: {}", consumer_room_id);
                                return;
                            }
                        }
                    }
                }

                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        });
    }

    // Handle incoming WS messages from this client.
    let rooms_direct = rooms.clone();
    let producer_clone = producer.clone();
    let disconnect_username = username.clone();
    let disconnect_room_id = room_id.clone();

    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Text(text) => {
                    let parsed = serde_json::from_str::<serde_json::Value>(&text).ok();
                    let msg_type = parsed.as_ref()
                        .and_then(|v| v.get("type"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .to_string();

                    // host_state / request_host_state / system: broadcast directly in-memory, skip Kafka.
                    if msg_type == "host_state" || msg_type == "request_host_state" || msg_type == "system" {
                        let broadcast = match parsed {
                            Some(mut val) => {
                                val["username"]  = serde_json::json!(username);
                                val["timestamp"] = serde_json::json!(Utc::now().to_rfc3339());
                                val.to_string()
                            }
                            None => text.to_string(),
                        };
                        if let Some(mut clients) = rooms_direct.get_mut(&room_id) {
                            let mut alive = Vec::with_capacity(clients.len());
                            for mut s in clients.drain(..) {
                                if s.text(broadcast.clone()).await.is_ok() {
                                    alive.push(s);
                                }
                            }
                            *clients = alive;
                        }
                        continue;
                    }

                    // Regular chat message — enrich and publish to Kafka
                    let broadcast = match parsed {
                        Some(mut val) => {
                            val["user_id"]   = serde_json::json!(user_id);
                            val["username"]  = serde_json::json!(username);
                            val["timestamp"] = serde_json::json!(Utc::now().to_rfc3339());
                            val.to_string()
                        }
                        None => text.to_string(),
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

        let _ = session.close(None).await;
        warn!("'{}' disconnected from chat room: {}", disconnect_username, disconnect_room_id);
    });

    Ok(response)
}
