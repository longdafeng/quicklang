# P5.1 independent implementation review

- Started: 2026-10-05 20:08:18 CST.
- Completed: 2026-10-05 20:09:50 CST; elapsed 1 minute 32 seconds.
- Scope: import storage, UI owner/epoch coordination, IPC worker guard, schemas and six import contracts. The parser authored by this reviewer was excluded.
- Method: source review only; no Cargo or shared native build outputs were touched.

## Confirmed finding

### P2: stale disabled cancel button after a pending write is invalidated

`LongtermImport.tsx:40-50,141-143,201` uses `writing.current` directly for the cancel button's disabled property. When a same-owner epoch replacement happens during a pending import, the subscriber increments `generation`, clears preview and busy, and renders while `writing.current` is still true. When that native request later settles, `finally` changes the ref to false but skips its state update because the ticket differs from the new generation. Ref mutation alone does not render, so the cancel button remains disabled after the write has settled.

This is not a permanent busy deadlock: the subscriber already calls `setBusy(false)`, and clicking the enabled import entry can clear the message and produce another render. Nevertheless, the displayed cancellation state is stale. The existing tests cover epoch replacement before confirmation and an owner switch after submission, but not same-owner replacement during a pending write. The UI owner was notified to add this case and represent writing state with React state, while keeping the ref as the synchronous double-submit guard.

## Verified boundaries

- Workspace remounts all import state with `key={owner}`; old reads and native responses are discarded through the old instance's `live` flag/generation. File reads additionally compare captured epoch after parsing.
- Submission passes the preview epoch into `invokeAppStateCommand`; queued commands retain it through the replacement barrier. Native `longterm_guarded` rejects mismatched epochs before invoking the storage closure.
- Import executes in the outer repository transaction. Invalid identities in later entries unwind the whole batch; the six contract cases explicitly cover retained-receipt conflicts and owner/global-ID conflicts after an earlier insert.
- Existing normalized words do not invoke `add`, so they retain cards, schedules and events. New words receive only one per-word Add receipt. There is no batch receipt containing other words.
- Physical deletion removes the target card and events. The additional private-receipt unit test directly reads `payload_hash/result_json` and ensures the other word's retained receipt contains no deleted spelling.
- `card_id` and `event_id` are global primary keys in both backend schemas. Dedup reads use the unique `(user_id, normalized_spelling)` index; collision checks use primary keys. Conflicts reveal no other owner's spelling.
- Receipt hashing is performed on a single-word `Action::Add`, not on the full import envelope. The three in-memory sets are HashSets, so the import avoids quadratic batch hashing or repeated linear dedup scans.
- Unknown transport outcomes disable repeat confirmation. Reconciliation is read-only until the learner explicitly discards the request and selects another file. There is no automatic recreation.
- New backend and component named functions have English documentation; comments examined in the new modules are English.

## Performance observation

For a new word with no receipt, the implementation executes seven indexed SQL statements: outer prepare, candidate check, operation check, inner replay, inner prepare, card insert, event insert. Thus 10,000 new words produce approximately 70,000 execute calls within one transaction. This is a source-confirmed constant-factor cost, not evidence of an observed latency failure or an unindexed scan. The duplicated prepare/replay reads could be consolidated later without weakening identity checks; this review did not benchmark or change them.

Review findings were delivered to root and the UI owner at 20:09 CST. The UI owner retains sole ownership of the fix and regression test; this review changed no production source or test files.

## Independent fix verification and design calibration

- Started: 2026-10-05 20:12:02 CST.
- Completed: 2026-10-05 20:13:09 CST; elapsed 1 minute 7 seconds.
- The confirmed P2 finding above is resolved in the reviewed current source. `submitting` is now React state, while `writing.current` remains the synchronous mutex. Epoch replacement clears the old preview but leaves submitting true until the old request settles. `finally` clears submitting whenever the instance is live, even when its ticket was invalidated. All selection/confirmation/cancel controls now observe the state, so settlement renders them enabled without another user action. A stale native success still cannot publish its message or refresh the new view.
- Independently ran only `tests/unit/ui/longterm-import.test.tsx` with `--reporter=dot`, avoiding the shared JUnit report. Eight tests passed, including the new same-owner replacement during a pending write, controls remaining locked until settlement, discarded stale result, and a later explicit file selection using a fresh epoch and identities. Start 20:13:01 CST, Vitest duration 747 ms; log `build/p51-import-independent-ui-review.log`.
- Rechecked the backend transaction and per-word hash/receipt boundaries from the earlier review; no new confirmed backend issue. No Cargo commands or full UI suite were run by this reviewer. The parent's complete validation remains separate.
- Updated only the three assigned design documents to describe the implemented P5.1 formats, limits, owner/epoch preview, transaction rollback, unchanged existing learning facts, per-word receipts and uncertain-result policy. Corrected the obsolete exercise-kind uniqueness wording and nonexistent native schema path. Kept the iOS picker interaction blocked and retained the old verification numbers as historical evidence, without claiming the new full regression has passed. `git diff --check` passed.
