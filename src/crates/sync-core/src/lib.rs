use quicklang_domain::{AppError, ReviewEvent};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize)]
pub struct PushBatch {
    pub device_id: String,
    pub events: Vec<ReviewEvent>,
}
impl PushBatch {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.device_id.is_empty() || self.device_id.len() > 128 || self.events.len() > 500 {
            return Err(AppError::new(
                "INVALID_BATCH",
                "Invalid device or batch size",
                false,
            ));
        }
        let mut ids = HashSet::new();
        for event in &self.events {
            if event.id.is_empty()
                || event.id.len() > 128
                || event.card_id.is_empty()
                || event.reviewed_at < 0
                || !ids.insert(&event.id)
            {
                return Err(AppError::new(
                    "INVALID_BATCH",
                    "Invalid or duplicate event",
                    false,
                ));
            }
        }
        Ok(())
    }
}
