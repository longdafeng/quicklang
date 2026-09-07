//! QuickLang's independently implemented, explicitly versioned SM-2-inspired variant.
use quicklang_domain::{AppError, Phase, Rating, ReviewState, DAY_MS};
pub const ALGORITHM_VERSION: &str = "quicklang-sm2-v1";

pub fn schedule(previous: &ReviewState, rating: Rating, now: i64) -> Result<ReviewState, AppError> {
    if !previous.ease.is_finite()
        || !(1.3..=3.0).contains(&previous.ease)
        || now < 0
        || previous.interval_days > 36_500
    {
        return Err(AppError::new(
            "INVALID_REVIEW",
            "Invalid review state or time",
            false,
        ));
    }
    let mut next = previous.clone();
    next.version = next.version.checked_add(1).ok_or_else(overflow)?;
    match rating {
        Rating::Again => {
            next.phase = if matches!(previous.phase, Phase::New | Phase::Learning) {
                Phase::Learning
            } else {
                Phase::Relearning
            };
            next.lapses = next
                .lapses
                .checked_add(u32::from(previous.phase == Phase::Review))
                .ok_or_else(overflow)?;
            next.reps = 0;
            next.interval_days = 0;
            next.ease = (next.ease - 0.2).max(1.3);
            next.due_at = now.checked_add(60_000).ok_or_else(overflow)?;
        }
        _ => {
            next.reps = next.reps.checked_add(1).ok_or_else(overflow)?;
            next.phase = Phase::Review;
            let (multiplier, ease_delta) = match rating {
                Rating::Hard => (1.2, -0.15),
                Rating::Good => (previous.ease, 0.0),
                Rating::Easy => (previous.ease * 1.3, 0.15),
                Rating::Again => unreachable!(),
            };
            next.interval_days = if previous.reps == 0 {
                if rating == Rating::Easy {
                    4
                } else {
                    1
                }
            } else if previous.reps == 1 && rating != Rating::Hard {
                if rating == Rating::Easy {
                    8
                } else {
                    6
                }
            } else {
                ((previous.interval_days.max(1) as f64 * multiplier).round() as u32)
                    .max(previous.interval_days.saturating_add(1))
                    .min(36_500)
            };
            next.ease = (next.ease + ease_delta).clamp(1.3, 3.0);
            next.due_at = now
                .checked_add(i64::from(next.interval_days) * DAY_MS)
                .ok_or_else(overflow)?;
        }
    }
    Ok(next)
}
fn overflow() -> AppError {
    AppError::new("INVALID_REVIEW", "Review state overflow", false)
}
