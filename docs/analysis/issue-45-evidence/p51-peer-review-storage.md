# P5.1 peer review by import_storage

Reviewed the parser and import UI read-only; no peer source edits were made.

## Findings

1. Parser bounds do not yet validate the length after NFKC/lowercase expansion. `"ﬃ".repeat(100)` passes the preview's original 256-character check, but expands to 300 characters and is rejected by backend `prepare_card`. This is atomic and cannot corrupt storage, but confirmation misleadingly reports an uncertain result for deterministically invalid input. Root was notified; add normalized-key length validation and an expansion regression.
2. Strict UTF-8 decoding is verified only in the binary `File.arrayBuffer()` path. The legacy `File.text()` fallback accepts replacement decoding because original bytes are unavailable. Modern production WebViews support the binary path; fallback validation is weaker. Prefer a binary FileReader fallback or explicit unsupported-read rejection if retaining compatibility is unnecessary.

## Passing review scope

- Parser enforces supported extension, 32 MiB metadata and actual content limits, a 10,000-entry limit before deduplication, first-spelling order, string/nonempty/code-point bounds, leading BOM and CRLF handling.
- Versioned JSON supports only word-list v1 or longterm v2 with all required arrays. It extracts `displaySpelling` only and does not copy source owner, schedules, sessions, history or raw answers. Malformed entries abort the entire preview.
- UI freezes per-word operation/candidate identities at preview time; explicit confirmation remains separate from parsing. Owner keyed Workspace unmount discards departed UI results.
- UI checks captured epoch both before and after parsing and submission. Native IPC uses `invokeAppStateCommand` with the frozen epoch.
- Pending-write restoration clears stale preview and increments generation without clearing the `writing`/`submitting` mutex. Settlement unlocks controls but does not publish or refresh stale results. The new test verifies a subsequent fresh-epoch request receives new identities.
- Transport uncertainty never automatically retries. Refresh is read-only, cancellation does not send an import command.

## Test stages

Native seekdb import contracts: 6 passed, 0 failed, 0 ignored; 13.133 seconds including compilation/runner. Native per-word receipt deletion: 1 passed, 0 failed; 5.219 seconds including compilation/runner. Exact start/end Unix timestamps are in `build/p51-stage-timings.json`. Canonical `make test` passed: format, strict Clippy, Rust workspace, TypeScript, 97 UI files / 977 tests, scripts 174 passed / 1 skipped. AI chat/transcription live checks skipped because `.env.test` does not configure them. No build or test failure was retried. Desktop Cargo ownership was released to root after completion.

## Stage timing (Asia/Shanghai)

| Stage | Start | End | Seconds | Status |
| --- | --- | --- | ---: | --- |
| native_import_contracts | 2026-10-05T20:12:01.738+08:00 | 2026-10-05T20:12:14.872+08:00 | 13.133 | PASS |
| native_import_receipts | 2026-10-05T20:12:28.682+08:00 | 2026-10-05T20:12:33.901+08:00 | 5.219 | PASS |
| make_test | 2026-10-05T20:12:48.936+08:00 | 2026-10-05T20:14:04.079+08:00 | 75.143 | PASS |

## Independent normalized-length fix review

The parser now checks `Array.from(key).length > 256` immediately after NFKC/lowercase and before deduplication. Rust `prepare_card` validates the same normalized value with `.chars().count()`, so both count Unicode scalar/code-point units rather than UTF-16 units. For the confirmed ligature case, `ﬃ` expands to `ffi`: 85 repetitions plus `a` produce exactly 256 and are accepted; plus `ab` produce 257 and are rejected. The new regression covers TXT and compact JSON rejection, the exact accepted boundary, and the first rejected boundary. The previously reported normalized-length finding is resolved in the reviewed source; final complete UI test execution is running separately. No peer source edits or Cargo commands were used for this review.

Final UI verification after the normalized-length fix passed: 97 files / 978 tests, exit 0. Start 2026-10-05 20:16:03.704 CST, end 20:16:19.768 CST, complete command wall-clock 16.064 seconds (Vitest internal duration 15.61 seconds). Logs: `build/p51-final-ui.log`, exact metadata: `build/p51-final-ui-timings.json`. This used only the dot reporter and did not write the shared JUnit report or native build outputs.
