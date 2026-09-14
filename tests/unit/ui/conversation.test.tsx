import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Conversation } from "../../../src/ui/src/features/conversation/Conversation";
import { compareSentence, parseGeneratedLesson } from "../../../src/ui/src/features/conversation/lessons";
import { emptySettings, endpoint } from "../../../src/ui/src/features/conversation/ai";
import { ProfileContext } from "../../../src/ui/src/features/users/profiles";
import { Recorder } from "../../../src/ui/src/features/conversation/Recorder";
const ask = vi.hoisted(() => vi.fn());
vi.mock("../../../src/ui/src/features/conversation/ai", async importOriginal => ({ ...await importOriginal<object>(), askCoach: ask }));
const words = [{ id: "test", spelling: "practice", meaning: "练习", example: "We practice every day.", exampleTranslation: "我们每天练习。" }];
function view(configured = false) { return render(<ProfileContext.Provider value="learner"><Conversation words={words} bookId="book" onWrong={vi.fn()} settings={configured ? { baseUrl: "http://localhost:11434/v1", model: "local", transcriptionModel: "" } : emptySettings} apiKey="secret" openSettings={vi.fn()} /></ProfileContext.Provider>); }
beforeEach(() => { localStorage.clear(); ask.mockReset(); });
describe("listening and speaking", () => {
  it("aligns missing words without shifting the rest and tolerates punctuation", () => {
    expect(compareSentence("We practice every day.", "we every day!")).toEqual([{ text: "we", kind: "correct" }, { text: "practice", kind: "missing" }, { text: "every", kind: "correct" }, { text: "day", kind: "correct" }]);
    expect(compareSentence("I'll go.", "I’ll go!").every(t => t.kind === "correct")).toBe(true);
  });
  it("hides reference text, stores first attempt and hinted retry under the user", () => {
    view(); fireEvent.change(screen.getByLabelText("练习材料"), { target: { value: "word:test:We practice every day." } });
    expect(screen.queryByText("We practice every day.")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("听写当前句"), { target: { value: "we every day" } }); fireEvent.click(screen.getByText("检查听写并保存"));
    expect(screen.getByText("缺：practice")).toBeInTheDocument();
    fireEvent.click(screen.getByText("隐藏答案再试一次"));
    fireEvent.change(screen.getByLabelText("听写当前句"), { target: { value: "We practice every day!" } }); fireEvent.click(screen.getByText("检查听写并保存"));
    const records = JSON.parse(localStorage.getItem("quicklang:user:learner:conversation:book")!);
    expect(records).toHaveLength(2); expect(records[0]).toMatchObject({ correct: false, hints: 0 }); expect(records[1]).toMatchObject({ correct: true, hints: 1 });
    expect(localStorage.getItem("quicklang:conversation:book")).toBeNull();
  });
  it("requires all comprehension answers and saves them", () => {
    view(); expect(screen.getByText("检查理解并保存")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("周五上午")); fireEvent.click(screen.getByLabelText("提前二十分钟到达")); fireEvent.click(screen.getByText("检查理解并保存"));
    expect(JSON.parse(localStorage.getItem("quicklang:user:learner:conversation:book")!)[0]).toMatchObject({ kind: "comprehension", correct: true });
  });
  it("preserves the original answer before AI feedback and retains both records", async () => {
    let finish!: (s: string) => void; ask.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; })); view(true);
    fireEvent.change(screen.getByLabelText("我的表达 / 核对后的转写"), { target: { value: "I'd like a ticket for Saturday." } }); fireEvent.click(screen.getByText("发送回答，获取 AI 反馈"));
    expect(JSON.parse(localStorage.getItem("quicklang:user:learner:conversation:book")!)).toHaveLength(1);
    await act(async () => finish("表达清楚。What time would you like to leave?"));
    const records = JSON.parse(localStorage.getItem("quicklang:user:learner:conversation:book")!); expect(records).toHaveLength(2); expect(records[1].feedback).toContain("What time");
    expect(JSON.stringify(localStorage)).not.toContain("secret");
  });
  it("keeps the user's work when AI fails", async () => {
    ask.mockRejectedValue(new Error("服务不可用")); view(true);
    fireEvent.change(screen.getByLabelText("我的表达 / 核对后的转写"), { target: { value: "My answer" } }); fireEvent.click(screen.getByText("发送回答，获取 AI 反馈"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("服务不可用")); expect(screen.getByLabelText("我的表达 / 核对后的转写")).toHaveValue("My answer");
  });
  it("does not report completion when local storage fails", () => {
    view(); const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.change(screen.getByLabelText("听写当前句"), { target: { value: "answer" } }); fireEvent.click(screen.getByText("检查听写并保存"));
    expect(screen.getByRole("alert")).toHaveTextContent("记录保存失败"); expect(screen.queryByText("隐藏答案再试一次")).not.toBeInTheDocument(); spy.mockRestore();
  });
  it("rejects malformed generated exercises and insecure endpoints", () => {
    expect(() => parseGeneratedLesson('{"title":"missing fields"}')).toThrow();
    for (const url of ["http://example.com/v1", "https://secret@example.com", "https://example.com?key=x"]) expect(() => endpoint(url, "chat/completions")).toThrow();
    expect(endpoint("http://localhost:11434/v1/", "chat/completions")).toBe("http://localhost:11434/v1/chat/completions");
  });
  it("validates and saves an AI-generated lesson before selecting it", async () => {
    ask.mockResolvedValue(JSON.stringify({ title: "一起练习", lines: [{ en: "Let's practice together.", zh: "一起练习吧。" }, { en: "Can we start at six?", zh: "六点开始好吗？" }], questions: [{ prompt: "做什么？", options: ["练习", "吃饭", "旅行"], answer: 0 }, { prompt: "几点？", options: ["五点", "六点", "七点"], answer: 1 }], task: "邀请朋友明天练习" }));
    view(true); fireEvent.click(screen.getByText("发送词汇，AI 生成新情境"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "一起练习" })).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("quicklang:user:learner:generated-lessons:book")!)).toHaveLength(1);
    expect(screen.getByText("AI 生成练习 · 未经语言审核 · 合成语音")).toBeInTheDocument();
  });
  it("records audio and releases the microphone when stopped", async () => {
    const trackStop = vi.fn(), received = vi.fn(); const old = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) } });
    class MockRecorder {
      static isTypeSupported() { return true; }
      state = "inactive"; mimeType = "audio/webm";
      ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void;
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) }); this.onstop?.(); }
    }
    vi.stubGlobal("MediaRecorder", MockRecorder);
    const oldCreate = URL.createObjectURL; URL.createObjectURL = vi.fn(() => "blob:recording");
    const result = render(<Recorder onRecording={received} onActive={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByText("录制回答")); await waitFor(() => expect(screen.getByText("停止录音")).toBeInTheDocument()); fireEvent.click(screen.getByText("停止录音"));
    expect(trackStop).toHaveBeenCalled(); expect(received.mock.calls[0][0].blob.size).toBe(5); expect(screen.getByText("录制回答")).toBeEnabled();
    result.unmount(); URL.createObjectURL = oldCreate; Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: old }); vi.unstubAllGlobals();
  });
  it("stops microphone tracks if permission resolves after unmount", async () => {
    let finish!: (s: MediaStream) => void; const stop = vi.fn();
    const old = navigator.mediaDevices; Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => new Promise<MediaStream>(resolve => { finish = resolve; })) } });
    vi.stubGlobal("MediaRecorder", class {});
    const result = render(<Recorder onRecording={vi.fn()} onActive={vi.fn()} busy={false} />); fireEvent.click(screen.getByText("录制回答")); result.unmount();
    await act(async () => finish({ getTracks: () => [{ stop }] } as unknown as MediaStream)); expect(stop).toHaveBeenCalledOnce();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: old }); vi.unstubAllGlobals();
  });
});
