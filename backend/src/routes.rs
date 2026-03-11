use actix_web::{get, web, HttpResponse, Responder};

// Root route
#[get("/")]
pub async fn index() -> impl Responder {
    HttpResponse::Ok().body("Welcome to MWCAST!")
}

// Register routes in App
pub fn init(cfg: &mut web::ServiceConfig) {
    cfg.service(index);
}