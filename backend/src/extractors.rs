use std::future::Future;
use std::pin::Pin;

use actix_web::{FromRequest, HttpRequest};
use actix_web::web::Bytes;
use serde::de::DeserializeOwned;
use validator::Validate;

use crate::error::AppError;
use crate::response::ValidationError;

/// Deserializes JSON and runs all field validations before the handler is called.
/// Empty body is treated as `{}` so all missing fields are reported at once.
pub struct ValidatedJson<T>(pub T);

impl<T> FromRequest for ValidatedJson<T>
where
    T: DeserializeOwned + Validate + Default + 'static,
{
    type Error = actix_web::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &HttpRequest, payload: &mut actix_web::dev::Payload) -> Self::Future {
        let bytes_fut = Bytes::from_request(req, payload);

        Box::pin(async move {
            let bytes = bytes_fut.await.unwrap_or_default();

            // Treat empty body as `{}` so serde doesn't EOF — validator catches missing fields
            let data: T = if bytes.is_empty() {
                T::default()
            } else {
                serde_json::from_slice(&bytes).map_err(|e| {
                    let app_err: actix_web::Error = AppError::BadRequest(
                        format!("Invalid JSON: {}", e)
                    ).into();
                    app_err
                })?
            };

            data.validate().map_err(|e| {
                let errors: Vec<ValidationError> = e
                    .field_errors()
                    .iter()
                    .flat_map(|(field, errs)| {
                        errs.iter().map(|err| ValidationError {
                            field: field.to_string(),
                            message: err
                                .message
                                .clone()
                                .unwrap_or_default()
                                .to_string(),
                        })
                    })
                    .collect();

                let app_err: actix_web::Error = AppError::ValidationErrors(errors).into();
                app_err
            })?;

            Ok(ValidatedJson(data))
        })
    }
}
