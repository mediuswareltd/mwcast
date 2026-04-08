use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{StreamConsumer};
use rdkafka::producer::FutureProducer;
use tracing::{info, warn};

pub fn create_producer(brokers: &str) -> FutureProducer {
    ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("message.timeout.ms", "5000")
        .set("reconnect.backoff.ms", "1000")
        .set("reconnect.backoff.max.ms", "10000")
        .set("socket.keepalive.enable", "true")
        .set("connections.max.idle.ms", "540000")
        .create()
        .expect("Failed to create Kafka producer")
}

pub fn create_consumer(brokers: &str, group_id: &str) -> StreamConsumer {
    ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", group_id)
        .set("auto.offset.reset", "latest")
        .set("enable.auto.commit", "true")
        .set("reconnect.backoff.ms", "1000")
        .set("reconnect.backoff.max.ms", "10000")
        .set("socket.keepalive.enable", "true")
        .set("connections.max.idle.ms", "540000")
        // Reduce session timeout so dead consumers are cleaned up faster
        .set("session.timeout.ms", "10000")
        .set("heartbeat.interval.ms", "3000")
        .create()
        .expect("Failed to create Kafka consumer")
}

pub fn create_admin(brokers: &str) -> AdminClient<DefaultClientContext> {
    ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("reconnect.backoff.ms", "1000")
        .set("reconnect.backoff.max.ms", "10000")
        .set("socket.keepalive.enable", "true")
        .create()
        .expect("Failed to create Kafka admin client")
}

/// Topic name for a given chat room
pub fn chat_topic(room_id: &str) -> String {
    format!("chat.{}", room_id)
}

pub async fn create_topic(admin: &AdminClient<DefaultClientContext>, room_id: &str) {
    let topic = chat_topic(room_id);
    let new_topic = NewTopic::new(&topic, 1, TopicReplication::Fixed(1));
    let opts = AdminOptions::new().request_timeout(Some(std::time::Duration::from_secs(10)));
    match admin.create_topics(&[new_topic], &opts).await {
        Ok(results) => {
            for r in results {
                match r {
                    Ok(name) => info!("Kafka topic created: {}", name),
                    Err((name, e)) => warn!("Failed to create topic {}: {:?}", name, e),
                }
            }
        }
        Err(e) => warn!("Kafka admin error on create: {:?}", e),
    }
}

pub async fn delete_topic(admin: &AdminClient<DefaultClientContext>, room_id: &str) {
    let topic = chat_topic(room_id);
    let opts = AdminOptions::new().request_timeout(Some(std::time::Duration::from_secs(10)));
    match admin.delete_topics(&[&topic], &opts).await {
        Ok(results) => {
            for r in results {
                match r {
                    Ok(name) => info!("Kafka topic deleted: {}", name),
                    Err((name, e)) => warn!("Failed to delete topic {}: {:?}", name, e),
                }
            }
        }
        Err(e) => warn!("Kafka admin error on delete: {:?}", e),
    }
}
