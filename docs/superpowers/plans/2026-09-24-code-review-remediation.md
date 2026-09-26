# Code Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed AI, recording-compatibility, module-reuse, and test-matrix findings while preserving current behavior and user data.

**Architecture:** Add focused seams for explicit-settings transformation, existing-response decoding, recording artifact discovery, and declarative Rust test selection. Keep workflow-specific prompts and streaming behavior in their domain modules, and keep live provider tests outside deterministic CI.

**Tech Stack:** Rust, Tokio, reqwest, Tauri 2, TypeScript, Vitest, Node test runner, Swift, Xcode simulator tooling.

---

## File map

- Modify `src/app/src/ai_gateway.rs` and `caption_stream.rs`: bounded decoding of an existing response and single-request JSON fallback.
- Modify `src/ui/src/shared/features/interpretation/ai.ts` and `settings/modelTest.ts`: shared explicit-settings transform seam.
- Add `tests/unit/ui/browser-ai-client.test.ts` and `model-test.test.ts`: direct browser and settings routing coverage.
- Modify `scripts/testing/ai-model-client.mjs` and its tests: bounded byte-stream decoding.
- Add `src/app/src/recording_artifacts.rs`; modify recording and subtitle modules to consume it.
- Add `scripts/testing/rust-test-matrix.mjs`, `ios-smoke.mjs`, and focused script tests; modify `scripts/tasks.mjs` and `Makefile`.
- Add `scripts/testing/apple-native-test-runner.mjs` and tests; update the Swift native check entrypoint.
- Update the AI design clarification and recording documentation without weakening existing constraints.

### Task 1: Production transform and provider response reuse

- [ ] Add a failing `model-test.test.ts` proving chat model tests call an explicit-settings production transform with draft settings, resolved credentials, `nice to meet you`, `zh`, and `translate`.
- [ ] Run the focused Vitest and confirm it fails because `askCoach` is still called.
- [ ] Add `transformWithSettings` in `interpretation/ai.ts`; make `transformText` resolve the profile then delegate; update `modelTest.ts` to use it.
- [ ] Add a failing Rust test whose server accepts exactly one successful JSON response to a `stream:true` request.
- [ ] Run the focused Rust test and confirm the second connection attempt fails.
- [ ] Extract bounded decoding of an existing `reqwest::Response` in `ai_gateway.rs`; consume the first successful non-SSE body in `caption_stream.rs`; retain retry only for explicit 400/422 stream-unsupported responses.
- [ ] Run focused UI and Rust tests and refactor duplicated task dispatch only after green.

### Task 2: Browser and Node request contracts

- [ ] Add failing direct browser gateway tests for safe endpoints, headers, redirect policy, cancellation, status redaction, invalid JSON, byte bounds, and truncation.
- [ ] Run the focused Vitest and confirm uncovered behavior fails where applicable.
- [ ] Make the smallest gateway changes needed without adding another request implementation.
- [ ] Add failing Node client tests using multibyte payloads and a cancellable `ReadableStream`.
- [ ] Run the script test and confirm the current `response.text()` implementation violates the byte bound.
- [ ] Implement bounded streamed JSON reading with `Content-Length`, chunk byte counts, cancellation, `TextDecoder`, and local errors.
- [ ] Run focused UI and Node tests.

### Task 3: Legacy recording artifacts

- [ ] Add failing Rust tests for legacy M4A audio/sidecar/batches, format conflicts, symlink rejection, rollback, and committed deletion.
- [ ] Run the focused tests and confirm current MP3-only path construction fails them.
- [ ] Add a focused recording-artifact module that validates session IDs, discovers MP3 or M4A assets, returns format/MIME, and owns deletion candidates.
- [ ] Route recording inspection, sharing, subtitle snapshots, recovery, worker batch lookup, and remote upload MIME through this module.
- [ ] Add UI and native regression assertions for legacy M4A playback/share/recovery while new recording creation remains MP3.
- [ ] Run focused Rust, UI, Swift, and native regression tests.

### Task 4: Deterministic test matrix and native entrypoints

- [ ] Add failing script tests proving database suites never use `--include-ignored`, exclude live probes, and expand identically for test and coverage modes.
- [ ] Implement a declarative Rust test-suite registry and make `test-db`/`test-coverage-db` consume it.
- [ ] Add failing tests for `test-ios-smoke`: no booted simulator is an explicit skip; malformed simulator output fails; a booted device passes its UDID to the smoke script.
- [ ] Add the Make/task entrypoint and runner.
- [ ] Add failing policy tests for one retry of a silent startup SIGKILL and no retry for assertion failures or post-output kills.
- [ ] Implement the Apple native runner and write diagnostics under `build/apple-regression/native-startup/`; update `speech/check.sh` to use it.
- [ ] Run script tests, database tests, and available Apple/iOS checks.

### Task 5: Documentation, integration, and verification

- [ ] Clarify that `rusty_mp3` belongs to recording output and does not weaken the AI gateway dependency constraint.
- [ ] Run `npm run format:check` and `cargo fmt --all -- --check`.
- [ ] Run `cargo clippy --locked --offline --workspace --all-targets -- -D warnings`.
- [ ] Run `cargo test --locked --offline --workspace` through the repository runner.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run test:scripts`.
- [ ] Run `make test-db`, `make test-apple`, `make test-ios-smoke`, and `make test-ai`; report external quota/device/toolchain blockers separately from deterministic failures.
- [ ] Dispatch independent spec and code-quality reviewers, address findings, and rerun affected verification.
