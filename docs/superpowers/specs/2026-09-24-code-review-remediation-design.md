# Code Review Remediation Design

Date: 2026-09-24

## Goal

Resolve the confirmed code-review findings without reverting existing uncommitted work: reuse the production text-transformation path, consume successful non-stream responses once, retain access to legacy M4A recordings while new recordings remain MP3, isolate deterministic database tests from live AI probes, and close the missing browser, Node, and iOS smoke coverage.

## Architecture

### AI request seams

`interpretation/ai.ts` exposes one explicit-settings transformation function. Both historical transcript analysis and the settings model test cross this seam; profile resolution remains a wrapper concern. The Rust gateway exposes bounded decoding of an existing `reqwest::Response`, so streaming callers can consume a successful JSON response without issuing a second request.

The existing browser gateway remains the single browser request module and gains direct contract tests. The Node black-box client remains independent, but reads provider responses as bounded byte streams rather than buffering unbounded text.

### Recording artifacts

One Rust module owns recording-format knowledge. New paths remain MP3. Discovery recognizes either MP3 or legacy M4A audio, sidecars, and batches, rejects ambiguous or symlinked assets, and returns the verified path plus MIME type. Playback, sharing, subtitle recovery, workers, and deletion consume this interface instead of constructing extensions independently.

Legacy M4A data is never rewritten or transcoded implicitly. `rusty_mp3` belongs to the recording feature, not the AI gateway refactor; the AI gateway's no-new-dependency constraint remains unchanged.

### Test suite isolation

A declarative Rust test-suite registry is the single source of database test selections for normal and coverage commands. Database commands use package/target/module filters and never workspace-wide `--include-ignored`. Live provider tests remain reachable only through `make test-ai`.

An explicit `test-ios-smoke` entrypoint runs the native simulator smoke test when a booted simulator is available and reports an honest skip otherwise. Apple native executable startup uses one bounded retry only for a silent startup SIGKILL and emits deterministic diagnostics when it remains blocked.

## Compatibility and safety

- Preserve all IPC command and argument names.
- Preserve task prompts, output formats, cancellation, streaming updates, and provider error redaction.
- Prefer MP3 for newly created recordings; preserve legacy M4A playback, share, subtitle, recovery, and deletion.
- Never follow symlinks or silently choose between conflicting MP3 and M4A primary assets.
- Do not make deterministic CI depend on external AI credentials, quota, or network access.
- Every new function, method, class, and source comment uses English documentation.

## Testing

Each behavior change follows red-green-refactor. Focused tests cover production transformation routing, single-request JSON fallback, browser request limits and cancellation, UTF-8 byte limits in the Node client, legacy recording discovery/deletion, exact database suite expansion, iOS smoke routing, and bounded Apple startup retry. Final verification runs formatting, Clippy, Rust workspace tests, TypeScript, Vitest, script tests, database tests, and environment-dependent suites when their prerequisites are available.
