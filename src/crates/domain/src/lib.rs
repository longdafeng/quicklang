//! Pure learning types. Time and identifiers are supplied by callers.
use serde::{Deserialize, Serialize};

pub const DAY_MS: i64 = 86_400_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardType {
    MeaningToSpelling,
    AudioToSpelling,
    WordToMeaning,
    SentenceCloze,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WordFact {
    pub id: String,
    pub spelling: String,
    pub meaning: String,
    pub language: String,
    pub source_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Card {
    pub id: String,
    pub fact_id: String,
    pub card_type: CardType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    New,
    Learning,
    Review,
    Relearning,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewState {
    pub card_id: String,
    pub phase: Phase,
    pub due_at: i64,
    pub interval_days: u32,
    pub ease: f64,
    pub lapses: u32,
    pub reps: u32,
    pub version: u64,
}

impl ReviewState {
    pub fn new(card_id: impl Into<String>, now: i64) -> Self {
        Self {
            card_id: card_id.into(),
            phase: Phase::New,
            due_at: now,
            interval_days: 0,
            ease: 2.5,
            lapses: 0,
            reps: 0,
            version: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewEvent {
    pub id: String,
    pub card_id: String,
    pub reviewed_at: i64,
    pub rating: Rating,
    pub algorithm_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[error("{message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}
impl AppError {
    pub fn new(code: &str, message: &str, retryable: bool) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retryable,
        }
    }
}
