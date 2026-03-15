use actix_web::{HttpResponse, Responder};
use serde_json::json;

use crate::response::ApiResponse;

pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(ApiResponse::success(json!({
        "status": "ok",
        "service": "MWCAST Backend"
    })))
}
