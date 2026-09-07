use quicklang_application::rate_card;
use quicklang_domain::{AppError, Rating, ReviewEvent, ReviewState};
use quicklang_storage_port::{Clock, CommitResult, ReviewRepository};
use std::collections::HashMap;

#[derive(Default)]
struct MemoryRepository {
    states: HashMap<String, ReviewState>,
    events: HashMap<String, ReviewEvent>,
    fail_commit: bool,
}
impl ReviewRepository for MemoryRepository {
    fn load(&self, id: &str) -> Result<ReviewState, AppError> {
        self.states
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::new("NOT_FOUND", "Missing card", false))
    }
    fn find_event(&self, id: &str) -> Result<Option<ReviewEvent>, AppError> {
        Ok(self.events.get(id).cloned())
    }
    fn commit(
        &mut self,
        version: u64,
        event: ReviewEvent,
        next: ReviewState,
    ) -> Result<CommitResult, AppError> {
        if self.fail_commit {
            return Err(AppError::new("DB_WRITE_FAILED", "Injected failure", true));
        }
        if let Some(existing) = self.events.get(&event.id) {
            if existing != &event {
                return Err(AppError::new("EVENT_CONFLICT", "Conflicting event", false));
            }
            return Ok(CommitResult::AlreadyApplied(self.load(&event.card_id)?));
        }
        if self.load(&event.card_id)?.version != version {
            return Err(AppError::new("SESSION_STALE", "Version conflict", true));
        }
        self.states.insert(next.card_id.clone(), next.clone());
        self.events.insert(event.id.clone(), event);
        Ok(CommitResult::Applied(next))
    }
}
struct FixedClock;
impl Clock for FixedClock {
    fn now_ms(&self) -> i64 {
        1000
    }
}
fn store() -> MemoryRepository {
    let mut r = MemoryRepository::default();
    r.states.insert("a".into(), ReviewState::new("a", 0));
    r
}
#[test]
fn event_retry_is_idempotent_even_with_old_version() {
    let mut r = store();
    rate_card(&mut r, &FixedClock, "e", "a", 0, Rating::Good).unwrap();
    assert!(matches!(
        rate_card(&mut r, &FixedClock, "e", "a", 0, Rating::Good).unwrap(),
        CommitResult::AlreadyApplied(_)
    ));
    assert_eq!(r.events.len(), 1);
    assert_eq!(r.load("a").unwrap().version, 1);
}
#[test]
fn stale_review_and_reused_event_id_do_not_mutate_state() {
    let mut r = store();
    rate_card(&mut r, &FixedClock, "e", "a", 0, Rating::Good).unwrap();
    assert_eq!(
        rate_card(&mut r, &FixedClock, "e", "a", 0, Rating::Again)
            .unwrap_err()
            .code,
        "EVENT_CONFLICT"
    );
    assert_eq!(
        rate_card(&mut r, &FixedClock, "f", "a", 0, Rating::Good)
            .unwrap_err()
            .code,
        "SESSION_STALE"
    );
    assert_eq!(r.events.len(), 1);
    assert_eq!(r.load("a").unwrap().version, 1);
}
#[test]
fn failed_transaction_leaves_event_and_schedule_unchanged() {
    let mut r = store();
    r.fail_commit = true;
    assert!(rate_card(&mut r, &FixedClock, "e", "a", 0, Rating::Good).is_err());
    assert!(r.events.is_empty());
    assert_eq!(r.load("a").unwrap().version, 0);
}
