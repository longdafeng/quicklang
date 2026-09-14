import { afterEach, expect, it, vi } from "vitest";
import { askCoach, transcribe } from "../../../src/ui/src/features/conversation/ai";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
const settings = { baseUrl: "http://127.0.0.1:4000/v1", model: "quicklang-chat", transcriptionModel: "quicklang-transcribe" };

it("sends the stable chat alias and gateway credential using the unified protocol", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Try again." } }] })));
  vi.stubGlobal("fetch", fetch);
  const messages = [{ role: "user" as const, content: "Hello" }];
  expect(await askCoach(settings, "gateway-key", messages, new AbortController().signal)).toBe("Try again.");
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("http://127.0.0.1:4000/v1/chat/completions");
  expect(init.headers.Authorization).toBe("Bearer gateway-key");
  expect(JSON.parse(init.body)).toMatchObject({ model: "quicklang-chat", messages, stream: false });
});

it("routes audio with its own alias and multipart upload", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "Hello there." })));
  vi.stubGlobal("fetch", fetch);
  expect(await transcribe(settings, "gateway-key", new Blob(["audio"], { type: "audio/webm" }), new AbortController().signal)).toBe("Hello there.");
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("http://127.0.0.1:4000/v1/audio/transcriptions");
  expect(init.body.get("model")).toBe("quicklang-transcribe");
  expect(init.body.get("file").size).toBe(5);
  expect(init.headers["Content-Type"]).toBeUndefined();
});

it("reports a gateway authentication failure without exposing its response body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream details", { status: 401 })));
  await expect(askCoach(settings, "wrong-key", [{ role: "user", content: "Hello" }], new AbortController().signal)).rejects.toThrow("401");
});
