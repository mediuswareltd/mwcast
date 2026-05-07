use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub server_host: String,
    pub server_port: u16,
    pub database_url: String,
    pub rust_log: String,
    pub api_base_url: String,
    pub media_server_url: String,
    pub kafka_brokers: String,
    pub jwt_secret: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub frontend_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        Self {
            server_host: env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .unwrap_or(8080),
            database_url: env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            rust_log: env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
            api_base_url: env::var("API_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),
            media_server_url: env::var("MEDIA_SERVER_URL")
                .unwrap_or_else(|_| "rtmp://localhost:1935".to_string()),
            kafka_brokers: env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "localhost:9092".to_string()),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "changeme_jwt_secret".to_string()),
            google_client_id: env::var("GOOGLE_CLIENT_ID")
                .unwrap_or_default(),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET")
                .unwrap_or_default(),
            frontend_url: env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "https://localhost".to_string()),
        }
    }
}
