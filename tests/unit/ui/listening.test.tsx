import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseSubtitles, advance, newMaterial, intervals, alignment } from "../../../src/ui/src/features/listening/model";
import { Listening } from "../../../src/ui/src/features/listening/Listening";
import { ProfileContext } from "../../../src/ui/src/features/users/profiles";
import * as repository from "../../../src/ui/src/features/listening/repository";
const subtitles = "1\n00:00:01,000 --> 00:00:03,000\nHello, world.\n\n2\n00:00:04,000 --> 00:00:06,500\nKeep practicing.";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("parses SRT and VTT timings and rejects overlapping, malformed and empty subtitles", () => {
  expect(parseSubtitles(subtitles)[1]).toEqual({ start: 4, end: 6.5, text: "Keep practicing." });
  expect(parseSubtitles("WEBVTT\n\n00:01.000 --> 00:03.000 align:start\n<i>Hello</i>")[0].text).toBe("Hello");
  for (const value of ["", "hello", subtitles.replace("00:00:04,000", "00:00:02,000"), subtitles.replace("00:00:03,000", "00:00:00,000"), subtitles.replace("00:00:01,000", "00:61:01,000")]) expect(() => parseSubtitles(value)).toThrow();
});
it("schedules all seven rounds relative to completion and blocks early advancement", () => {
  let material = { ...newMaterial("test", "audio/mpeg"), cues: parseSubtitles(subtitles) }; let now = 1000;
  for (let round = 0; round < 7; round++) {
    for (let stage = 0; stage < 4; stage++) { expect(material.stage).toBe(stage); material = advance(material, now); }
    expect(material.round).toBe(round + 1); expect(material.due).toBe(now + intervals[round] * 1000);
    expect(advance(material, now)).toBe(material); now = material.due!;
  }
  for (let stage = 0; stage < 4; stage++) material = advance(material, now);
  expect(material.completed).toBe(true); expect(material.due).toBeNull(); expect(advance(material, now)).toBe(material);
});
it("matches words in order without reusing repeated words or claiming pronunciation scores", () => {
  expect(alignment("I really really like it", "I really like it").percent).toBe(80);
  expect(alignment("one two three", "three two one").percent).toBe(33);
  expect(alignment("Hello, WORLD!", "hello world").percent).toBe(100);
});
it("isolates the desktop repository by profile and keeps database failure visible", async () => {
  vi.spyOn(repository, "desktopListening").mockReturnValue(true);
  const list = vi.spyOn(repository, "listMaterials").mockRejectedValue(new Error("DB_UNAVAILABLE"));
  render(<ProfileContext.Provider value="profile-a"><Listening settings={{ baseUrl: "", model: "", transcriptionModel: "" }} apiKey="" openSettings={() => {}} /></ProfileContext.Provider>);
  expect(await screen.findByRole("alert")).toHaveTextContent("DB_UNAVAILABLE"); expect(list).toHaveBeenCalledWith("profile-a");
  expect(screen.getByLabelText("导入音频（可多选）")).toBeDisabled();
  list.mockResolvedValue([]); fireEvent.click(screen.getByRole("button", { name: "重试读取材料" }));
  await waitFor(() => expect(screen.getByLabelText("导入音频（可多选）")).toBeEnabled());
});

it("restores the sentence and stage, and does not advance on a failed desktop save", async () => {
  vi.spyOn(repository, "desktopListening").mockReturnValue(true);
  const payload = { ...newMaterial("Restored lesson", "audio/mpeg"), cues: parseSubtitles(subtitles), stage: 1, sentence: 1 };
  vi.spyOn(repository, "listMaterials").mockResolvedValue([{ id: "lesson-1", version: 3, payload }]);
  vi.spyOn(repository, "loadAudio").mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
  const save = vi.spyOn(repository, "saveMaterial").mockRejectedValue(new Error("disk full"));
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:test"); static revokeObjectURL = vi.fn(); });
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(<ProfileContext.Provider value="profile-a"><Listening settings={{ baseUrl: "", model: "", transcriptionModel: "" }} apiKey="" openSettings={() => {}} /></ProfileContext.Provider>);
  fireEvent.click(await screen.findByRole("button", { name: /Restored lesson/ }));
  expect(await screen.findByText("Keep practicing.", { selector: "p.listening-transcript" })).toBeInTheDocument();
  const player = screen.getByLabelText("学习音频") as HTMLAudioElement;
  fireEvent.click(screen.getByRole("button", { name: "循环播放本句" }));
  expect(player.currentTime).toBe(4);
  player.currentTime = 6.5; fireEvent.timeUpdate(player); expect(player.currentTime).toBe(4);
  player.currentTime = 6.5; fireEvent.timeUpdate(player); expect(pause).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "完成跟读，进入盲听" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.getByRole("button", { name: "完成跟读，进入盲听" })).toBeInTheDocument();
  save.mockImplementation(async (_owner, entry, next) => ({ ...entry, version: entry.version + 1, payload: next }));
  fireEvent.click(screen.getByRole("button", { name: "完成跟读，进入盲听" }));
  expect(await screen.findByText("先听音频，再试着说出来")).toBeInTheDocument();
  expect(save).toHaveBeenLastCalledWith("profile-a", expect.objectContaining({ version: 3 }), expect.objectContaining({ stage: 2, sentence: 0 }));
});

it("requires real ASR timing segments and propagates cancellation", async () => {
  const { generateSubtitles } = await import("../../../src/ui/src/features/listening/ai");
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "Untimed transcript" })));
  vi.stubGlobal("fetch", fetcher);
  const settings = { baseUrl: "https://models.example/v1", model: "chat", transcriptionModel: "asr" };
  const blob = new Blob(["audio"], { type: "audio/mpeg" });
  await expect(generateSubtitles(settings, "", blob, new AbortController().signal)).rejects.toThrow("未返回时间戳");
  fetcher.mockResolvedValue(new Response(JSON.stringify({ segments: [{ start: 0, end: 1, text: "Hello" }] })));
  expect(await generateSubtitles(settings, "", blob, new AbortController().signal)).toEqual([{ start: 0, end: 1, text: "Hello" }]);
  const controller = new AbortController(); controller.abort();
  fetcher.mockResolvedValue(new Response(JSON.stringify({ segments: [{ start: 0, end: 1, text: "Hello" }] })));
  await expect(generateSubtitles(settings, "", blob, controller.signal)).rejects.toThrow("已取消");
});

it("exits difficult-card mode when its last bookmark is removed", async () => {
  vi.spyOn(repository, "desktopListening").mockReturnValue(true);
  const payload = { ...newMaterial("Flash regression", "audio/mpeg"), cues: parseSubtitles(subtitles), difficult: [0] };
  vi.spyOn(repository, "listMaterials").mockResolvedValue([{ id: "flash-1", version: 1, payload }]);
  vi.spyOn(repository, "loadAudio").mockResolvedValue(new Blob(["audio"]));
  vi.spyOn(repository, "saveMaterial").mockImplementation(async (_owner, entry, payload) => ({ ...entry, version: entry.version + 1, payload }));
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:test"); static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  render(<ProfileContext.Provider value="profile-a"><Listening settings={{ baseUrl: "", model: "", transcriptionModel: "" }} apiKey="" openSettings={() => {}} /></ProfileContext.Provider>);
  fireEvent.click(await screen.findByRole("button", { name: /Flash regression/ }));
  fireEvent.click(await screen.findByRole("button", { name: "难句闪卡（1）" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "取消难句收藏" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "取消难句收藏" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "下一张难句" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "难句闪卡（0）" })).toBeDisabled();
  expect(screen.getByText("Hello, world.", { selector: "p.listening-transcript" })).toBeInTheDocument();
});

it("preserves a retelling draft when completing the round fails to save", async () => {
  vi.spyOn(repository, "desktopListening").mockReturnValue(true);
  const payload = { ...newMaterial("Draft regression", "audio/mpeg"), cues: parseSubtitles(subtitles), stage: 3, retelling: "My saved story" };
  vi.spyOn(repository, "listMaterials").mockResolvedValue([{ id: "draft-1", version: 1, payload }]);
  vi.spyOn(repository, "loadAudio").mockResolvedValue(new Blob(["audio"]));
  vi.spyOn(repository, "saveMaterial").mockRejectedValue(new Error("disk full"));
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:test"); static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  render(<ProfileContext.Provider value="profile-a"><Listening settings={{ baseUrl: "", model: "", transcriptionModel: "" }} apiKey="" openSettings={() => {}} /></ProfileContext.Provider>);
  fireEvent.click(await screen.findByRole("button", { name: /Draft regression/ }));
  const draft = await screen.findByLabelText("我的复述"); fireEvent.change(draft, { target: { value: "My unsaved story" } });
  fireEvent.click(screen.getByRole("button", { name: "完成本轮并安排复习" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("disk full"); expect(draft).toHaveValue("My unsaved story");
  expect(screen.getByRole("button", { name: "完成本轮并安排复习" })).toBeEnabled();
});

async function openLesson(overrides: Partial<ReturnType<typeof newMaterial>> = {}) {
  vi.spyOn(repository, "desktopListening").mockReturnValue(true);
  const payload = { ...newMaterial("Coverage lesson", "audio/mpeg"), cues: parseSubtitles(subtitles), ...overrides };
  vi.spyOn(repository, "listMaterials").mockResolvedValue([{ id: "coverage", version: 1, payload }]);
  vi.spyOn(repository, "loadAudio").mockResolvedValue(new Blob(["audio"]));
  const save = vi.spyOn(repository, "saveMaterial").mockImplementation(async (_owner, entry, payload) => ({ ...entry, version: entry.version + 1, payload }));
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:test"); static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const view = render(<ProfileContext.Provider value="alice"><Listening settings={{ baseUrl: "https://models.example/v1", model: "chat", transcriptionModel: "asr" }} apiKey="" openSettings={() => {}} /></ProfileContext.Provider>);
  fireEvent.click(await screen.findByRole("button", { name: /Coverage lesson/ })); await screen.findByLabelText("学习音频");
  return { save, ...view };
}
it("imports timed subtitles and handles malformed or out-of-range subtitles", async () => {
  const { save } = await openLesson({ cues: [] });
  const player = screen.getByLabelText("学习音频"); Object.defineProperty(player, "duration", { configurable: true, value: 10 }); fireEvent.loadedMetadata(player);
  const upload = (size: number, text: string) => fireEvent.change(screen.getByLabelText("导入 SRT / VTT 字幕"), { target: { files: [{ size, text: async () => text }] } });
  upload(400001, ""); expect(await screen.findByRole("alert")).toHaveTextContent("400 KB");
  upload(10, "bad"); expect(await screen.findByRole("alert")).toHaveTextContent("时间轴");
  upload(100, subtitles.replace("00:00:06,500", "00:00:16,500")); expect(await screen.findByRole("alert")).toHaveTextContent("超出了音频时长");
  upload(100, subtitles); await screen.findByRole("button", { name: "下一句" }); expect(save).toHaveBeenCalledWith("alice", expect.anything(), expect.objectContaining({ cues: parseSubtitles(subtitles) }));
});
it("saves AI sentence explanations and supports sentence selection and player errors", async () => {
  const ai = await import("../../../src/ui/src/features/conversation/ai"); vi.spyOn(ai, "askCoach").mockResolvedValue("中文讲解");
  const { save } = await openLesson(); fireEvent.click(screen.getByText("AI 翻译、意群与词汇讲解")); expect(await screen.findByText("中文讲解")).toBeInTheDocument();
  expect(save).toHaveBeenLastCalledWith("alice", expect.anything(), expect.objectContaining({ notes: { 0: "中文讲解" } }));
  fireEvent.click(screen.getByRole("button", { name: "下一句" })); await waitFor(() => expect(screen.getByRole("button", { name: "上一句" })).toBeEnabled());
  expect(screen.getByText("Keep practicing.", { selector: "p.listening-transcript" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "上一句" })); await waitFor(() => expect(screen.getByRole("button", { name: "上一句" })).toBeDisabled());
  fireEvent.change(screen.getByLabelText("播放速度"), { target: { value: "0.75" } }); expect((screen.getByLabelText("学习音频") as HTMLAudioElement).playbackRate).toBe(.75);
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("codec")); fireEvent.click(screen.getByText("从头播放")); expect(await screen.findByRole("alert")).toHaveTextContent("音频播放失败");
  fireEvent.error(screen.getByLabelText("学习音频")); expect(screen.getByRole("alert")).toHaveTextContent("无法读取此音频");
});
it("saves a retelling and displays AI feedback without changing the draft", async () => {
  const ai = await import("../../../src/ui/src/features/conversation/ai"); const ask = vi.spyOn(ai, "askCoach").mockResolvedValue("Try a clearer ending.");
  const { save } = await openLesson({ stage: 3 }); fireEvent.change(screen.getByLabelText("我的复述"), { target: { value: "My story" } });
  fireEvent.click(screen.getByText("保存复述草稿")); await waitFor(() => expect(save).toHaveBeenCalledWith("alice", expect.anything(), expect.objectContaining({ retelling: "My story" })));
  await waitFor(() => expect(screen.getByText("发送复述并获取 AI 反馈")).toBeEnabled()); fireEvent.click(screen.getByText("发送复述并获取 AI 反馈"));
  expect(await screen.findByText("Try a clearer ending.")).toBeInTheDocument(); expect(screen.getByLabelText("我的复述")).toHaveValue("My story"); expect(ask).toHaveBeenCalledOnce();
});
it("retains material when deletion fails and removes it after a successful retry", async () => {
  const remove = vi.spyOn(repository, "deleteMaterial").mockRejectedValueOnce(new Error("VERSION_CONFLICT")).mockResolvedValue();
  await openLesson(); fireEvent.click(screen.getByText("删除这段材料")); fireEvent.click(screen.getByText("取消")); expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("删除这段材料")); fireEvent.click(screen.getByText("确认删除材料")); expect(await screen.findByRole("alert")).toHaveTextContent("VERSION_CONFLICT");
  fireEvent.click(screen.getByText("确认删除材料")); expect(await screen.findByText("还没有听力材料，先导入一段你想练习的英语音频。")).toBeInTheDocument(); expect(remove).toHaveBeenCalledTimes(2);
});
it("keeps successful audio imports when a later file is invalid", async () => {
  vi.spyOn(repository, "desktopListening").mockReturnValue(true); vi.spyOn(repository, "listMaterials").mockResolvedValue([]);
  const save = vi.spyOn(repository, "saveMaterial").mockImplementation(async (_owner, entry, payload) => ({ ...entry, version: 1, payload }));
  render(<ProfileContext.Provider value="alice"><Listening settings={{ baseUrl: "", model: "", transcriptionModel: "" }} apiKey="" openSettings={() => {}} /></ProfileContext.Provider>);
  await waitFor(() => expect(screen.getByLabelText("导入音频（可多选）")).toBeEnabled());
  const file = { name: "My audio.mp3", size: 3, arrayBuffer: async () => new Uint8Array([1,2,3]).buffer };
  fireEvent.change(screen.getByLabelText("导入音频（可多选）"), { target: { files: [file, { ...file, name: "bad.txt" }] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("此前成功导入的材料已保留"); expect(screen.getByRole("button", { name: /My audio/ })).toBeInTheDocument(); expect(save).toHaveBeenCalledOnce();
});
it("keeps the answer draft when saving sentence navigation fails", async () => {
  const { save } = await openLesson({ stage: 1 }); save.mockRejectedValue(new Error("disk full"));
  fireEvent.change(screen.getByLabelText("跟读转写（也可手动输入）"), { target: { value: "My unsaved answer" } });
  fireEvent.click(screen.getByRole("button", { name: "下一句" })); expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
  expect(screen.getByLabelText("跟读转写（也可手动输入）")).toHaveValue("My unsaved answer");
  expect(screen.getByText("Hello, world.", { selector: "p.listening-transcript" })).toBeInTheDocument();
});
