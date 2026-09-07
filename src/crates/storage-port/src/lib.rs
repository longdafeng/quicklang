use quicklang_domain::{AppError, ReviewEvent, ReviewState};
#[derive(Debug, Clone, PartialEq)]
pub enum CommitResult {
    Applied(ReviewState),
    AlreadyApplied(ReviewState),
}

/// Implementations must atomically append the event AND compare-and-swap state.
/// Reusing an event ID with different data is an error, not an idempotent retry.
pub trait ReviewRepository {
    fn load(&self, card_id: &str) -> Result<ReviewState, AppError>;
    fn find_event(&self, event_id: &str) -> Result<Option<ReviewEvent>, AppError>;
    fn commit(
        &mut self,
        expected_version: u64,
        event: ReviewEvent,
        next: ReviewState,
    ) -> Result<CommitResult, AppError>;
}
pub trait Clock {
    fn now_ms(&self) -> i64;
}
