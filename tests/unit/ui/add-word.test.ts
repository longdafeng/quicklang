import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Word } from "../../../src/mac_ui/src/contracts";
import type { SearchBook } from "../../../src/mac_ui/src/features/search/WordSearch";
import { askCoach } from "../../../src/mac_ui/src/features/conversation/ai";
import { loadBook } from "../../../src/mac_ui/src/features/library/books";
import { normalizeSpelling, resolveNewWord } from "../../../src/mac_ui/src/features/library/addWord";

vi.mock("../../../src/mac_ui/src/features/conversation/ai", () => ({ askCoach: vi.fn() }));
vi.mock("../../../src/mac_ui/src/features/library/books", () => ({ loadBook: vi.fn() }));
const generated = { spelling: "apple", meaning: "苹果", translations: ["苹果"], phoneticUs: "/ˈæpəl/", phoneticUk: "/ˈæpəl/", example: "I eat an apple.", exampleTranslation: "我吃一个苹果。", sentences: [{ textEn: "I eat an apple.", textZh: "我吃一个苹果。", source: "dictionary" }] };
const existing: Word = { id: "old", ...generated };
const book = (words: Word[], bundled = false): SearchBook => ({ id: "book", name: "Book", words, bundled });
const assertCurrent = vi.fn();
const runtime = vi.fn(async () => ({ settings: { baseUrl: "https://example.com", model: "model", transcriptionModel: "" }, apiKey: "secret", assertCurrent }));
let controller: AbortController;
beforeEach(() => {
  vi.resetAllMocks();
  controller = new AbortController();
  runtime.mockResolvedValue({ settings: { baseUrl: "https://example.com", model: "model", transcriptionModel: "" }, apiKey: "secret", assertCurrent });
  vi.mocked(askCoach).mockResolvedValue(JSON.stringify(generated));
});
const resolve = (books: SearchBook[] = [], spelling = "apple") => resolveNewWord(spelling, books, runtime, controller.signal);

describe("add word", () => {
  it("normalizes case, surrounding whitespace and repeated spaces", () => {
    expect(normalizeSpelling("  APPLE  ")).toBe("apple");
    expect(normalizeSpelling(" ＡＰＰＬＥ ")).toBe("apple");
    expect(normalizeSpelling(" Ice   cream ")).toBe("ice cream");
  });
  it("reuses a deeply cloned exact match with a fresh UUID without AI", async () => {
    const result = await resolve([book([{ ...existing, spelling: "APPLE" }])]);
    expect(result).toEqual({ ...existing, spelling: "APPLE", id: expect.any(String) });
    expect(result.id).not.toBe(existing.id);
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    result.sentences![0].textEn = "changed";
    expect(existing.sentences![0].textEn).toBe(generated.example);
    expect(runtime).not.toHaveBeenCalled();
    expect(askCoach).not.toHaveBeenCalled();
  });
  it("loads bundled books and searches past partial matches", async () => {
    vi.mocked(loadBook).mockResolvedValue([existing]);
    const result = await resolve([book([{ ...existing, spelling: "pineapple" }]), book([], true)]);
    expect(loadBook).toHaveBeenCalledWith("book", controller.signal);
    expect(result.meaning).toBe(existing.meaning);
    expect(runtime).not.toHaveBeenCalled();
  });
  it("does not generate when a bundled lookup fails", async () => {
    vi.mocked(loadBook).mockRejectedValue(new Error("offline"));
    await expect(resolve([book([], true)])).rejects.toThrow();
    expect(runtime).not.toHaveBeenCalled();
  });
  it.each(["", "苹果", "apple123", "hello!", "a".repeat(101)])("rejects invalid English spelling %s before lookup", async spelling => {
    await expect(resolve([book([], true)], spelling)).rejects.toThrow();
    expect(loadBook).not.toHaveBeenCalled();
    expect(runtime).not.toHaveBeenCalled();
  });
  it.each([false, true])("generates complete words from strict JSON (fenced=%s)", async fenced => {
    vi.mocked(askCoach).mockResolvedValue(fenced ? `\`\`\`json\n${JSON.stringify(generated)}\n\`\`\`` : JSON.stringify(generated));
    const result = await resolve([], " APPLE ");
    expect(result).toEqual({ ...generated, id: expect.any(String), sentences: [{ ...generated.sentences[0], source: "AI" }] });
    expect(askCoach).toHaveBeenCalledWith((await runtime()).settings, "secret", expect.any(Array), controller.signal);
    expect(assertCurrent).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...generated, spelling: "pear" }, { ...generated, meaning: "" },
    { ...generated, translations: [] }, { ...generated, translations: [123] },
    { ...generated, phoneticUs: null }, { ...generated, phoneticUk: "" },
    { ...generated, example: "" }, { ...generated, exampleTranslation: "" },
    { ...generated, sentences: [] }, { ...generated, sentences: [{ textEn: "Hello", textZh: "" }] },
    { ...generated, meaning: "x".repeat(2001) }, { ...generated, extra: "unexpected" },
    [], null,
  ])("rejects incomplete, mismatched, oversized or unexpected AI fields %#", async data => {
    vi.mocked(askCoach).mockResolvedValue(JSON.stringify(data));
    await expect(resolve()).rejects.toThrow();
  });
  it.each(["not json", `Here is JSON: ${JSON.stringify(generated)}`, `${JSON.stringify(generated)} trailing`, "x".repeat(12001)])("rejects non-strict JSON response %#", async text => {
    vi.mocked(askCoach).mockResolvedValue(text);
    await expect(resolve()).rejects.toThrow();
  });
  it("checks cancellation before lookup", async () => {
    controller.abort();
    await expect(resolve([book([], true)])).rejects.toMatchObject({ name: "AbortError" });
    expect(loadBook).not.toHaveBeenCalled();
  });
  it("checks cancellation after bundled lookup", async () => {
    vi.mocked(loadBook).mockImplementation(async () => { controller.abort(); return [existing]; });
    await expect(resolve([book([], true)])).rejects.toMatchObject({ name: "AbortError" });
    expect(runtime).not.toHaveBeenCalled();
  });
  it("checks cancellation after resolving runtime", async () => {
    runtime.mockImplementation(async () => { controller.abort(); return { settings: { baseUrl: "", model: "", transcriptionModel: "" }, apiKey: "secret", assertCurrent }; });
    await expect(resolve()).rejects.toMatchObject({ name: "AbortError" });
    expect(askCoach).not.toHaveBeenCalled();
  });
  it("checks cancellation after generation", async () => {
    vi.mocked(askCoach).mockImplementation(async () => { controller.abort(); return JSON.stringify(generated); });
    await expect(resolve()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects results if the profile changed during generation", async () => {
    assertCurrent.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error("profile changed"); });
    await expect(resolve()).rejects.toThrow("profile changed");
  });
});
