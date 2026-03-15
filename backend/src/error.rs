use actix_web::{error::ResponseError, http::StatusCode, HttpResponse};
use std::fmt;

use crate::response::ApiResponse;

#[derive(Debug)]
pub enum AppError {
    DatabaseError(String),
    NotFound(String),
    BadRequest(String),
    ValidationErrors(Vec<crate::response::ValidationError>),
    InternalError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::DatabaseError(msg) => write!(f, "{}", msg),
            AppError::NotFound(msg) => write!(f, "{}", msg),
            AppError::BadRequest(msg) => write!(f, "{}", msg),
            AppError::ValidationErrors(_) => write!(f, "Validation failed"),
            AppError::InternalError(msg) => write!(f, "{}", msg),
        }
    }
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            AppError::DatabaseError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::ValidationErrors(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::InternalError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();

        match self {
            AppError::ValidationErrors(errors) => {
                let response = ApiResponse::<serde_json::Value>::validation_errors(errors.clone());
                HttpResponse::build(status).json(response)
            }
            _ => {
                let code = match self {
                    AppError::DatabaseError(_) => "database_error",
                    AppError::NotFound(_) => "not_found",
                    AppError::BadRequest(_) => "bad_request",
                    AppError::InternalError(_) => "internal_error",
                    AppError::ValidationErrors(_) => unreachable!(),
                };

                let response = ApiResponse::<serde_json::Value>::error(
                    self.to_string(),
                    status.as_u16(),
                    Some(code.to_string()),
                );

                HttpResponse::build(status).json(response)
            }
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound("Resource not found".to_string()),
            _ => AppError::DatabaseError(err.to_string()),
        }
    }
}

