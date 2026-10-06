# P5.1 independent backend and parser review

Reviewed on 2026-10-05 against the frozen integration source. This reviewer implemented the import UI; the backend and parser were implemented by independent agents. No source files were modified during this review.

## Concrete finding

- Parser/backend normalization length mismatch: `parseLongtermImport` checked only the original spelling's 256-code-point limit. `"ﬃ".repeat(100)` passes that check but normalizes to 300 characters. `prepare_card` rejects it, rolling back the whole import after the user has confirmed a supposedly valid preview. Reported to root for parser correction and regression coverage. Backend already has a focused normalized-expansion contract test. Do not call this finding fixed until the parser change is verified.

## Backend conclusions

- `longterm_v2::execute` wraps the entire `Action::Import` in one native transaction. Later invalid entries, occupied identities or receipt conflicts propagate an error and roll back earlier cards/events. Existing contracts specifically place a valid new word before the failing entry.
- `import::words` scopes normalized word lookup to the command owner. It also checks globally occupied candidate/event identities and returns a generic conflict rather than disclosing another owner's data.
- Existing words contribute `existingCount` without calling `add`, updating scheduling, or writing a new event. New words reuse the focused single-word add implementation, starting at step 0 with zero error count. Duplicate normalized words are still validated before being counted as duplicates.
- Each newly inserted word has a receipt hash/result built from an `Action::Add` containing that word alone. No aggregate import receipt or batch payload is persisted. Deletion removes that word's card/events; another word's retained receipt does not contain the deleted spelling. The storage test directly examines private `result_json` after deleting one word.
- The importer does not restore source ownership, sessions, schedules, scores, or raw answers. Bounds are 1–10,000 entries and 256 characters for both original and normalized spelling. Entries use opaque client-frozen identities; normal UI creation generates fresh UUIDs.
- Historical deletion markers are intentionally absent. A caller presenting a fresh explicit import is treated as a new creation; there is no retained deletion record to recognize it as a former deleted operation. The UI prevents automatic retry of an uncertain old import.

## Parser conclusions

- Filename extensions are limited to TXT/JSON. File bytes and encoded text each enforce the 32 MiB limit; production `arrayBuffer` reads use fatal UTF-8 decoding. The text fallback is compatibility-only and still checks encoded size.
- JSON requires either `quicklang-longterm-words` version 1 with a words array or `quicklang-longterm` version 2 with all four export arrays. Foreign user backups and unsupported versions fail before preview.
- Export card entries contribute only `displaySpelling`. Source owner, IDs and all learning history are discarded. History array contents deliberately do not affect word-only import.
- The raw entry count is checked before deduplication, including repeated entries; blank TXT lines are ignored. Every remaining entry must be a nonempty string. NFKC plus lowercase deduplication retains the first display spelling. The concrete normalized-length finding above remains the only issue identified in this static pass.

## iOS architecture validation

Command used project-local Cargo/Rustup caches, `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, `CARGO_PROFILE_DEV_DEBUG=1`, `CARGO_TARGET_DIR=build/ios/cargo`, and `cargo check -p quicklang-app --lib --target aarch64-apple-ios --locked --offline`.

- Exit 0; Cargo reported 16.77 seconds. Start observed 20:12:12 CST, completion observed 20:12:43 CST while static review ran in parallel.
- Log: `build/p51-ios-device-check.log`.
- 34 platform-configuration warnings remain; this is a successful architecture compile check, not a warning-free native package build.
- No cache deletion, helper signing change, native installation, simulator canonical build, or commit was performed. The iOS output lock was released on completion.
