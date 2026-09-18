use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

static RUNNING: AtomicBool = AtomicBool::new(false);

/// Describe an automation attempt without claiming that a clicked download is installed.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DownloadStatus {
    Installed,
    Started,
    PermissionRequired,
    Manual,
}

/// Release the process-wide automation lock even if the worker unwinds.
struct DownloadGuard;
impl Drop for DownloadGuard {
    /// Allow subsequent attempts once the worker exits.
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::Release);
    }
}

/// Attempt the fixed Apple voice workflow, never overlapping system UI operations.
#[tauri::command]
pub async fn speech_download_enhanced() -> Result<DownloadStatus, String> {
    if RUNNING.swap(true, Ordering::AcqRel) {
        return Err("正在操作音色下载界面，请稍候".into());
    }
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = DownloadGuard;
        if crate::speech::preferred_enhanced_installed()? {
            return Ok(DownloadStatus::Installed);
        }
        #[cfg(target_os = "macos")]
        {
            unsafe extern "C" {
                fn quicklang_download_voice() -> std::ffi::c_int;
            }
            // The native bridge checks AX trust and only operates VoiceOver Utility.
            Ok(match unsafe { quicklang_download_voice() } {
                0 => DownloadStatus::PermissionRequired,
                1 => DownloadStatus::Started,
                _ => DownloadStatus::Manual,
            })
        }
        #[cfg(not(target_os = "macos"))]
        Ok(DownloadStatus::Manual)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Open the user-controlled Accessibility permission pane without granting permission.
#[tauri::command]
pub async fn speech_open_accessibility_settings() -> Result<(), String> {
    let status = std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("无法打开辅助功能权限设置".into())
    }
}
