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
                    .route("/stop", web::post().to(handlers::stop))
                    .route("/{stream_id}", web::get().to(handlers::metadata))
                    .route("/{stream_id}/join", web::get().to(handlers::join))
            )
            // WebSocket chat
            .route("/ws/chat/{chat_room_id}", web::get().to(handlers::ws_chat))
    );
}
