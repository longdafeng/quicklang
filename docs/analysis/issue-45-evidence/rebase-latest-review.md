# Latest-main rebase independent review

Start: 2026-10-05 19:41:09 +08:00. Review baseline HEAD: `a27f6fe188b410a739bfcacc6c79e81612ffec58` plus the current uncommitted ordinary-activity/earned/timezone diff. Scope is a focused read-only review; no source changes, Cargo execution or new test-pass claims.

## Findings

No confirmed correctness bug found in the reviewed paths. No P0/P1/P2 finding is raised from this review.

- `ordinary.rs:29–44`: earned preserves an existing value or initializes to correct plus the retained correct retry entries before appending a wrong result. This matches upstream earnedAnswers/grade(false); a wrong answer cannot erase cumulative correct rewards across retry rounds.
- `ordinary.rs:78–118`: learning-activity increments only spell, retaining the other four mode counters. The BTreeMap initially loads existing legacyDays and then inserts original spell-activity rows: original legacy data wins same-date collisions, matching upstream adoptLegacySpellingActivity at learningActivity.ts:195–202. Only real calendar rows are adopted; the original legacy document remains unchanged so anomalous dates remain available to upstream reporting. The retained rows are sorted and bounded to 365.
- `ordinary.rs:153–160`: timezone offset is restricted to ±840 minutes and added using checked arithmetic before persistence/replay. Epoch and owner scoping remain enforced by the native storage worker and repository. offset is part of the serialized command hash, so changing it while reusing operationId conflicts rather than changing a prior result.
- `Spelling.tsx:552–580`: one pending attempt freezes operationId, epoch, expectedVersion, occurredAt and offset. Identical retries reuse the frozen offset; evaluation generation fencing prevents a response from applying after component lifetime changes. LearningApp keys Spelling by profile/page/book, clearing pending refs across owner or mode changes.
- `ordinary.rs:173–222`: current ordinary question transition, card/event changes and user document revision save run inside longterm_v2::execute's single transaction; activity failure aborts before publication. UTC now still drives event occurrence and scheduler; shifted local time is used only for the activity date.
- `Spelling.tsx`: correct answers and English review use upstream grade + activityChanges; English review errors preserve onWrong. Ordinary English spell errors use native atomic grade/card/vocabulary writes without a duplicate onWrong write. Chinese modes return before typed submit and retain upstream ASR grading: incorrect/silence outcomes do not increment activity or wrong-word writes.
- `LearningApp.tsx:279–292`: all four upstream modes are mounted with mode and current profile identity. The longterm workspace remains lazy-opened and preserved across routes; it does not replace upstream Chinese/review routes.

## Documentation and boundary checks

New Rust increment_activity and date helper have English rustdoc. The new offset field has an English doc comment; existing TypeScript submit is pre-existing, while newly frozen state follows its documented pending-attempt responsibility. No new source/helper without a documentation comment was identified within this diff. Repository concerns stay out of the UI; UI sends explicit frozen command data.

## Evidence limits

This is static review of the listed file content and upstream learningActivity/session rules, not a fresh canonical test run. Root reported full UI 932 PASS; this agent did not independently execute it. Native simulator build is running separately. No actual iOS document-provider picker, microphone hardware or full production-app end-to-end acceptance was performed here. The candidate tests cover legacy/mode preservation, earned, cross-date offset and rejection; their existence alone is not a passing result.

## Exact reviewed content

- `src/crates/storage-seekdb/src/longterm_v2/ordinary.rs` SHA256 `93a5c69d28112e7eb11b19039e721490177abfb00e19c4568d8ee62b37b9b147`
- `src/ui/src/shared/features/spelling/Spelling.tsx` SHA256 `d77a1016802fc1296f398ecd9d8c09972beb4f2d4fc30c7c7bbaa8760f6fb7b7`
- `src/ui/src/shared/app/LearningApp.tsx` SHA256 `e9c9933c4143574e4180dbf9925b9bea13fb82b3dcb895905a92f04943c971b5`
- `src/ui/src/shared/native/longterm.ts` SHA256 `0625377c99a8c4ac841313005613862c288b2d148f26585acb03d8395c2f5b75`
- `src/crates/storage-api/src/longterm.rs` SHA256 `57f7e58441b866490b08c8abd1b439ab741c30c56f9b9b9ae59a7d1ee4f6f12c`

End: 2026-10-05 19:42:09 +08:00. Duration: 60 seconds.
