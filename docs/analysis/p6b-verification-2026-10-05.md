# P6b verification

Completed: 2026-10-05T19:13:50+08:00. Branch: codex/issue-45-review-notebook, rebased on origin/main 7e347898 (0.8.0).

## Verified results

| Check | Result | Evidence |
| --- | --- | --- |
| Canonical make test | Passed format, strict Clippy, workspace Rust tests, TypeScript, full UI and script tests | build/p6b-make-test-rebased-verified.log |
| Full UI | 86 files, 773 passed | same canonical log; build/p6b-ui-full-rebased.log |
| SQLite storage | 56 passed | build/p6b-storage-rebased.log |
| Real seekdb longterm storage | 14 passed, none skipped | build/p6b-final-native-storage.log |
| Real seekdb contracts | 25 passed | build/p6b-final-native-contracts.log |
| SQLite contracts | 25 passed | build/p6b-final-sqlite-contracts.log |
| Epoch/projection native worker regression | 1 passed | build/p6b-epoch-native.log |
| Actual macOS picker save/cancel | Passed in isolated native harness | build/p6b-export/actual-picker-save.log and actual-picker-cancel.log |
| Layout | Desktop1100/mobile viewport380, dialogs and owner-switch selection passed via CUA WKWebView | Isolated mock read-model fixture under build/p6b-ui-browser |
| Canonical desktop Debug build | Passed bundle and local signature verification | build/p6b-final-desktop-build.log |

## Full-scale Dev/SQLite benchmark

20,000 cards and 1,000,000 events. Five repetitions per query. Mean list timings: 0.680-0.727ms; detail 0.611ms; dashboard 198.239ms (sample max199.893ms). Stream export: 248,498,541 bytes in15.561s to a counting sink. This is descriptive measurement, not P95 certification; file I/O and peak memory were not measured.

The first full run exposed missing owner/identity export indexes and a wide dashboard aggregate. Both were corrected; final benchmark completed. Portable user state now uses a single document revision/CAS and epoch guard; ordinary grade preserves upstream learned/counted/retry rules. Canonical write IPC returns committed revision projection.

Live chat/transcription tests were skipped because .env.test lacks real-model configuration. iOS builds, iOS picker, physical-device checks and broader Apple regressions remain P6c. Mock layout plus native harness is not a complete production-app UI-to-Tauri-to-filesystem end-to-end test. No application installation, main merge or publication occurred.
