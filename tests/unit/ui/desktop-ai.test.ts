import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { askCoach, transcribe } from "../../../src/mac_ui/src/features/conversation/ai";
import { generateSubtitles } from "../../../src/mac_ui/src/features/listening/ai";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }));
const settings = { baseUrl: "https://example.com/v1", model: "chat", transcriptionModel: "asr" };
beforeEach(() => { vi.mocked(invoke).mockReset(); });
afterEach(() => vi.restoreAllMocks());
it.each(["chat", "transcribe", "subtitles"])("does not invoke desktop %s after cancellation", async kind => {
  const c = new AbortController(); c.abort();
  const blob = new Blob(["audio"]);
  const result = kind === "chat" ? askCoach(settings, "", [], c.signal) : kind === "transcribe" ? transcribe(settings, "", blob, c.signal) : generateSubtitles(settings, "", blob, c.signal);
  await expect(result).rejects.toMatchObject({ name: "AbortError" }); expect(invoke).not.toHaveBeenCalled();
});
it("discards desktop chat responses arriving after cancellation", async () => {
  let finish!: (value: string) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise(resolve => { finish = resolve as typeof finish; }));
  const c = new AbortController(); const result = askCoach(settings, "", [], c.signal); c.abort(); finish("late answer");
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
});
it.each([transcribe, generateSubtitles])("does not upload audio cancelled while reading the blob %#", async request => {
  let finish!: (value: ArrayBuffer) => void;
  const blob = new Blob(["audio"], { type: "audio/webm" });
  Object.defineProperty(blob, "arrayBuffer", { value: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) });
  const controller = new AbortController();
  const result = request(settings, "", blob, controller.signal);
  controller.abort();
  finish(new ArrayBuffer(5));
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(invoke).not.toHaveBeenCalled();
});
it.each([null, {}, "", " ", { choices: [] }])("rejects empty desktop chat payload %#", async payload => {
  vi.mocked(invoke).mockResolvedValue(payload); await expect(askCoach(settings, "", [], new AbortController().signal)).rejects.toThrow("有效的文字");
});
it("normalizes settings before invoking native chat", async () => {
  vi.mocked(invoke).mockResolvedValue("feedback");
  expect(await askCoach({ ...settings, model: " chat " }, " key ", [{ role: "user", content: "hello" }], new AbortController().signal)).toBe("feedback");
  expect(invoke).toHaveBeenCalledWith("coach_chat", expect.objectContaining({ model: "chat", apiKey: "key" }));
});
