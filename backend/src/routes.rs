use actix_web::web;

use crate::handlers;

pub fn init(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            // Health check
            .route("/", web::get().to(handlers::health_check))
            
            // Stream management
            .service(
                web::scope("/streams")
                    .route("/start", web::post().to(handlers::start))
            )
    );
}
