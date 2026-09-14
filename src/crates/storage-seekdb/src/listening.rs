//! Listening repository. Audio and metadata commit together; stale writers fail closed.
use super::{error, literal, SeekDbEmbeddedAdapter};
use quicklang_domain::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ListeningRequest {
    List,
    Audio {
        id: String,
    },
    Save {
        id: String,
        version: u64,
        payload: Value,
        audio: Option<String>,
    },
    Delete {
        id: String,
        version: u64,
    },
}
fn key(value: &str) -> Result<(), AppError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err(error("INVALID_INPUT", "Invalid listening identifier"));
    }
    Ok(())
}
fn validate_material(payload: &Value, audio: Option<&str>) -> Result<String, AppError> {
    let body =
        serde_json::to_string(payload).map_err(|_| error("INVALID_INPUT", "Invalid material"))?;
    if !payload.is_object() || body.len() > 500_000 {
        return Err(error("INVALID_INPUT", "Material metadata exceeds limit"));
    }
    if let Some(bytes) = audio {
        if bytes.is_empty()
            || bytes.len() > 16_000_000
            || bytes.len() % 2 != 0
            || !bytes.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(error("INVALID_INPUT", "音频为空或超过 8 MB。"));
        }
    }
    Ok(body)
}

impl SeekDbEmbeddedAdapter {
    pub fn listening(&mut self, owner: &str, request: ListeningRequest) -> Result<Value, AppError> {
        key(owner)?;
        let id = match &request {
            ListeningRequest::List => None,
            ListeningRequest::Audio { id }
            | ListeningRequest::Save { id, .. }
            | ListeningRequest::Delete { id, .. } => Some(id),
        };
        if let Some(id) = id {
            key(id)?;
        }
        let filter = format!("owner_id={}", literal(owner));
        let filter = id.map_or(filter.clone(), |id| {
            format!("{filter} AND material_id={}", literal(id))
        });
        match request {
            ListeningRequest::List => {
                let rows = self.native.execute(&format!("SELECT material_id,version,payload FROM ql_listening WHERE {filter} ORDER BY material_id"))?;
                let mut result = Vec::new();
                for row in rows {
                    let payload: Value = serde_json::from_str(row[2].as_deref().unwrap_or(""))
                        .map_err(|_| error("DB_INVALID_RESULT", "Invalid listening payload"))?;
                    result.push(json!({"id":row[0],"version":row[1].as_deref().unwrap_or("").parse::<u64>().map_err(|_| error("DB_INVALID_RESULT", "Invalid version"))?,"payload":payload}));
                }
                Ok(json!(result))
            }
            ListeningRequest::Audio { .. } => {
                let rows = self.native.execute(&format!(
                    "SELECT HEX(audio) FROM ql_listening WHERE {filter}"
                ))?;
                Ok(json!(rows
                    .first()
                    .and_then(|r| r.first())
                    .and_then(Clone::clone)
                    .ok_or_else(|| error("NOT_FOUND", "Material not found"))?))
            }
            mutation => self.native.transaction(|| {
                let rows = self.native.execute(&format!(
                    "SELECT version FROM ql_listening WHERE {filter} FOR UPDATE"
                ))?;
                let current = rows
                    .first()
                    .and_then(|r| r.first())
                    .and_then(|v| v.as_deref())
                    .and_then(|s| s.parse::<u64>().ok());
                let expected = match &mutation {
                    ListeningRequest::Save { version, .. }
                    | ListeningRequest::Delete { version, .. } => *version,
                    _ => unreachable!(),
                };
                if current.unwrap_or(0) != expected || expected == u64::MAX {
                    return Err(error(
                        "VERSION_CONFLICT",
                        "材料已被修改，请重新打开听力训练。",
                    ));
                }
                match mutation {
                    ListeningRequest::Save {
                        id, payload, audio, ..
                    } => {
                        let body = validate_material(&payload, audio.as_deref())?;
                        if current.is_none() {
                            let bytes =
                                audio.ok_or_else(|| error("INVALID_INPUT", "Missing audio"))?;
                            self.native.execute(&format!(
                                "INSERT INTO ql_listening VALUES ({},{},1,{},UNHEX('{}'))",
                                literal(owner),
                                literal(&id),
                                literal(&body),
                                bytes
                            ))?;
                        } else {
                            if audio.is_some() {
                                return Err(error("INVALID_INPUT", "Audio cannot be replaced"));
                            }
                            self.native.execute(&format!(
                                "UPDATE ql_listening SET version={},payload={} WHERE {filter}",
                                expected + 1,
                                literal(&body)
                            ))?;
                        }
                        Ok(json!(expected + 1))
                    }
                    ListeningRequest::Delete { .. } => {
                        self.native
                            .execute(&format!("DELETE FROM ql_listening WHERE {filter}"))?;
                        Ok(Value::Null)
                    }
                    _ => unreachable!(),
                }
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_path_and_sql_identifiers() {
        for id in ["", "../other", "x' OR 1=1", "中文", "a/b"] {
            assert!(key(id).is_err());
        }
        assert!(key("profile-123").is_ok());
    }

    #[test]
    fn validates_audio_encoding_and_metadata_size_before_writing() {
        for payload in [Value::Null, json!([]), json!({"text":"x".repeat(500_000)})] {
            assert!(validate_material(&payload, None).is_err());
        }
        for audio in ["", "0", "gg", "00'0", &"ff".repeat(8_000_001)] {
            assert!(validate_material(&json!({}), Some(audio)).is_err());
        }
        assert_eq!(
            validate_material(&json!({"title":"中文"}), Some("00AaFF")).unwrap(),
            json!({"title":"中文"}).to_string()
        );
        assert!(validate_material(&json!({}), None).is_ok());
        assert!(key(&"a".repeat(128)).is_ok());
        assert!(key(&"a".repeat(129)).is_err());
    }
    #[test]
    #[ignore = "requires real macOS ARM64 seekdb runtime"]
    fn persists_audio_isolates_profiles_and_rejects_stale_updates() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let data = root.join(format!(
            "build/test-databases/listening-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        let runtime = root.join("deps/cache/seekdb-runtime");
        eprintln!("Listening test database: {}", data.display());
        let mut db = SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime).unwrap();
        let save = |version, audio| ListeningRequest::Save {
            id: "lesson-1".into(),
            version,
            payload: json!({"title":"A 'quoted' lesson 中文", "stage":1}),
            audio,
        };
        assert_eq!(
            db.listening("user-a", save(0, Some("0011ff".into())))
                .unwrap(),
            json!(1)
        );
        assert_eq!(
            db.listening("user-b", ListeningRequest::List).unwrap(),
            json!([])
        );
        assert!(db.listening("user-a", save(0, None)).is_err());
        assert_eq!(db.listening("user-a", save(1, None)).unwrap(), json!(2));
        drop(db);
        let mut db = SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime).unwrap();
        assert_eq!(
            db.listening(
                "user-a",
                ListeningRequest::Audio {
                    id: "lesson-1".into()
                }
            )
            .unwrap(),
            json!("0011FF")
        );
        assert_eq!(
            db.listening("user-a", ListeningRequest::List).unwrap()[0]["version"],
            json!(2)
        );
        assert!(db
            .listening(
                "user-a",
                ListeningRequest::Delete {
                    id: "lesson-1".into(),
                    version: 1
                }
            )
            .is_err());
        db.listening(
            "user-a",
            ListeningRequest::Delete {
                id: "lesson-1".into(),
                version: 2,
            },
        )
        .unwrap();
        assert_eq!(
            db.listening("user-a", ListeningRequest::List).unwrap(),
            json!([])
        );
    }
}
