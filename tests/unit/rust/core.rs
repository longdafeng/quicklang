use quicklang_domain::{Phase, Rating, ReviewState, DAY_MS};
use quicklang_scheduler::schedule;
use quicklang_typing_engine::{evaluate, TypingMetrics};

#[test]
fn new_good_then_good_advances_one_then_six_days() {
    let first = schedule(&ReviewState::new("a", 0), Rating::Good, 100).unwrap();
    assert_eq!(first.interval_days, 1);
    assert_eq!(first.due_at, 100 + DAY_MS);
    let second = schedule(&first, Rating::Good, first.due_at).unwrap();
    assert_eq!(second.interval_days, 6);
    assert_eq!(second.reps, 2);
}
#[test]
fn lapse_resets_streak_but_retains_history() {
    let learned = schedule(&ReviewState::new("a", 0), Rating::Good, 0).unwrap();
    let failed = schedule(&learned, Rating::Again, DAY_MS).unwrap();
    assert_eq!(failed.phase, Phase::Relearning);
    assert_eq!(failed.lapses, 1);
    assert_eq!(failed.reps, 0);
    assert_eq!(failed.version, 2);
    assert_eq!(failed.due_at, DAY_MS + 60_000);
}
#[test]
fn initial_failure_is_learning_not_a_lapse() {
    let state = schedule(&ReviewState::new("a", 0), Rating::Again, 0).unwrap();
    assert_eq!(state.lapses, 0);
    assert_eq!(state.phase, Phase::Learning);
}
#[test]
fn repeated_failures_do_not_inflate_lapse_count() {
    let first = schedule(&ReviewState::new("a", 0), Rating::Again, 0).unwrap();
    let second = schedule(&first, Rating::Again, 60_000).unwrap();
    assert_eq!(second.phase, Phase::Learning);
    assert_eq!(second.lapses, 0);
    let learned = schedule(&second, Rating::Good, 120_000).unwrap();
    let failed = schedule(&learned, Rating::Again, 180_000).unwrap();
    let failed_again = schedule(&failed, Rating::Again, 240_000).unwrap();
    assert_eq!(failed_again.lapses, 1);
    assert_eq!(failed_again.phase, Phase::Relearning);
}
#[test]
fn scheduler_checks_invalid_state_and_overflow() {
    let mut state = ReviewState::new("a", 0);
    assert!(schedule(&state, Rating::Easy, i64::MAX).is_err());
    state.ease = f64::NAN;
    assert!(schedule(&state, Rating::Good, 0).is_err());
    state.ease = 2.5;
    state.version = u64::MAX;
    assert!(schedule(&state, Rating::Again, 0).is_err());
}
#[test]
fn hard_never_reduces_interval_and_ease_is_bounded() {
    let mut state = ReviewState::new("a", 0);
    for _ in 0..200 {
        state = schedule(&state, Rating::Hard, 0).unwrap();
    }
    assert!(state.interval_days >= 200);
    assert_eq!(state.ease, 1.3);
}
#[test]
fn normalization_and_extra_characters_are_checked() {
    let result = evaluate("café", "ＣＡＦÉ", &TypingMetrics::default()).unwrap();
    assert!(result.correct);
    assert_eq!(result.suggested_rating, Rating::Good);
    let result = evaluate("word", "word ", &TypingMetrics::default()).unwrap();
    assert!(!result.correct);
    assert_eq!(result.mismatches, vec![4]);
    assert!(
        !evaluate("re-enter", "reenter", &TypingMetrics::default())
            .unwrap()
            .correct
    );
}
#[test]
fn corrected_and_hinted_answers_are_not_easy() {
    assert_eq!(
        evaluate(
            "a",
            "a",
            &TypingMetrics {
                hint_count: 1,
                backspaces: 0
            }
        )
        .unwrap()
        .suggested_rating,
        Rating::Again
    );
    assert_eq!(
        evaluate(
            "a",
            "a",
            &TypingMetrics {
                hint_count: 0,
                backspaces: 1
            }
        )
        .unwrap()
        .suggested_rating,
        Rating::Hard
    );
    assert!(evaluate("", "a", &TypingMetrics::default()).is_err());
    assert!(evaluate("a", &"a".repeat(1025), &TypingMetrics::default()).is_err());
}
#[test]
fn seekdb_never_silently_falls_back() {
    let result =
        quicklang_storage_seekdb::SeekDbEmbeddedAdapter::open(std::path::Path::new("unused"));
    assert_eq!(result.err().unwrap().code, "DB_NOT_CONFIGURED");
}
#[test]
fn sync_rejects_duplicate_ids_and_large_batches() {
    use quicklang_domain::ReviewEvent;
    use quicklang_sync_core::PushBatch;
    let event = ReviewEvent {
        id: "e".into(),
        card_id: "a".into(),
        reviewed_at: 0,
        rating: Rating::Good,
        algorithm_version: "v1".into(),
    };
    assert!(PushBatch {
        device_id: "d".into(),
        events: vec![event.clone()]
    }
    .validate()
    .is_ok());
    assert!(PushBatch {
        device_id: "d".into(),
        events: vec![event.clone(), event.clone()]
    }
    .validate()
    .is_err());
    assert!(PushBatch {
        device_id: "d".into(),
        events: vec![event; 501]
    }
    .validate()
    .is_err());
}
