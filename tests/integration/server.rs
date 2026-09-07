use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
#[tokio::test]
async fn live_is_ok_but_readiness_and_unimplemented_endpoints_fail_closed() {
    for (method, path, expected) in [
        ("GET", "/health/live", StatusCode::OK),
        ("GET", "/health/ready", StatusCode::SERVICE_UNAVAILABLE),
        ("POST", "/v1/sync/push", StatusCode::SERVICE_UNAVAILABLE),
        ("GET", "/v1/sync/pull", StatusCode::SERVICE_UNAVAILABLE),
    ] {
        let response = quicklang_server::router()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
}
