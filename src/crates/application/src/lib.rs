use quicklang_domain::{AppError, Rating, ReviewEvent};
use quicklang_scheduler::{schedule, ALGORITHM_VERSION};
use quicklang_storage_port::{Clock, CommitResult, ReviewRepository};

pub fn rate_card(
    repository: &mut impl ReviewRepository,
    clock: &impl Clock,
    event_id: &str,
    card_id: &str,
    expected_version: u64,
    rating: Rating,
) -> Result<CommitResult, AppError> {
    if event_id.is_empty() || card_id.is_empty() || event_id.len() > 128 || card_id.len() > 128 {
        return Err(AppError::new(
            "INVALID_INPUT",
            "Invalid review identifiers",
            false,
        ));
    }
    if let Some(event) = repository.find_event(event_id)? {
        if event.card_id != card_id || event.rating != rating {
            return Err(AppError::new(
                "EVENT_CONFLICT",
                "Event ID reused for a different review",
                false,
            ));
        }
        return Ok(CommitResult::AlreadyApplied(repository.load(card_id)?));
    }
    let previous = repository.load(card_id)?;
    if previous.version != expected_version {
        return Err(AppError::new(
            "SESSION_STALE",
            "Review state changed; reload the card",
            true,
        ));
    }
    let now = clock.now_ms();
    let next = schedule(&previous, rating, now)?;
    let event = ReviewEvent {
        id: event_id.into(),
        card_id: card_id.into(),
        reviewed_at: now,
        rating,
        algorithm_version: ALGORITHM_VERSION.into(),
    };
    repository.commit(expected_version, event, next)
}
