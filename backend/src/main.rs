mod logger;
mod routes;

use actix_web::{App, HttpServer};
use dotenvy::dotenv;
use actix_cors::Cors;
use tracing::info;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();

    // Keep guard alive for the lifetime of the program
    let _guard = logger::init();

    let host = std::env::var("SERVER_HOST").unwrap_or("0.0.0.0".into());
    let port: u16 = std::env::var("SERVER_PORT")
        .unwrap_or("8080".into())
        .parse()
        .unwrap_or_else(|_| {
            tracing::warn!("Invalid SERVER_PORT, defaulting to 8080");
            8080
        });

    info!("Starting MWCAST server on {}:{}", host, port);

    HttpServer::new(|| {
        App::new()
            .wrap(Cors::permissive())
            .configure(routes::init)
    })
    .bind((host, port))?
    .run()
    .await
}