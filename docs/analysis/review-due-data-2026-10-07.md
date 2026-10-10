# Review due-date analysis (2026-10-07)

Read-only MySQL queries against the running local QuickLang seekdb instance at 00:21 Asia/Shanghai. No application data was changed. Evidence snapshot: `build/review-due-analysis/read-only-data.json` (local user data; not intended for publication).

## Observed data

- 24 retained cards: 23 unmastered cards due on October 7, one mastered card (`alliance`) due November 5 at 22:55.
- At 00:21, zero cards had `due_at <= now`; all 23 October 7 cards were still in the future.
- 9 cards become due from 01:14 through 01:52; `abandonment` at 11:37; 13 cards from 22:36 through 23:49.
- Examples: `accrue` reviewed October 6 at 01:14, due October 7 at 01:14; `abdomen` reviewed October 6 at 22:36, due October 7 at 22:36.
- Schedule distribution: 17 cards at step 1 / interval 1 day, 6 at step 0 / interval 1 day, one at step 5 / interval 30 days.
- Retained formal first answers: 24, including 19 Good and 5 Again, giving 79.17%; ordinary errors 18 plus 5 first-answer Again = 23 errors. These match the screenshot.
- Two early/practice answers occurred October 7 at 00:18. They do not contribute to today's formal reviewed count or change the formal due dates.

## Code findings

`src/crates/scheduler/src/longterm.rs` computes due time as effective answer/error time plus interval × 24 hours; it does not make cards due at midnight. `ordinary.rs` resets an existing card to the Again schedule after an ordinary spelling error. New errors can therefore postpone a previously scheduled review to 24 hours after the error.

`longterm_v2/sessions.rs` selects formal cards using `due_at <= now`, retaining overdue cards. Midnight by itself cannot remove unanswered overdue cards.

The current working-tree dashboard uses the same `due_at <= now` predicate but labels it "今日待复习". The HEAD version instead counts all cards before local end-of-day. This is an existing uncommitted change, not an edit made during this investigation. The installed executable modification time is October 7 00:12; that timestamp alone does not establish its exact source revision.

## Assessment

The current zero is correct for "available now". The data show 23 cards scheduled for today, so the UI label obscures that distinction. The midnight transition alone does not explain the reported prior 23; possible stale display or a change in counting semantics cannot be distinguished without the prior screenshot/request data or exact installed revision. Do not claim that those cards were lost.

Recommended UI: show "当前可复习 0", "今日稍后到期 23", and "下次到期 01:14"; enable formal review only for currently due cards. Keep explicit practice available. Refresh automatically at the next due time and the local day boundary. If the product instead intends a daily review batch, change both formal selection and dashboard to a shared local-day predicate and document that scheduling change.
