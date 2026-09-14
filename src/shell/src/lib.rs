mod coach;
mod storage;
use quicklang_domain::{AppError, Rating, ReviewState};
use quicklang_typing_engine::{evaluate, TypingMetrics, TypingResult};
use storage::{RuntimeStatus, StorageService};
use tauri::Manager;

#[tauri::command]
async fn listening_repository(
    storage: tauri::State<'_, StorageService>,
    owner: String,
    operation: quicklang_storage_seekdb::listening::ListeningRequest,
) -> Result<serde_json::Value, AppError> {
    storage.listening(owner, operation).await
}
#[tauri::command]
fn get_runtime_status(storage: tauri::State<'_, StorageService>) -> RuntimeStatus {
    storage.status()
}
#[tauri::command]
async fn load_review_state(
    storage: tauri::State<'_, StorageService>,
    card_id: String,
) -> Result<ReviewState, AppError> {
    storage.load(card_id).await
}
#[tauri::command]
async fn rate_card(
    storage: tauri::State<'_, StorageService>,
    card_id: String,
    event_id: String,
    expected_version: u64,
    rating: Rating,
) -> Result<ReviewState, AppError> {
    storage
        .rate(card_id, event_id, expected_version, rating)
        .await
}
#[tauri::command]
fn evaluate_spelling(
    expected: String,
    actual: String,
    metrics: TypingMetrics,
) -> Result<TypingResult, AppError> {
    evaluate(&expected, &actual, &metrics)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data = std::env::var_os("QUICKLANG_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?.join("seekdb-1.4.0"));
            let runtime = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../../deps/cache/seekdb-runtime")
            } else {
                app.path().resource_dir()?.join("seekdb")
            };
            app.manage(StorageService::start(data, runtime));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_status,
            listening_repository,
            evaluate_spelling,
            load_review_state,
            rate_card,
            coach::coach_chat,
            coach::coach_transcribe,
            coach::listening_transcribe
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start QuickLang");
}
