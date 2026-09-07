#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Until pairing/TLS/auth exist this service only listens on loopback.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:4318").await?;
    println!("QuickLang framework API on 127.0.0.1:4318 (readiness: unavailable)");
    axum::serve(listener, quicklang_server::router())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
