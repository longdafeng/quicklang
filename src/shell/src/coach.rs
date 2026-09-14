use reqwest::{redirect::Policy, Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Deserialize, Serialize)]
pub struct Message {
    role: String,
    content: String,
}
fn endpoint(base: &str, path: &str) -> Result<Url, String> {
    let mut url = Url::parse(base).map_err(|_| "AI 地址格式不正确。")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (!url.username().is_empty())
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !(url.scheme() == "https" || (url.scheme() == "http" && local))
    {
        return Err("请使用 HTTPS 或本机 HTTP 地址，地址不得携带凭据或参数。".into());
    }
    url.set_path(&format!("{}/{}", url.path().trim_end_matches('/'), path));
    Ok(url)
}
fn request(
    base: &str,
    path: &str,
    api_key: &str,
    model: &str,
) -> Result<reqwest::RequestBuilder, String> {
    if model.trim().is_empty() || model.len() > 200 || api_key.len() > 4096 {
        return Err("请检查模型和密钥设置。".into());
    }
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(10))
        .redirect(Policy::none())
        .build()
        .map_err(|_| "无法初始化 AI 网络连接。")?;
    let req = client.post(endpoint(base, path)?);
    Ok(if api_key.is_empty() {
        req
    } else {
        req.bearer_auth(api_key)
    })
}
async fn response(req: reqwest::RequestBuilder) -> Result<Value, String> {
    let mut res = req
        .send()
        .await
        .map_err(|_| "AI 服务连接失败或超时，请检查网络和地址。")?;
    if !res.status().is_success() {
        return Err(format!(
            "AI 服务请求失败（{}），请检查模型、密钥和额度。",
            res.status().as_u16()
        ));
    }
    let mut data = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|_| "AI 响应读取失败。")? {
        if data.len() + chunk.len() > 256_000 {
            return Err("AI 响应过大。".into());
        }
        data.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&data).map_err(|_| "AI 服务返回了无效 JSON。".into())
}
#[tauri::command]
pub async fn coach_chat(
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<Message>,
) -> Result<String, String> {
    if messages.is_empty()
        || messages.len() > 12
        || messages.iter().any(|m| {
            !matches!(m.role.as_str(), "system" | "user" | "assistant") || m.content.len() > 16000
        })
    {
        return Err("对话内容过长或格式不正确。".into());
    }
    let req = request(&base_url, "chat/completions", &api_key, &model)?
        .json(&json!({"model":model,"messages":messages,"stream":false,"max_tokens":900}));
    let value = response(req).await?;
    value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.chars().take(12000).collect())
        .ok_or_else(|| "服务没有返回文字反馈。".into())
}
#[tauri::command]
pub async fn coach_transcribe(
    base_url: String,
    api_key: String,
    model: String,
    audio: Vec<u8>,
    mime: String,
) -> Result<String, String> {
    if audio.is_empty() || audio.len() > 8_000_000 {
        return Err("录音为空或超过 8 MB。".into());
    }
    let mime = mime.split(';').next().unwrap_or("");
    let ext = match mime {
        "audio/mp4" => "m4a",
        "audio/webm" => "webm",
        "audio/ogg" => "ogg",
        "audio/wav" => "wav",
        _ => return Err("不支持此录音格式。".into()),
    };
    let part = reqwest::multipart::Part::bytes(audio)
        .file_name(format!("recording.{ext}"))
        .mime_str(mime)
        .map_err(|_| "录音格式不正确。")?;
    let form = reqwest::multipart::Form::new()
        .text("model", model.clone())
        .text("language", "en")
        .part("file", part);
    let value =
        response(request(&base_url, "audio/transcriptions", &api_key, &model)?.multipart(form))
            .await?;
    value
        .get("text")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.chars().take(4000).collect())
        .ok_or_else(|| "没有识别到文字，请重试或手动填写。".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_service_endpoints() {
        assert_eq!(
            endpoint("http://127.0.0.1:11434/v1/", "chat/completions")
                .unwrap()
                .as_str(),
            "http://127.0.0.1:11434/v1/chat/completions"
        );
        for base in [
            "http://example.com",
            "https://secret@example.com",
            "https://example.com?key=secret",
            "file:///tmp/a",
        ] {
            assert!(endpoint(base, "chat/completions").is_err());
        }
    }
}

/// Timings must come from ASR, never estimated by a language model.
#[tauri::command]
pub async fn listening_transcribe(
    base_url: String,
    api_key: String,
    model: String,
    audio: Vec<u8>,
    mime: String,
) -> Result<Value, String> {
    if audio.is_empty() || audio.len() > 8_000_000 {
        return Err("音频为空或超过 8 MB。".into());
    }
    let mime = mime.split(';').next().unwrap_or("");
    let ext = match mime {
        "audio/mpeg" => "mp3",
        "audio/mp4" | "audio/x-m4a" => "m4a",
        "audio/webm" => "webm",
        "audio/ogg" => "ogg",
        "audio/wav" | "audio/x-wav" => "wav",
        _ => return Err("不支持此音频格式。".into()),
    };
    let part = reqwest::multipart::Part::bytes(audio)
        .file_name(format!("material.{ext}"))
        .mime_str(mime)
        .map_err(|_| "音频格式不正确。")?;
    let form = reqwest::multipart::Form::new()
        .text("model", model.clone())
        .text("language", "en")
        .text("response_format", "verbose_json")
        .text("timestamp_granularities[]", "segment")
        .part("file", part);
    response(request(&base_url, "audio/transcriptions", &api_key, &model)?.multipart(form)).await
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    fn mock_server(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}/v1", listener.local_addr().unwrap());
        let status = status.to_owned();
        let body = body.to_owned();
        let thread = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let size = socket.read(&mut buffer).unwrap();
                if size == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..size]);
                if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                    let length: usize = headers
                        .lines()
                        .find_map(|l| l.strip_prefix("content-length:"))
                        .unwrap_or("0")
                        .trim()
                        .parse()
                        .unwrap();
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            write!(socket, "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", status, body.len(), body).unwrap();
            String::from_utf8_lossy(&bytes).to_string()
        });
        (address, thread)
    }
    #[test]
    fn chat_round_trip_and_provider_errors() {
        let (base, server) = mock_server(
            "200 OK",
            r#"{"choices":[{"message":{"content":"Try again"}}]}"#,
        );
        let result = tauri::async_runtime::block_on(coach_chat(
            base,
            "test-key".into(),
            "test-model".into(),
            vec![Message {
                role: "user".into(),
                content: "My first answer".into(),
            }],
        ));
        assert_eq!(result.unwrap(), "Try again");
        let sent = server.join().unwrap();
        assert!(sent.starts_with("POST /v1/chat/completions"));
        assert!(sent.contains("My first answer"));
        let (base, server) = mock_server(
            "401 Unauthorized",
            r#"{"error":"sensitive provider detail"}"#,
        );
        let error = tauri::async_runtime::block_on(coach_chat(
            base,
            "test-key".into(),
            "test-model".into(),
            vec![Message {
                role: "user".into(),
                content: "answer".into(),
            }],
        ))
        .unwrap_err();
        server.join().unwrap();
        assert!(error.contains("401"));
        assert!(!error.contains("sensitive"));
        assert!(!error.contains("test-key"));
    }
    #[test]
    fn transcription_sends_multipart_and_rejects_invalid_audio() {
        let (base, server) = mock_server("200 OK", r#"{"text":"Hello there"}"#);
        let result = tauri::async_runtime::block_on(coach_transcribe(
            base,
            String::new(),
            "speech".into(),
            vec![1, 2, 3],
            "audio/mp4".into(),
        ));
        assert_eq!(result.unwrap(), "Hello there");
        let sent = server.join().unwrap();
        assert!(sent.starts_with("POST /v1/audio/transcriptions"));
        assert!(sent.contains("recording.m4a"));
        assert!(tauri::async_runtime::block_on(coach_transcribe(
            "https://example.com".into(),
            String::new(),
            "speech".into(),
            vec![],
            "audio/mp4".into()
        ))
        .is_err());
    }
    #[test]
    fn rejects_malformed_chat_and_audio_before_network_access() {
        for messages in [
            vec![],
            vec![Message {
                role: "tool".into(),
                content: "hello".into(),
            }],
            vec![Message {
                role: "user".into(),
                content: "x".repeat(16001),
            }],
        ] {
            assert!(tauri::async_runtime::block_on(coach_chat(
                "invalid".into(),
                String::new(),
                "model".into(),
                messages
            ))
            .unwrap_err()
            .contains("对话内容"));
        }
        for (audio, mime) in [
            (vec![], "audio/mp4"),
            (vec![0; 8_000_001], "audio/mp4"),
            (vec![0], "text/plain"),
        ] {
            assert!(tauri::async_runtime::block_on(coach_transcribe(
                "invalid".into(),
                String::new(),
                "model".into(),
                audio.clone(),
                mime.into()
            ))
            .is_err());
            assert!(tauri::async_runtime::block_on(listening_transcribe(
                "invalid".into(),
                String::new(),
                "model".into(),
                audio,
                mime.into()
            ))
            .is_err());
        }
        for (model, key) in [
            (String::new(), String::new()),
            ("m".repeat(201), String::new()),
            ("model".into(), "k".repeat(4097)),
        ] {
            assert!(request("invalid", "chat/completions", &key, &model).is_err());
        }
    }
    #[test]
    fn rejects_invalid_json_missing_text_and_oversized_provider_responses() {
        for body in [
            "invalid".to_string(),
            "{}".into(),
            r#"{"choices":[{"message":{"content":"  "}}]}"#.into(),
            "x".repeat(256001),
        ] {
            let (base, server) = mock_server("200 OK", &body);
            assert!(tauri::async_runtime::block_on(coach_chat(
                base,
                String::new(),
                "model".into(),
                vec![Message {
                    role: "user".into(),
                    content: "hi".into()
                }]
            ))
            .is_err());
            server.join().unwrap();
        }
    }
    #[test]
    fn listening_requests_real_segment_timestamps_and_preserves_response() {
        let body = r#"{"segments":[{"start":0,"end":1,"text":"Hello"}]}"#;
        for mime in [
            "audio/mpeg",
            "audio/x-m4a",
            "audio/webm",
            "audio/ogg",
            "audio/x-wav",
        ] {
            let (base, server) = mock_server("200 OK", body);
            let result = tauri::async_runtime::block_on(listening_transcribe(
                base,
                String::new(),
                "asr".into(),
                vec![1, 2],
                mime.into(),
            ))
            .unwrap();
            assert_eq!(result["segments"][0]["text"], "Hello");
            let sent = server.join().unwrap();
            assert!(sent.contains("verbose_json"));
            assert!(sent.contains("timestamp_granularities[]"));
        }
    }
}
