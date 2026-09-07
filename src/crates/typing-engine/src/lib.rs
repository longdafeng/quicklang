use quicklang_domain::{AppError, Rating};
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TypingMetrics {
    pub hint_count: u32,
    pub backspaces: u32,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TypingResult {
    pub correct: bool,
    pub expected: String,
    pub actual: String,
    pub mismatches: Vec<usize>,
    pub suggested_rating: Rating,
}
pub fn normalize(value: &str) -> String {
    value.nfkc().flat_map(char::to_lowercase).collect()
}
pub fn evaluate(
    expected: &str,
    actual: &str,
    metrics: &TypingMetrics,
) -> Result<TypingResult, AppError> {
    if expected.is_empty() || expected.len() > 1024 || actual.len() > 1024 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "Spelling must contain at most 1024 bytes",
            false,
        ));
    }
    let expected = normalize(expected);
    let actual = normalize(actual);
    let left: Vec<_> = expected.chars().collect();
    let right: Vec<_> = actual.chars().collect();
    let mismatches: Vec<_> = (0..left.len().max(right.len()))
        .filter(|&index| left.get(index) != right.get(index))
        .collect();
    let correct = mismatches.is_empty();
    let suggested_rating = if !correct || metrics.hint_count > 0 {
        Rating::Again
    } else if metrics.backspaces > 0 {
        Rating::Hard
    } else {
        Rating::Good
    };
    Ok(TypingResult {
        correct,
        expected,
        actual,
        mismatches,
        suggested_rating,
    })
}
