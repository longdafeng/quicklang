use axum::{http::StatusCode, routing::get, Json, Router};
use serde_json::{json, Value};

pub fn router() -> Router {
    Router::new()
        .route(
            "/health/live",
            get(|| async { Json(json!({"status": "alive"})) }),
        )
        .route("/health/ready", get(unavailable))
        .fallback(unavailable)
}
async fn unavailable() -> (StatusCode, Json<Value>) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "code": "DB_NOT_CONFIGURED",
            "message": "Framework only: storage, authentication and synchronization are not configured",
            "retryable": false
        })),
    )
}
