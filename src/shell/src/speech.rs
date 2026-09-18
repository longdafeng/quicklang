use serde::Serialize;
use std::io::Write;
use std::process::{Command, Stdio};

/// A locally installed macOS voice exposed to the desktop speech adapter.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Voice {
    name: String,
    lang: String,
    #[serde(rename = "voiceURI")]
    voice_uri: String,
    local_service: bool,
    default: bool,
}

/// Parse the name and locale before the sample text in `say -v ?` output.
fn parse_voice(line: &str) -> Option<Voice> {
    let header = line.split('#').next()?.trim();
    let (name, lang) = header.rsplit_once(char::is_whitespace)?;
    let name = name.trim();
    if name.is_empty() || !lang.contains('_') {
        return None;
    }
    Some(Voice {
        name: name.into(),
        lang: lang.replace('_', "-"),
        voice_uri: format!("macos-say:{name}"),
        local_service: true,
        default: false,
    })
}

/// Enumerate installed native voices without relying on WebKit's cached voice list.
fn installed_voices() -> Result<Vec<Voice>, String> {
    let output = Command::new("/usr/bin/say")
        .args(["-v", "?"])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("无法读取 macOS 音色".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_voice)
        .collect())
}

/// Return native voice metadata off the UI thread; report system enumeration failures.
#[tauri::command]
pub async fn speech_voices() -> Result<Vec<Voice>, String> {
    tauri::async_runtime::spawn_blocking(installed_voices)
        .await
        .map_err(|e| e.to_string())?
}

/// Render validated text to a temporary PCM WAV and remove the file after reading it.
fn render(text: String, voice_uri: String, rate: f64) -> Result<Vec<u8>, String> {
    if text.is_empty() || text.len() > 20000 || !rate.is_finite() || !(0.7..=1.8).contains(&rate) {
        return Err("无效的朗读内容或语速".into());
    }
    let voice = installed_voices()?
        .into_iter()
        .find(|v| v.voice_uri == voice_uri)
        .ok_or("所选本机音色已不可用，请刷新音色列表")?;
    let output = tempfile::Builder::new()
        .suffix(".wav")
        .tempfile()
        .map_err(|e| e.to_string())?;
    let mut child = Command::new("/usr/bin/say")
        .args([
            "--file-format=WAVE",
            "--data-format=LEI16@22050",
            "-v",
            &voice.name,
            "-r",
            &(175.0 * rate).round().to_string(),
            "-o",
        ])
        .arg(output.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let write_result = child
        .stdin
        .take()
        .ok_or("无法打开语音输入")?
        .write_all(format!("{text}\n").as_bytes());
    let status = child.wait().map_err(|e| e.to_string())?;
    write_result.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("macOS 语音生成失败".into());
    }
    let audio = std::fs::read(output.path()).map_err(|e| e.to_string())?;
    if audio.len() < 44 || &audio[..4] != b"RIFF" {
        return Err("macOS 未生成有效语音".into());
    }
    Ok(audio)
}

/// Generate local audio off the UI thread; the frontend owns playback and cancellation.
#[tauri::command]
pub async fn speech_render(text: String, voice_uri: String, rate: f64) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || render(text, voice_uri, rate))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    /// Preserve quality labels and locales when parsing real macOS voice metadata.
    #[test]
    fn parses_enhanced_voice() {
        let voice =
            parse_voice("Nathan (Enhanced)   en_US    # Hello! My name is Nathan.").unwrap();
        assert_eq!(voice.name, "Nathan (Enhanced)");
        assert_eq!(voice.voice_uri, "macos-say:Nathan (Enhanced)");
        assert_eq!(voice.lang, "en-US");
        assert_eq!(
            serde_json::to_value(&voice).unwrap()["voiceURI"],
            "macos-say:Nathan (Enhanced)"
        );
        assert!(parse_voice("invalid").is_none());
    }
    /// Verify opt-out persistence across a real seekdb close/reopen and permit later opt-in.
    #[test]
    #[ignore = "requires real embedded seekdb"]
    fn persists_download_refusal() {
        let runtime = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../deps/cache/seekdb-runtime");
        if let Some(path) = std::env::var_os("QUICKLANG_SPEECH_REOPEN_PATH") {
            let db = quicklang_storage_seekdb::SeekDbEmbeddedAdapter::open_with_runtime(
                std::path::Path::new(&path),
                &runtime,
            )
            .unwrap();
            assert!(db.speech_enhanced_available(None, 3).unwrap());
            assert!(db.speech_enhanced_declined(None, 3).unwrap());
            assert!(!db.speech_enhanced_declined(Some(false), 4).unwrap());
            assert!(!db.speech_enhanced_declined(None, 5).unwrap());
            assert!(db.speech_enhanced_available(None, 5).unwrap());
            return;
        }
        let test_root =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../build/test-databases");
        std::fs::create_dir_all(&test_root).unwrap();
        let directory = tempfile::Builder::new()
            .prefix("speech-")
            .tempdir_in(test_root)
            .unwrap()
            .keep();
        eprintln!("Speech preference database: {}", directory.display());
        {
            let db = quicklang_storage_seekdb::SeekDbEmbeddedAdapter::open_with_runtime(
                &directory, &runtime,
            )
            .unwrap();
            assert!(!db.speech_enhanced_available(None, 1).unwrap());
            assert!(db.speech_enhanced_available(Some(true), 2).unwrap());
            assert!(!db.speech_enhanced_declined(None, 1).unwrap());
            assert!(db.speech_enhanced_declined(Some(true), 2).unwrap());
        }
        let status = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "speech::tests::persists_download_refusal",
                "--ignored",
                "--nocapture",
            ])
            .env("QUICKLANG_SPEECH_REOPEN_PATH", &directory)
            .status()
            .unwrap();
        assert!(status.success(), "Refusal must survive process restart");
    }

    /// Reject bad input before attempting native speech generation.
    #[test]
    fn rejects_invalid_render() {
        assert!(render("Apple".into(), "invalid".into(), f64::NAN).is_err());
        assert!(render("".into(), "invalid".into(), 1.0).is_err());
    }
    /// Verify actual local rendering produces playable PCM rather than a silent fallback voice.
    #[test]
    #[cfg(target_os = "macos")]
    fn renders_installed_voice() {
        let voices = installed_voices().unwrap();
        let voice = voices
            .iter()
            .find(|v| v.name == "Nathan (Enhanced)")
            .or_else(|| voices.iter().find(|v| v.name == "Samantha"))
            .unwrap();
        let wav = render("Apple".into(), voice.voice_uri.clone(), 1.0).unwrap();
        assert_eq!(&wav[..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert!(wav.len() > 1000);
    }
}

/// Read or persist an explicit download decision in the embedded database.
#[tauri::command]
pub async fn speech_download_preference(
    storage: tauri::State<'_, crate::storage::StorageService>,
    declined: Option<bool>,
) -> Result<bool, quicklang_domain::AppError> {
    storage.speech_preference(declined).await
}

/// Read or persist a previously confirmed enhanced voice, without native checks.
#[tauri::command]
pub async fn speech_enhanced_available(
    storage: tauri::State<'_, crate::storage::StorageService>,
    available: Option<bool>,
) -> Result<bool, quicklang_domain::AppError> {
    storage.speech_enhanced_available(available).await
}

/// Open Apple's system speech settings; downloading is completed by the user in macOS.
#[tauri::command]
pub async fn speech_open_download_settings() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let status = Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.universalaccess?SpokenContent")
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("无法打开系统音色设置，请从系统设置的辅助功能进入".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Check the native inventory before opening or automating any system UI.
pub(crate) fn preferred_enhanced_installed() -> Result<bool, String> {
    Ok(installed_voices()?.iter().any(|voice| voice.lang == "en-US"
        && matches!(voice.name.as_str(), "Nathan (Enhanced)" | "Samantha (Enhanced)")))
}
