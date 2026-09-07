use quicklang_domain::AppError;
use quicklang_typing_engine::{evaluate, TypingMetrics, TypingResult};
use serde::Serialize;

#[derive(Serialize)]
struct RuntimeStatus {
    phase: &'static str,
    storage: &'static str,
    persistence_ready: bool,
}
#[tauri::command]
fn get_runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        phase: "framework",
        storage: "seekdb_not_configured",
        persistence_ready: false,
    }
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
        .invoke_handler(tauri::generate_handler![
            get_runtime_status,
            evaluate_spelling
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start QuickLang");
}
