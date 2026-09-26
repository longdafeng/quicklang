# AI Gateway Consolidation Design

Date: 2026-09-24

## Goal

Reduce duplicated large-model translation code while preserving the behavior and runtime coverage of live caption translation, historical transcript translation, historical subtitle generation, settings model tests, browser fallback, and Node real-model integration tests.

The refactor must preserve existing IPC command names, persistence formats, provider compatibility, translation semantics, cancellation behavior, response limits, and credential handling.

## Current Problem

The application already shares the low-level Rust HTTP client in `ai_network.rs`, but endpoint validation, model validation, Chat Completions request construction, bounded response reading, provider error handling, and text extraction remain distributed across `interpretation_ai.rs`, `caption_stream.rs`, `history_subtitles/remote.rs`, and `coach.rs`.

The frontend also has separate browser request implementations in the conversation and interpretation features. The settings translation test uses `askCoach`, so it does not exercise the same text transformation path used by historical transcript translation. The Node real-model test necessarily runs outside the application runtime and maintains a separate fetch client.

## Approved Approach

Use a layered AI gateway instead of a single translation function.

```text
Rust business adapters
  interpretation_ai  caption_stream  history_subtitles  coach
                       |
                   ai_gateway
                       |
                   ai_network

Frontend features
  conversation  interpretation  settings model test
                       |
              shared browser AI client
```

`ai_network` remains responsible for proxy-aware connection creation, authentication attachment, and transport error classification. A new `ai_gateway` module owns provider-protocol behavior shared by Rust callers. Domain adapters retain only behavior that is genuinely specific to their workflow.

## Rust Modules

### `ai_network.rs`

Responsibilities remain narrow:

- create and cache proxy-aware `reqwest::Client` instances;
- bypass proxies for loopback services;
- attach bearer credentials;
- classify transport failures without exposing secrets.

It does not validate AI settings, build provider endpoints, interpret HTTP status codes, or parse provider JSON.

### `ai_gateway.rs`

The new gateway owns:

- secure provider endpoint construction;
- common model, credential, and language validation primitives;
- Chat Completions request preparation;
- bounded non-streaming response reads;
- stable HTTP and response errors;
- Chat Completions text extraction, including truncation detection.

The gateway exposes focused helpers rather than one mode-heavy function. Streaming callers may obtain a prepared request and retain ownership of SSE parsing. Structured callers may request a bounded JSON response and parse their own domain payload from the returned model text.

### Domain Adapters

`interpretation_ai.rs` retains transcription protocol routing, text-task prompt selection, meeting-minutes validation, and Tauri commands.

`caption_stream.rs` retains cancellation registration, SSE decoding, stream fallback, live timing diagnostics, and the short-fragment translation prompt. It uses the gateway for validation, endpoint preparation, transport, non-stream fallback parsing, and stable diagnostics.

`history_subtitles/remote.rs` retains cue context construction, subtitle identifiers, structured subtitle prompts, cue attachment, refinement, and direct audio translation. It uses the gateway for all common request and response handling.

`coach.rs` retains message-count and content-length constraints plus coach-specific result limits. It stops maintaining separate endpoint, request, and JSON response implementations.

## Frontend Modules

Add a shared browser AI client under `src/ui/src/shared/ai/`. It owns:

- secure endpoint construction;
- authorization and content-type headers;
- bounded response reading;
- JSON parsing;
- browser request cancellation and redirect policy;
- stable browser-side provider errors.

`conversation/ai.ts` and `interpretation/ai.ts` use this client only when native commands are unavailable. Tauri builds continue to use the Rust gateway.

The settings model translation test must invoke the same text transformation operation used by historical transcript translation. It may accept unsaved draft settings and credentials, but it must reuse the shared transformation request implementation rather than `askCoach`.

## Node Integration Test

Keep `scripts/testing/ai-model-client.mjs` as an external black-box client because Node cannot directly import the Rust or TypeScript runtime implementation without adding an inappropriate build dependency.

Contract tests keep its externally visible behavior aligned with the application:

- HTTPS or loopback HTTP only;
- no URL credentials, query, or fragment;
- bounded response size and timeout;
- matching Chat Completions request fields;
- matching non-empty Chinese translation acceptance.

No application source imports from `scripts/`.

## Data Flow

### Live Caption Translation

`CaptionTranslationCoordinator` resolves a profile and invokes `live_caption_translate_stream`. The Rust live-caption adapter validates inputs through the gateway, builds its domain prompt, and streams through the gateway-prepared request. The adapter alone owns SSE updates and cancellation.

### Historical Transcript Translation

`transcriptAnalysis` calls the shared frontend transformation operation. Tauri invokes `interpretation_transform`, which builds the task prompt and sends it through the gateway. Browser fallback sends the equivalent request through the shared browser client.

### Historical Subtitle Translation

`HistoryWorker` resolves credentials and calls the historical subtitle adapter. The adapter builds indexed cue JSON and prior context, uses the gateway for the provider call, then validates and attaches returned subtitle IDs.

### Settings Translation Test

The settings dialog calls the same text transformation operation with the fixed test phrase and draft settings. It verifies that the returned text contains Chinese. This tests the production translation protocol instead of the coach protocol.

## Errors And Security

The gateway returns only stable locally generated error messages or diagnostic codes. It never returns provider bodies, request URLs, headers, API keys, or arbitrary nested errors.

Domain adapters add workflow context such as subtitle translation or recording transcription. The UI maps only known messages and codes to user-facing guidance.

Credentials remain resolved only when a user-initiated operation needs them. Logs and timing records contain correlation identifiers and durations, never transcript text or credentials.

## Compatibility Constraints

- Preserve all current Tauri command names and argument names.
- Preserve live-caption cancellation and cumulative stream updates.
- Preserve historical cue IDs, timestamps, context windows, and output files.
- Preserve task-specific prompts unless a test proves an existing inconsistency.
- Preserve browser fallback and Node real-model testing.
- Do not add a new third-party dependency.
- Work with the existing uncommitted changes and do not revert unrelated files.

## Testing Strategy

Use test-driven extraction:

1. Add or update tests proving the settings translation test uses the shared transformation path.
2. Add gateway unit tests for endpoint rules, validation, bounded response parsing, HTTP errors, empty output, and truncation.
3. Keep focused live-stream tests for SSE, fallback, cancellation, and diagnostics.
4. Keep historical subtitle tests for indexed JSON, context, cue timing, and refinement.
5. Add frontend shared-client tests and keep existing conversation and interpretation behavior tests.
6. Keep Node client contract tests and the optional real-provider integration test.
7. Run focused tests during extraction, followed by formatting, Rust tests, frontend tests, type checking, and script tests.

## Acceptance Criteria

- Rust endpoint construction and bounded non-stream Chat Completions response handling have one implementation.
- Rust production translation paths share the gateway while retaining domain-specific prompts and outputs.
- Browser fallback request handling has one frontend implementation.
- The settings translation test exercises the production text transformation path.
- The Node client is explicitly limited to black-box integration use and is contract-tested.
- Existing IPC, persistence, cancellation, and translation behavior remain compatible.
- Relevant focused and repository-level checks pass, or any environment-dependent limitation is reported precisely.
