use actix_web::{error::ResponseError, http::StatusCode, HttpResponse};
use std::fmt;

use crate::response::{ApiResponse, ValidationError};

#[derive(Debug)]
pub enum AppError {
    DatabaseError(String),
    NotFound(String),
    BadRequest(String),
    ValidationError(String),
    ValidationErrors(Vec<ValidationError>),
    InternalError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::DatabaseError(msg) => write!(f, "{}", msg),
            AppError::NotFound(msg) => write!(f, "{}", msg),
            AppError::BadRequest(msg) => write!(f, "{}", msg),
            AppError::ValidationError(msg) => write!(f, "{}", msg),
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
            AppError::ValidationError(_) => StatusCode::UNPROCESSABLE_ENTITY,
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
                    AppError::ValidationError(_) => "validation_error",
                    AppError::InternalError(_) => "internal_error",
                    AppError::ValidationErrors(_) => "validation_error",
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

// Custom JSON error handler - collects all validation errors
pub fn json_error_handler(err: actix_web::error::JsonPayloadError, _req: &actix_web::HttpRequest) -> actix_web::Error {
    let validation_errors = match &err {
        actix_web::error::JsonPayloadError::Deserialize(e) => {
            let err_str = e.to_string();
            let mut errors = Vec::new();

            // Collect all missing fields
            let mut remaining = err_str.as_str();
            while let Some(pos) = remaining.find("missing field") {
                remaining = &remaining[pos + 13..]; // skip "missing field"
                if let Some(start) = remaining.find('`') {
                    if let Some(end) = remaining[start + 1..].find('`') {
                        let field = &remaining[start + 1..start + 1 + end];
                        errors.push(ValidationError {
                            field: field.to_string(),
                            message: format!("Field '{}' is required", field),
                        });
                    }
                }
            }

            // If no missing fields found, check for other errors
            if errors.is_empty() {
                if err_str.contains("unknown field") {
                    if let Some(field) = err_str.split('`').nth(1) {
                        errors.push(ValidationError {
                            field: field.to_string(),
                            message: format!("Unknown field '{}'", field),
                        });
                    }
                } else if err_str.contains("invalid type") {
                    // Serde doesn't include field name in error, so we need to parse the JSON
                    // to figure out which field has the wrong type
                    let field_name = "unknown";
                    
                    errors.push(ValidationError {
                        field: field_name.to_string(),
                        message: "Invalid data type: all fields must be strings".to_string(),
                    });
                } else {
                    errors.push(ValidationError {
                        field: "unknown".to_string(),
                        message: format!("Invalid JSON: {}", e),
                    });
                }
            }

            errors
        }
        actix_web::error::JsonPayloadError::ContentType => {
            vec![ValidationError {
                field: "content_type".to_string(),
                message: "Content-Type must be application/json".to_string(),
            }]
        }
        actix_web::error::JsonPayloadError::Payload(e) => {
            vec![ValidationError {
                field: "body".to_string(),
                message: format!("Invalid request body: {}", e),
            }]
        }
        _ => {
            vec![ValidationError {
                field: "unknown".to_string(),
                message: "Invalid request body".to_string(),
            }]
        }
    };

    let app_error = AppError::ValidationErrors(validation_errors);
    actix_web::error::InternalError::from_response(
        err,
        app_error.error_response(),
    )
    .into()
}
