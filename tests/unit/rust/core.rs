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
    let result = quicklang_storage_seekdb::SeekDbEmbeddedAdapter::open_with_runtime(
        std::path::Path::new("unused"),
        std::path::Path::new("missing-runtime"),
    );
    let expected = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "DB_RUNTIME_MISSING"
    } else {
        "UNSUPPORTED_PLATFORM"
    };
    assert_eq!(result.err().unwrap().code, expected);
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

#[test]
fn scheduler_easy_has_four_then_eight_day_initial_intervals() {
    let first = schedule(&ReviewState::new("a", 0), Rating::Easy, 0).unwrap();
    let second = schedule(&first, Rating::Easy, first.due_at).unwrap();
    assert_eq!(first.interval_days, 4);
    assert_eq!(second.interval_days, 8);
    assert!(second.ease > first.ease);
}
#[test]
fn scheduler_rejects_each_invalid_numeric_boundary() {
    for ease in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1.29, 3.01] {
        let mut state = ReviewState::new("a", 0);
        state.ease = ease;
        assert!(schedule(&state, Rating::Good, 0).is_err());
    }
    assert!(schedule(&ReviewState::new("a", 0), Rating::Good, -1).is_err());
    let mut state = ReviewState::new("a", 0);
    state.interval_days = 36_501;
    assert!(schedule(&state, Rating::Good, 0).is_err());
}
#[test]
fn scheduler_rejects_counter_overflow_without_mutation() {
    let mut state = ReviewState::new("a", 0);
    state.reps = u32::MAX;
    assert!(schedule(&state, Rating::Good, 0).is_err());
    assert_eq!(state.reps, u32::MAX);
    state.phase = Phase::Review;
    state.lapses = u32::MAX;
    assert!(schedule(&state, Rating::Again, 0).is_err());
    assert_eq!(state.lapses, u32::MAX);
}
#[test]
fn scheduler_caps_long_intervals_and_ease() {
    let mut state = ReviewState::new("a", 0);
    state.reps = 10;
    state.interval_days = 36_500;
    state.ease = 3.0;
    let result = schedule(&state, Rating::Easy, 0).unwrap();
    assert_eq!(result.interval_days, 36_500);
    assert_eq!(result.ease, 3.0);
    assert_eq!(result.due_at, 36_500 * DAY_MS);
}
#[test]
fn scheduler_due_date_overflow_is_checked_for_success_and_failure() {
    for rating in [Rating::Again, Rating::Hard, Rating::Good, Rating::Easy] {
        assert!(schedule(&ReviewState::new("a", 0), rating, i64::MAX - 1).is_err());
    }
}
#[test]
fn typing_combining_unicode_and_case_are_equivalent() {
    for (expected, actual) in [
        ("café", "cafe\u{301}"),
        ("ABC", "ａｂｃ"),
        ("office", "oﬃce"),
    ] {
        let result = evaluate(expected, actual, &TypingMetrics::default()).unwrap();
        assert!(result.correct);
        assert!(result.mismatches.is_empty());
    }
}
#[test]
fn typing_mismatch_positions_are_characters_not_utf8_bytes() {
    let result = evaluate("a😀c", "a😀d!", &TypingMetrics::default()).unwrap();
    assert_eq!(result.mismatches, vec![2, 3]);
    assert_eq!(result.suggested_rating, Rating::Again);
}
#[test]
fn typing_accepts_exact_byte_limit_but_rejects_multibyte_overflow() {
    assert!(
        evaluate(
            &"a".repeat(1024),
            &"a".repeat(1024),
            &TypingMetrics::default()
        )
        .unwrap()
        .correct
    );
    assert!(evaluate(&"é".repeat(513), "", &TypingMetrics::default()).is_err());
    assert!(evaluate("a", &"é".repeat(513), &TypingMetrics::default()).is_err());
}
#[test]
fn typing_empty_answer_marks_all_expected_characters_wrong() {
    let result = evaluate("cat", "", &TypingMetrics::default()).unwrap();
    assert_eq!(result.mismatches, vec![0, 1, 2]);
    assert!(!result.correct);
}
#[test]
fn typing_hint_takes_precedence_over_backspaces() {
    assert_eq!(
        evaluate(
            "a",
            "a",
            &TypingMetrics {
                hint_count: 1,
                backspaces: 1
            }
        )
        .unwrap()
        .suggested_rating,
        Rating::Again
    );
}
#[test]
fn sync_validates_device_and_event_boundaries() {
    use quicklang_domain::ReviewEvent;
    use quicklang_sync_core::PushBatch;
    let valid = ReviewEvent {
        id: "e".into(),
        card_id: "a".into(),
        reviewed_at: 0,
        rating: Rating::Good,
        algorithm_version: "v1".into(),
    };
    for device in [String::new(), "d".repeat(129)] {
        assert!(PushBatch {
            device_id: device,
            events: vec![valid.clone()]
        }
        .validate()
        .is_err());
    }
    for event in [
        ReviewEvent {
            id: String::new(),
            ..valid.clone()
        },
        ReviewEvent {
            id: "e".repeat(129),
            ..valid.clone()
        },
        ReviewEvent {
            card_id: String::new(),
            ..valid.clone()
        },
        ReviewEvent {
            reviewed_at: -1,
            ..valid.clone()
        },
    ] {
        assert!(PushBatch {
            device_id: "d".into(),
            events: vec![event]
        }
        .validate()
        .is_err());
    }
}
#[test]
fn sync_accepts_maximum_unique_batch_and_empty_batch() {
    use quicklang_domain::ReviewEvent;
    use quicklang_sync_core::PushBatch;
    let events = (0..500)
        .map(|i| ReviewEvent {
            id: format!("e-{i}"),
            card_id: "a".into(),
            reviewed_at: i,
            rating: Rating::Good,
            algorithm_version: "v1".into(),
        })
        .collect();
    assert!(PushBatch {
        device_id: "d".repeat(128),
        events
    }
    .validate()
    .is_ok());
    assert!(PushBatch {
        device_id: "d".into(),
        events: vec![]
    }
    .validate()
    .is_ok());
}
