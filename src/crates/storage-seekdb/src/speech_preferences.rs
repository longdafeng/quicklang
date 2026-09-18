use crate::{error, literal, SeekDbEmbeddedAdapter};
use quicklang_domain::AppError;
use serde::{Deserialize, Serialize};

// Underscores cannot be passed to the public listening API, isolating device metadata.
const DEVICE_OWNER: &str = "__quicklang_device__";
const PREFERENCE_ID: &str = "speech-enhanced";

/// Persisted device metadata stored in the existing JSON envelope table.
#[derive(Serialize, Deserialize)]
struct SpeechPreference {
    #[serde(alias = "enhanced_declined")]
    value: bool,
    updated_at_ms: i64,
}

impl SeekDbEmbeddedAdapter {
    /// Read or update device opt-out without DDL on an existing seekdb database.
    /// The reserved owner cannot overlap user profiles; malformed metadata fails closed.
    pub fn speech_enhanced_declined(
        &self,
        declined: Option<bool>,
        now_ms: i64,
    ) -> Result<bool, AppError> {
        self.speech_boolean_preference(PREFERENCE_ID, declined, now_ms)
    }

    /// Cache confirmed installation independently of the user's download choice.
    pub fn speech_enhanced_available(
        &self,
        available: Option<bool>,
        now_ms: i64,
    ) -> Result<bool, AppError> {
        self.speech_boolean_preference("speech-enhanced-available", available, now_ms)
    }

    // Keep separate records so updating opt-out never erases confirmed installation.
    fn speech_boolean_preference(
        &self,
        preference_id: &str,
        value: Option<bool>,
        now_ms: i64,
    ) -> Result<bool, AppError> {
        let owner = literal(DEVICE_OWNER);
        let id = literal(preference_id);
        if let Some(value) = value {
            let payload = serde_json::to_string(&SpeechPreference {
                value,
                updated_at_ms: now_ms,
            })
            .map_err(|_| error("DB_INVALID_RESULT", "Cannot encode speech preference"))?;
            // Reuse the existing JSON envelope to avoid seekdb's reopened-database DDL stall.
            self.native.execute(&format!(
                "INSERT INTO ql_listening (owner_id,material_id,version,payload,audio) VALUES ({owner},{id},1,{},X'') ON DUPLICATE KEY UPDATE payload=VALUES(payload),version=version+1",
                literal(&payload)
            ))?;
        }
        let rows = self.native.execute(&format!(
            "SELECT payload FROM ql_listening WHERE owner_id={owner} AND material_id={id}"
        ))?;
        let Some(row) = rows.first() else {
            return Ok(false);
        };
        let payload = row
            .first()
            .and_then(|value| value.as_deref())
            .ok_or_else(|| error("DB_INVALID_RESULT", "Missing speech preference payload"))?;
        serde_json::from_str::<SpeechPreference>(payload)
            .map(|preference| preference.value)
            .map_err(|_| error("DB_INVALID_RESULT", "Invalid speech preference payload"))
    }
}
