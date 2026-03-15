mod logger;

use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use backend::{chat, config::Config, db, routes};
use tracing::info;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let _guard = logger::init();

    let config = Config::from_env();
    info!("Configuration loaded");

    let pool = db::connect(&config.database_url)
        .await
        .expect("Failed to connect to database");

    info!(
        "Starting MWCAST server on {}:{}",
        config.server_host, config.server_port
    );

    let config_data = web::Data::new(config.clone());
    let chat_rooms = web::Data::new(chat::new_chat_rooms());

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .app_data(config_data.clone())
            .app_data(chat_rooms.clone())
            .wrap(Cors::permissive())
            .configure(routes::init)
    })
    .bind((config.server_host.as_str(), config.server_port))?
    .run()
    .await
}
