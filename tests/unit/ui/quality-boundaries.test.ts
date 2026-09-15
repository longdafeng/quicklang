import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSubtitles, validateCues, mediaMime, alignment, advance as advanceMaterial, newMaterial } from "../../../src/mac_ui/src/features/listening/model";
import { startSession, grade, advance, beginRetry } from "../../../src/mac_ui/src/features/spelling/session";
import { loadProfiles, saveProfiles, storageKey } from "../../../src/mac_ui/src/features/users/profiles";
import { wait } from "../../../src/mac_ui/src/features/study/shared";
import { endpoint, askCoach, transcribe, coachMessages } from "../../../src/mac_ui/src/features/conversation/ai";
import { generateSubtitles } from "../../../src/mac_ui/src/features/listening/ai";

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("subtitle input boundaries", () => {
  it.each([
    ["negative start", [{ start: -1, end: 1, text: "hello" }]],
    ["non-finite end", [{ start: 0, end: Infinity, text: "hello" }]],
    ["NaN start", [{ start: NaN, end: 1, text: "hello" }]],
    ["zero duration", [{ start: 0, end: 0, text: "hello" }]],
    ["missing text", [{ start: 0, end: 1 }]],
    ["markup only", [{ start: 0, end: 1, text: "<i></i>" }]],
    ["null entry", [null]],
    ["non-array", {}],
    ["oversized text", [{ start: 0, end: 1, text: "x".repeat(4001) }]],
  ])("rejects %s", (_label, cues) => expect(() => validateCues(cues)).toThrow());
  it("accepts adjacent cues and strips formatting without changing timing", () => {
    expect(validateCues([{ start: 0, end: 1, text: " <i>Hi</i> " }, { start: 1, end: 2, text: "there" }])).toEqual([{ start: 0, end: 1, text: "Hi" }, { start: 1, end: 2, text: "there" }]);
  });
  it("parses BOM, CRLF, cue identifiers and multiline captions", () => {
    expect(parseSubtitles("\uFEFFWEBVTT\r\n\r\nNOTE source\r\nignored\r\n\r\nid\r\n01:02:03.125 --> 01:02:04.500\r\nHello\r\nworld")).toEqual([{ start: 3723.125, end: 3724.5, text: "Hello world" }]);
  });
  it.each(["00:60.000", "01:99:00.000", "00:01", "-1:00.000"])("rejects malformed timestamp %s", timestamp => {
    expect(() => parseSubtitles(`${timestamp} --> 02:00:00.000\nHello`)).toThrow();
  });
  it("enforces the cue count limit", () => expect(() => validateCues(Array.from({ length: 3001 }, (_, start) => ({ start, end: start + 1, text: "x" })))).toThrow());
  it("rejects oversized subtitle documents before parsing", () => expect(() => parseSubtitles("x".repeat(400001))).toThrow("过大"));
  it("leaves an empty lesson unchanged", () => { const m = newMaterial("empty", "audio/mpeg"); expect(advanceMaterial(m, 0)).toBe(m); });
  it("advances at the exact review deadline without mutating saved progress", () => {
    const m = { ...newMaterial("lesson", "audio/mpeg"), cues: [{ start: 0, end: 1, text: "hi" }], due: 1000 };
    expect(advanceMaterial(m, 999)).toBe(m); expect(advanceMaterial(m, 1000)).toMatchObject({ stage: 1, due: null }); expect(m.stage).toBe(0);
  });
  it.each([["", "hello", 0], ["don't stop", "DON'T stop!", 100], ["a a a", "a", 33], ["one two", "", 0]])("aligns %s against %s", (a, b, percent) => expect(alignment(a, b).percent).toBe(percent));
});
describe("audio upload boundaries", () => {
  it.each([["A.MP3", "audio/mpeg"], ["lesson.m4a", "audio/mp4"], ["lesson.wav", "audio/wav"], ["lesson.ogg", "audio/ogg"], ["lesson.webm", "audio/webm"]])("detects %s", (name, mime) => expect(mediaMime(new File(["x"], name))).toBe(mime));
  it.each([["empty.mp3", 0], ["large.mp3", 8000001], ["document.txt", 1]])("rejects %s", (name, size) => expect(() => mediaMime(new File([new Uint8Array(size)], name))).toThrow());
  it("accepts the exact 8 MB limit", () => expect(mediaMime(new File([new Uint8Array(8000000)], "limit.mp3"))).toBe("audio/mpeg"));
});
describe("spelling progression", () => {
  it("starts at the saved offset and counts a correct answer once", () => {
    const initial = startSession(4, 2), graded = grade(initial, true, "hi");
    expect(initial.queue).toEqual([4, 5]); expect(initial.correct).toBe(0); expect(graded.correct).toBe(1); expect(grade(graded, true, "hi")).toBe(graded);
    expect(advance(graded)).toMatchObject({ index: 1, feedback: null, phase: "test" });
  });
  it("requires two successful retries and keeps failures for another round", () => {
    let s = advance(grade(startSession(0, 1), false, "wrong"));
    expect(s.phase).toBe("score"); s = beginRetry(s); expect(s.needs[0]).toBe(2);
    s = advance(grade(s, true, "right")); expect(s.phase).toBe("retry"); expect(s.needs[0]).toBe(1);
    s = advance(grade(s, false, "wrong")); expect(s.phase).toBe("retry"); expect(s.needs[0]).toBe(1);
    s = advance(grade(s, true, "right")); expect(s.phase).toBe("done"); expect(s.correct).toBe(0);
  });
  it("completes a perfect test without a retry round", () => {
    const s = advance(grade(startSession(10, 1), true, "right")); expect(beginRetry(s).phase).toBe("done"); expect(s.correct).toBe(1);
  });
});
describe("profile integrity", () => {
  it.each([null, {}, [null], [{ id: "", name: "a", level: "A1" }], [{ id: "../a", name: "a", level: "A1" }], [{ id: "a", name: " ", level: "A1" }], [{ id: "a", name: "a", level: "X" }]])("rejects malformed stored profiles %#", value => {
    localStorage.setItem("quicklang:profiles", JSON.stringify(value)); expect(() => loadProfiles()).toThrow();
  });
  it("rejects duplicate IDs to prevent two users sharing progress", () => {
    localStorage.setItem("quicklang:profiles", JSON.stringify([{ id: "same", name: "a", level: "A1" }, { id: "same", name: "b", level: "B1" }])); expect(() => loadProfiles()).toThrow();
  });
  it("migrates study keys but leaves shared AI settings and unrelated data alone", () => {
    localStorage.setItem("quicklang:spell:daily", "42"); localStorage.setItem("quicklang:ai-settings", "secret"); localStorage.setItem("other", "keep");
    saveProfiles([{ id: "user-a", name: "A", level: "C2" }], "user-a");
    expect(localStorage.getItem(storageKey("spell:daily", "user-a"))).toBe("42"); expect(localStorage.getItem(storageKey("ai-settings", "user-a"))).toBeNull(); expect(localStorage.getItem("other")).toBe("keep"); expect(loadProfiles()[0].level).toBe("C2");
  });
  it("does not commit the registry when migration fails", () => {
    localStorage.setItem("quicklang:spell:daily", "42"); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => saveProfiles([{ id: "user-a", name: "A", level: "A1" }], "user-a")).toThrow("quota"); expect(localStorage.getItem("quicklang:profiles")).toBeNull();
  });
});
describe("cancellation and transport", () => {
  const settings = { baseUrl: "http://localhost:4000/v1", model: "chat", transcriptionModel: "asr" };
  it.each(["chat", "transcribe", "subtitles"])("does not send already-cancelled %s requests", async operation => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const c = new AbortController(); c.abort(); const blob = new Blob(["audio"]);
    const promise = operation === "chat" ? askCoach(settings, "", [], c.signal) : operation === "transcribe" ? transcribe(settings, "", blob, c.signal) : generateSubtitles(settings, "", blob, c.signal);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects an empty recording before network access", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await expect(transcribe(settings, "", new Blob([]), new AbortController().signal)).rejects.toThrow("为空"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects an already-aborted delay without allocating a timer", async () => {
    vi.useFakeTimers(); const c = new AbortController(); c.abort(); await expect(wait(60000, c.signal)).rejects.toThrow("cancelled"); expect(vi.getTimerCount()).toBe(0);
  });
  it("clears an in-flight delay on cancellation", async () => {
    vi.useFakeTimers(); const c = new AbortController(), promise = wait(60000, c.signal); const rejected = expect(promise).rejects.toThrow("cancelled"); c.abort(); await rejected; expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["http://example.com/v1", "https://key@example.com/v1", "https://example.com?key=x", "https://example.com#secret", "file:///tmp/key"])("rejects unsafe endpoint %s", base => expect(() => endpoint(base, "chat/completions")).toThrow());
  it.each(["http://localhost:4000/v1", "http://127.0.0.1:4000/v1", "http://[::1]:4000/v1", "https://example.com/v1"])("preserves endpoint %s", base => expect(endpoint(base + "/", "chat/completions")).toBe(base + "/chat/completions"));
  it("bounds history while preserving material, coaching instructions and latest answer", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: "assistant" as const, content: String(i) })); const messages = coachMessages("lesson", "task", history, "new answer");
    expect(messages).toHaveLength(11); expect(messages[0].role).toBe("system"); expect(messages[2].content).toBe("4"); expect(messages.at(-1)?.content).toBe("new answer"); expect(JSON.parse(messages[1].content)).toEqual({ material: "lesson", task: "task" });
  });
});
