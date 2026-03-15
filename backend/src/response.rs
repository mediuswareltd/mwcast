use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ApiResponse<T> {
    Success {
        success: bool,
        data: T,
    },
    Error {
        success: bool,
        error: ApiError,
    },
    ValidationErrors {
        success: bool,
        errors: Vec<ValidationError>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub message: String,
    pub status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self::Success {
            success: true,
            data,
        }
    }
}

impl ApiResponse<Value> {
    pub fn error(message: String, status: u16, code: Option<String>) -> Self {
        Self::Error {
            success: false,
            error: ApiError { message, status, code },
        }
    }

    pub fn validation_errors(errors: Vec<ValidationError>) -> Self {
        Self::ValidationErrors {
            success: false,
            errors,
        }
    }
}
