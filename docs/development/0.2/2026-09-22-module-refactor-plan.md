# Desktop / iOS Shared Frontend Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks; integrate and review each result before completion.

**Goal:** Separate desktop and iOS presentation, preserve a shared backend and shared business logic, and repair the three reviewed lifecycle defects.

**Architecture:** A small composition root selects a platform application. Platform applications supply shells and interpretation views to shared startup, learner, library and session controllers. Shared code never imports platform directories.

**Tech Stack:** React, TypeScript, Tauri/Rust, Objective-C, Vitest, repository formatters.

The user approved the detailed design in `2026-09-22-code-review-and-module-design.md`. Work in the existing checkout because it contains the full uncommitted iOS implementation being refactored; preserve those changes and do not commit unrelated work.

## Task 1: Capture cancellation

- [x] Add a deterministic regression for stop while native start is awaiting permission, including a subsequent start.
- [x] Fix ownership in `src/app/src/interpretation_capture.rs` and its platform lifecycle boundary, preserving native session cleanup.
- [x] Run the focused Rust/native regression and review cancellation ordering.

## Task 2: Interpretation composition and iOS lifecycle

- [x] Add regression tests in `tests/unit/ui/interpretation-pip.test.tsx` / interpretation integration tests for history navigation and retained PiP state.
- [x] Add polling regressions in `tests/unit/ui/interpretation-audio-panels.test.tsx` for terminal capture, late tail batches and retry.
- [x] Extract controller and platform views from `src/ui/src/features/interpretation/Interpretation.tsx`; keep shared logic independent of IOS components through typed composition.
- [x] Place iOS views and PiP controller in `src/ui/src/ios/interpretation`; desktop presentation in `src/ui/src/desktop/interpretation`.
- [x] Run focused interpretation tests and TypeScript checks.

## Task 3: App and library responsibilities

- [x] Add architecture checks in `tests/unit/ui/platform-boundary.test.ts` requiring desktop/ios/shared and prohibiting shared-to-platform or cross-platform imports.
- [x] Extract startup, learner management, page definitions and library state/transactions from `src/ui/src/app/App.tsx`.
- [x] Compose shared content with independent desktop/iOS shells and navigation behavior; preserve per-user keys, persistent interpretation mounting and lazy loading.
- [x] Move shared features/contracts/transport under shared and update consumers, test imports and source-path tooling together.
- [x] Split platform layout styles from shared component styles without changing current visual behavior.
- [x] Run `npm run typecheck`, `npm test -- --reporter=dot`, `npm run build` and script tests.

## Task 4: Formatting, review and delivery

- [x] Apply repository formatters with `make format`; inspect formatting scope and preserve source semantics.
- [x] Run `make format-check`, relevant Rust/native checks, and macOS/iOS compilation where available.
- [x] Run independent spec and quality reviews; fix actionable regressions before delivery.
- [x] Update the review document with final module locations, validation evidence and explicit device-test limitations.

New or extracted functions, classes and methods receive concise English documentation. Existing public IPC names, persistence keys, file formats and native build paths remain compatible. A test process killed by the host is recorded as unverified, never as passing.

## Approved scope additions

- iPhone uses local English real-time translation directly, with no subtitle-mode selector. Desktop retains cloud simultaneous interpretation. Delete iOS-only cloud WAV/event capture and exclude desktop cloud command handlers from the iOS build; retain local PCM capture and background audio translation.
- After regression checks, build the signed device app and update the connected physical iPhone without uninstalling or clearing its data. Verify installation and launch.


## Final validation

- `make test`: passed formatting, license/layout checks, Clippy with warnings denied, 144 Rust tests (16 environment-dependent tests ignored), 488 frontend tests, and 81 script tests (1 skipped).
- SQLite feature tests: 30 passed, including transactions, reopen persistence and library import.
- Frontend production build and signed iOS Release build/export: passed.
- Native iOS PCM regression: both device/simulator object exports checked; real conversion, mixed input, tails and cancellation passed. Swift local-caption/recording regression also passed.
- Installed the signed archive onto the connected physical iPhone 17 Pro using `devicectl device install app`; retained application data by updating rather than uninstalling.
- Independent review findings (menu expansion reset and history-panel terminal polling) were fixed with failing-then-passing regression tests.
- Evidence: `build/refactor-validation/` (full test log, release log, install/launch JSON, binary SHA-256, app metadata and a physical-device screenshot).

The signed iOS release is version 0.2.0. No public API or persistence-key migration was introduced. The final build still reports existing Tao/iOS-only dead-code warnings; macOS workspace Clippy is clean. The first launch attempt was rejected because the phone was locked. After it was unlocked, launch succeeded. The physical-device screenshot confirms the local English translation page has no caption-mode selector or cloud-mode option, and existing settings remain visible. Live microphone permission, cross-app audio capture, PiP background behavior and real-model translation quality require interactive device validation beyond the automated tests.

## Shared host rename verification

- Renamed the shared Tauri host to `src/app`, the Cargo package to `quicklang-app`, and the library to `quicklang_app`. Desktop UI remains under `src/ui/src/desktop`.
- Updated workspace, build, install, native test, migration, and documentation references. Regenerated the iOS project; preserved the prior generated project under `build/app-rename-validation/apple-before-rename`.
- `make test` passed: 144 Rust tests, 488 UI tests, and 81 script tests; 16 Rust tests and 1 script test remain ignored/skipped. Formatting and Clippy checks passed.
- `make build` produced the macOS app and verified its local signature. `make release-ios` produced the signed IPA with the renamed host.
- Installed the new iOS build on the connected iPhone and launched `io.github.longdafeng.quicklang` successfully. This rename validation does not repeat live microphone or translation testing.
- Logs and device operation receipts: `build/app-rename-validation/`.
