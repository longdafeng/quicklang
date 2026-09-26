# AI Gateway Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate repeated large-model request and translation code behind layered Rust and browser gateways while preserving live streaming, historical subtitle, transcript transformation, browser fallback, and Node black-box tests.

**Architecture:** Keep `ai_network` as the proxy-aware transport, add `ai_gateway` for provider protocol behavior, and retain workflow-specific prompts and output mapping in their current domain modules. Add one frontend browser client for non-Tauri calls, route the settings translation test through the production text transformation operation, and retain the Node client only as a contract-tested external integration adapter.

**Tech Stack:** Rust, Tokio, reqwest, serde_json, Tauri 2, TypeScript, Fetch API, Vitest, Node test runner.

---

## File Map

- Create `src/app/src/ai_gateway.rs`: secure endpoint construction, shared validation, bounded JSON responses, and Chat Completions text extraction.
- Modify `src/app/src/lib.rs`: register the internal gateway module.
- Modify `src/app/src/interpretation_ai.rs`: use the gateway and keep only interpretation/transcription behavior.
- Modify `src/app/src/caption_stream.rs`: use gateway validation/request/text parsing while retaining SSE and cancellation.
- Modify `src/app/src/history_subtitles/remote.rs`: use the gateway for provider calls while retaining subtitle mapping.
- Modify `src/app/src/coach.rs`: remove duplicate endpoint and response helpers.
- Create `src/ui/src/shared/ai/browserClient.ts`: shared browser endpoint and bounded request implementation.
- Create `tests/unit/ui/browser-ai-client.test.ts`: direct browser-client boundary tests.
- Modify `src/ui/src/shared/features/conversation/ai.ts`: consume the browser client.
- Modify `src/ui/src/shared/features/interpretation/ai.ts`: consume the browser client and expose transformation with explicit draft settings.
- Modify `src/ui/src/shared/features/settings/modelTest.ts`: route translation testing through shared transformation.
- Create `tests/unit/ui/model-test.test.ts`: verify the model-test routing and result checks.
- Modify `tests/unit/ui/ai-gateway.test.ts`: retain feature-level browser behavior coverage without testing duplicated internals.
- Modify `tests/unit/ui/interpretation-ai.test.ts`: cover explicit-settings transformation and native IPC compatibility.
- Modify `scripts/testing/ai-model-client.mjs`: align black-box request contract where required.
- Modify `tests/unit/scripts/ai-model-client.test.mjs`: lock the external contract.
- Modify `docs/superpowers/specs/2026-09-24-ai-gateway-consolidation-design.md`: only if implementation reveals a necessary clarification; no scope expansion.

No commit steps are included because the checkout already contains unrelated uncommitted work and the user did not request commits.

### Task 1: Add The Rust Provider Gateway

**Files:**
- Create: `src/app/src/ai_gateway.rs`
- Modify: `src/app/src/lib.rs`

- [ ] **Step 1: Add failing gateway unit tests**

Create tests in `ai_gateway.rs` that define the intended public boundary before migrating callers:

```rust
#[test]
fn endpoint_accepts_https_and_loopback_http_only() {
    assert_eq!(
        endpoint("https://models.example/v1/", "chat/completions")
            .unwrap()
            .as_str(),
        "https://models.example/v1/chat/completions"
    );
    assert!(endpoint("http://127.0.0.1:4000/v1", "chat/completions").is_ok());
    for base in [
        "http://models.example/v1",
        "https://user:secret@models.example/v1",
        "https://models.example/v1?key=secret",
        "file:///tmp/model",
    ] {
        assert!(endpoint(base, "chat/completions").is_err(), "{base}");
    }
}

#[test]
fn chat_text_rejects_empty_and_truncated_output() {
    assert_eq!(
        chat_text(&json!({"choices":[{"finish_reason":"stop","message":{"content":" translated "}}]}))
            .unwrap(),
        "translated"
    );
    assert!(chat_text(&json!({"choices":[{"finish_reason":"length","message":{"content":"partial"}}]})).is_err());
    assert!(chat_text(&json!({"choices":[{"message":{"content":" "}}]})).is_err());
}
```

Add an async loopback-server test proving `json_response` rejects oversized and invalid JSON bodies without returning provider content.

- [ ] **Step 2: Run the new tests and confirm the gateway is missing**

Run:

```bash
cargo test -p quicklang-app ai_gateway --lib
```

Expected: compilation fails because `ai_gateway` functions are not implemented or the module is not registered.

- [ ] **Step 3: Implement the narrow gateway API**

Implement these focused functions:

```rust
pub(crate) fn endpoint(base: &str, path: &str) -> Result<Url, String>;
pub(crate) fn validate_model(model: &str, api_key: &str) -> Result<(), String>;
pub(crate) fn validate_language(language: &str) -> Result<(), String>;
pub(crate) async fn request(base: &str, path: &str, api_key: &str)
    -> Result<reqwest::RequestBuilder, String>;
pub(crate) async fn json_response(
    request: reqwest::RequestBuilder,
    max_bytes: usize,
) -> Result<Value, String>;
pub(crate) fn chat_text(value: &Value) -> Result<String, String>;
```

`request` must delegate to `crate::ai_network::request`. `json_response` must use `crate::ai_network::error_code`, reject non-success status without reading or exposing the provider body, enforce both `Content-Length` and streamed byte limits, and return stable local errors. `chat_text` must reject `finish_reason == "length"`, blank text, and malformed responses.

Register `mod ai_gateway;` beside `mod ai_network;` in `src/app/src/lib.rs`.

- [ ] **Step 4: Run gateway tests**

Run:

```bash
cargo test -p quicklang-app ai_gateway --lib
```

Expected: all `ai_gateway` tests pass.

### Task 2: Migrate Rust AI Callers

**Files:**
- Modify: `src/app/src/interpretation_ai.rs`
- Modify: `src/app/src/caption_stream.rs`
- Modify: `src/app/src/history_subtitles/remote.rs`
- Modify: `src/app/src/coach.rs`

- [ ] **Step 1: Strengthen caller tests before extraction**

Update existing Rust tests to assert behavior rather than private helper ownership:

```rust
assert!(sent.starts_with("POST /v1/chat/completions"));
assert_eq!(body["model"], "translator");
assert_eq!(body["stream"], false);
assert_eq!(transformed, "你好");
```

Keep the existing live-stream assertions for SSE completion, non-stream fallback, cancellation, and diagnostic codes. Add one `coach` test that verifies a malformed Chat Completions response produces a local error without including a mock provider secret.

- [ ] **Step 2: Run focused Rust tests before migration**

Run:

```bash
cargo test -p quicklang-app interpretation_ai --lib
cargo test -p quicklang-app caption_stream --lib
cargo test -p quicklang-app history_subtitles --lib
cargo test -p quicklang-app coach --lib
```

Expected: tests pass before production extraction; any new secret-redaction regression fails until the shared gateway is used.

- [ ] **Step 3: Migrate `interpretation_ai`**

Remove its private endpoint, request, response, and transformed-text implementations. Replace them with gateway imports:

```rust
use crate::ai_gateway::{
    chat_text, json_response, request, validate_language, validate_model,
};
```

Keep `validate_settings` as a compatibility wrapper used by existing callers:

```rust
pub(crate) fn validate_settings(model: &str, api_key: &str, language: &str) -> Result<(), String> {
    validate_model(model, api_key)?;
    validate_language(language)
}
```

Use `json_response(..., 1_000_000)` and `chat_text` in transcription-chat and text-transformation paths. Preserve transcription-specific parsing and all task prompts.

- [ ] **Step 4: Migrate historical subtitles and live captions**

In `history_subtitles/remote.rs`, replace imports from `interpretation_ai` with gateway imports for request, response, text extraction, and validation. Keep imports from `interpretation_ai` only for transcription functions.

In `caption_stream.rs`, prepare requests through `ai_gateway::request`, validate with gateway primitives, and parse non-stream fallback through `ai_gateway::chat_text`. Keep SSE decoding and its one-megabyte stream bound local because streaming semantics are domain-specific.

- [ ] **Step 5: Migrate coach calls**

Delete `coach.rs` endpoint/request/response helpers. Build `coach_chat` with:

```rust
let value = crate::ai_gateway::json_response(
    crate::ai_gateway::request(&base_url, "chat/completions", &api_key)
        .await?
        .json(&json!({"model": model, "messages": messages, "stream": false, "max_tokens": 900})),
    256_000,
).await?;
let text = crate::ai_gateway::chat_text(&value)?;
Ok(text.chars().take(12_000).collect())
```

Retain coach-specific message validation and transcription routing.

- [ ] **Step 6: Run all focused Rust tests and formatting**

Run:

```bash
cargo fmt --all -- --check
cargo test -p quicklang-app ai_gateway --lib
cargo test -p quicklang-app interpretation_ai --lib
cargo test -p quicklang-app caption_stream --lib
cargo test -p quicklang-app history_subtitles --lib
cargo test -p quicklang-app coach --lib
```

Expected: formatting and all focused tests pass.

### Task 3: Consolidate Browser AI Requests

**Files:**
- Create: `src/ui/src/shared/ai/browserClient.ts`
- Create: `tests/unit/ui/browser-ai-client.test.ts`
- Modify: `src/ui/src/shared/features/conversation/ai.ts`
- Modify: `src/ui/src/shared/features/interpretation/ai.ts`
- Modify: `tests/unit/ui/ai-gateway.test.ts`
- Modify: `tests/unit/ui/interpretation-ai.test.ts`

- [ ] **Step 1: Write failing shared-client tests**

Cover endpoint safety, authorization, JSON content type, multipart behavior, redirect policy, abort forwarding, HTTP status redaction, invalid JSON, and response limits:

```ts
it("builds only HTTPS or loopback HTTP endpoints", () => {
  expect(aiEndpoint("https://models.example/v1/", "chat/completions")).toBe(
    "https://models.example/v1/chat/completions",
  );
  expect(() => aiEndpoint("http://models.example/v1", "chat/completions")).toThrow();
  expect(() => aiEndpoint("https://models.example/v1?key=secret", "chat/completions")).toThrow();
});

it("does not expose a rejected provider body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-token", { status: 401 })));
  await expect(
    requestAIJson("https://models.example/v1", "chat/completions", "key", "{}", signal, true),
  ).rejects.not.toThrow(/private-token/);
});
```

- [ ] **Step 2: Run the new frontend test and confirm failure**

Run:

```bash
npm test -- --run tests/unit/ui/browser-ai-client.test.ts
```

Expected: failure because `shared/ai/browserClient` does not exist.

- [ ] **Step 3: Implement the shared browser client**

Export a small API:

```ts
export function aiEndpoint(base: string, path: string): string;
export async function requestAIJson(
  base: string,
  path: string,
  apiKey: string,
  body: BodyInit,
  signal: AbortSignal,
  jsonBody?: boolean,
  maxBytes?: number,
): Promise<unknown>;
```

The implementation must use `credentials: "omit"`, `redirect: "error"`, caller cancellation, bounded streaming reads, and local errors only. It must omit `Content-Type` for `FormData`.

- [ ] **Step 4: Replace both feature-local browser implementations**

In `conversation/ai.ts`, re-export `aiEndpoint` as `endpoint` for compatibility and replace `browserRequest` with `requestAIJson`.

In `interpretation/ai.ts`, remove its private `request` fetch implementation. Resolve the profile as before, then call `requestAIJson` in non-Tauri mode. Keep task prompt construction, output validation, and `safeError` in the interpretation feature.

- [ ] **Step 5: Run focused browser and feature tests**

Run:

```bash
npm test -- --run tests/unit/ui/browser-ai-client.test.ts tests/unit/ui/ai-gateway.test.ts tests/unit/ui/interpretation-ai.test.ts tests/unit/ui/desktop-ai.test.ts
npm run typecheck
```

Expected: all selected tests and TypeScript checks pass.

### Task 4: Route Settings Translation Test Through Production Transformation

**Files:**
- Modify: `src/ui/src/shared/features/interpretation/ai.ts`
- Modify: `src/ui/src/shared/features/settings/modelTest.ts`
- Create: `tests/unit/ui/model-test.test.ts`
- Modify: `tests/unit/ui/settings.test.tsx`

- [ ] **Step 1: Write a failing model-test routing test**

Mock the interpretation transformation module and prove chat testing uses the fixed production translation operation:

```ts
it("tests chat through the production text transformation path", async () => {
  transformWithSettings.mockResolvedValue("很高兴认识你");
  await runModelTest(draft, "chat", new AbortController().signal, update);
  expect(transformWithSettings).toHaveBeenCalledWith(
    expect.objectContaining({ model: "chat" }),
    "runtime-secret",
    "nice to meet you",
    "zh",
    "translate",
    expect.any(AbortSignal),
  );
  expect(update).toHaveBeenCalledWith("chat", expect.objectContaining({ state: "success" }));
});
```

Also retain tests for non-Chinese output, credential resolution failure, and transcription routing.

- [ ] **Step 2: Run the model-test test and confirm failure**

Run:

```bash
npm test -- --run tests/unit/ui/model-test.test.ts
```

Expected: failure because `transformWithSettings` does not exist and `modelTest.ts` still imports `askCoach`.

- [ ] **Step 3: Extract explicit-settings transformation**

In `interpretation/ai.ts`, add:

```ts
export async function transformWithSettings(
  settings: AISettings,
  apiKey: string,
  text: string,
  language: string,
  task: TextTransformTask,
  signal: AbortSignal,
  minutes?: MinutesOptions,
): Promise<string>;
```

Move the existing native invocation/browser fallback body from `transformText` into this function. Keep `transformText(profileId, ...)` as the profile-resolving wrapper used by history workflows.

- [ ] **Step 4: Update the settings model test**

Replace the `askCoach` import and custom message array with:

```ts
const translation = await transformWithSettings(
  settings,
  apiKey,
  "nice to meet you",
  "zh",
  "translate",
  signal,
);
```

Keep the existing Chinese-character result check and stage updates. Do not change transcription testing.

- [ ] **Step 5: Run settings and interpretation tests**

Run:

```bash
npm test -- --run tests/unit/ui/model-test.test.ts tests/unit/ui/settings.test.tsx tests/unit/ui/interpretation-ai.test.ts
npm run typecheck
```

Expected: all selected tests and TypeScript checks pass; the settings UI still supports unsaved draft model settings and key actions.

### Task 5: Lock The Node Contract And Verify The Repository

**Files:**
- Modify: `scripts/testing/ai-model-client.mjs`
- Modify: `tests/unit/scripts/ai-model-client.test.mjs`
- Verify: all files changed in Tasks 1-4

- [ ] **Step 1: Add missing black-box contract tests**

Add explicit assertions for the external client:

```js
assert.deepEqual(JSON.parse(request.init.body), {
  model: "chat",
  messages: [
    {
      role: "system",
      content: "Translate the user's English text into Simplified Chinese. Return only the translation.",
    },
    { role: "user", content: "nice to meet you" },
  ],
  stream: false,
  max_tokens: 100,
});
assert.equal(request.init.redirect, "error");
assert.throws(() => readConfigWith("https://models.example/v1?secret=x"), /without URL credentials/);
```

Add cases proving oversized, invalid-JSON, non-Chinese, and HTTP-error responses never expose provider bodies.

- [ ] **Step 2: Run script tests and observe any contract mismatch**

Run:

```bash
npm run test:scripts -- --test-name-pattern="AI|model|translation"
```

Expected: new assertions either pass immediately or identify an exact Node-client mismatch.

- [ ] **Step 3: Apply the minimum Node-client alignment**

Adjust only `serviceEndpoint`, `requestJson`, or the fixed request body required by the failing contract tests. Keep the Node client independent from application imports and do not add dependencies.

- [ ] **Step 4: Run focused and repository-level verification**

Run:

```bash
cargo fmt --all -- --check
cargo test -p quicklang-app --lib
npm run format:check
npm run typecheck
npm test -- --reporter=dot
npm run test:scripts
npm run build
```

Expected: all commands pass. Do not run `npm run test:ai` unless real `.env.test` credentials are intentionally available, because it calls an external paid/model service.

- [ ] **Step 5: Review the final diff for consolidation and compatibility**

Confirm all of the following with code search and diff inspection:

```text
- Rust production modules construct provider endpoints only through ai_gateway.
- coach.rs no longer owns endpoint or bounded JSON response helpers.
- conversation/ai.ts and interpretation/ai.ts contain no direct fetch calls.
- modelTest.ts contains no askCoach import.
- live SSE decoding remains in caption_stream.rs.
- subtitle cue JSON parsing remains in history_subtitles/remote.rs.
- scripts/testing/ai-model-client.mjs remains the only independent Node fetch client.
- No unrelated dirty-worktree changes were reverted or reformatted.
```

Report any environment-dependent skipped validation precisely rather than claiming it passed.
