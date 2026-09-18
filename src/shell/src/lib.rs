mod ai_profiles;
mod coach;
mod speech;
mod voice_download;
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
        .plugin(tauri_plugin_opener::init())
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
            let library = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../../build/content/word-library")
            } else {
                app.path().resource_dir()?.join("word-library")
            };
            app.manage(StorageService::start(data, runtime, library));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai_profiles::ai_profiles_list,
            ai_profiles::ai_profiles_reset_credentials,
            ai_profiles::ai_profile_save,
            ai_profiles::ai_profile_delete,
            ai_profiles::ai_profile_activate,
            ai_profiles::ai_profile_resolve,
            voice_download::speech_download_enhanced,
            voice_download::speech_open_accessibility_settings,
            speech::speech_download_preference,
            speech::speech_enhanced_available,
            speech::speech_open_download_settings,
            speech::speech_voices,
            speech::speech_render,
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
