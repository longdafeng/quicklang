import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Recorder } from "../../../src/mac_ui/src/features/listening/Recorder";
import { Recorder as ConversationRecorder } from "../../../src/mac_ui/src/features/conversation/Recorder";
class FakeRecorder {
  static supported = true;
  static instances: FakeRecorder[] = [];
  static isTypeSupported() { return this.supported; }
  state = "inactive"; mimeType = "audio/webm";
  onstop = () => {}; onerror = () => {}; ondataavailable = (_: { data: Blob }) => {};
  constructor() { FakeRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop(); }
  emit(size = 3) { this.ondataavailable({ data: new Blob([new Uint8Array(size)]) }); }
}
let stopTrack: ReturnType<typeof vi.fn>, media: MediaStream, getMedia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  FakeRecorder.instances = []; FakeRecorder.supported = true;
  stopTrack = vi.fn(); media = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  getMedia = vi.fn().mockResolvedValue(media);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: getMedia } }); vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:recording"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function listening() { const callbacks = { onSeconds: vi.fn(), onTranscribe: vi.fn(), onRecording: vi.fn() }; const view = render(<Recorder {...callbacks} disabled={false} />); return { ...callbacks, ...view }; }
it("records, previews, explicitly transcribes and releases the object URL", async () => {
  const callbacks = listening(); fireEvent.click(screen.getByText("开始录音"));
  expect(callbacks.onRecording).toHaveBeenCalledWith(true);
  await screen.findByText("停止录音"); act(() => FakeRecorder.instances[0].emit());
  fireEvent.click(screen.getByText("停止录音"));
  expect(callbacks.onRecording).toHaveBeenLastCalledWith(false); expect(stopTrack).toHaveBeenCalled();
  expect(screen.getByLabelText("我的录音")).toHaveAttribute("src", "blob:recording");
  expect(callbacks.onTranscribe).not.toHaveBeenCalled(); fireEvent.click(screen.getByText("发送录音并转写"));
  expect(callbacks.onTranscribe).toHaveBeenCalledWith(expect.objectContaining({ size: 3, type: "audio/webm" }));
  callbacks.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recording");
});
it.each([0, 8_000_001])("rejects an empty or oversized recording (%i bytes)", async size => {
  const callbacks = listening(); fireEvent.click(screen.getByText("开始录音")); await screen.findByText("停止录音");
  act(() => FakeRecorder.instances[0].emit(size));
  if (size === 0) fireEvent.click(screen.getByText("停止录音"));
  expect(screen.getByRole("alert")).toHaveTextContent("录音为空或超过 8 MB");
  expect(callbacks.onSeconds).not.toHaveBeenCalled(); expect(screen.queryByText("发送录音并转写")).not.toBeInTheDocument();
});
it("does not offer a failed partial recording for transcription", async () => {
  listening(); fireEvent.click(screen.getByText("开始录音")); await screen.findByText("停止录音");
  act(() => { FakeRecorder.instances[0].emit(); FakeRecorder.instances[0].onerror(); });
  expect(screen.getByRole("alert")).toHaveTextContent("录音失败"); expect(screen.queryByText("发送录音并转写")).not.toBeInTheDocument(); expect(stopTrack).toHaveBeenCalled();
});
it("releases a permission grant that arrives after unmount", async () => {
  let resolve!: (s: MediaStream) => void; getMedia.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = listening(); fireEvent.click(screen.getByText("开始录音")); expect(screen.getByText("正在打开麦克风…")).toBeDisabled(); view.unmount();
  await act(async () => resolve(media)); expect(stopTrack).toHaveBeenCalled(); expect(FakeRecorder.instances).toHaveLength(0);
});
it("releases tracks when no supported encoding exists and unlocks the parent", async () => {
  FakeRecorder.supported = false; const callbacks = listening(); fireEvent.click(screen.getByText("开始录音"));
  expect(await screen.findByRole("alert")).toHaveTextContent("没有可用的录音格式"); expect(stopTrack).toHaveBeenCalled(); expect(callbacks.onRecording).toHaveBeenLastCalledWith(false);
});
it("reports denied microphone permission and permits retry", async () => {
  getMedia.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError")); listening(); fireEvent.click(screen.getByText("开始录音"));
  expect(await screen.findByRole("alert")).toHaveTextContent("麦克风权限未开启"); fireEvent.click(screen.getByText("开始录音")); await screen.findByText("停止录音");
});
it("stops at the two-minute recording limit", async () => {
  vi.useFakeTimers(); const callbacks = listening(); fireEvent.click(screen.getByText("开始录音")); await act(async () => {});
  act(() => FakeRecorder.instances[0].emit()); await act(async () => vi.advanceTimersByTime(120_000));
  expect(callbacks.onSeconds).toHaveBeenCalledWith(120); expect(stopTrack).toHaveBeenCalled();
});
it("explains unsupported microphone environments", async () => {
  vi.stubGlobal("navigator", {}); listening(); fireEvent.click(screen.getByText("开始录音")); expect(await screen.findByRole("alert")).toHaveTextContent("不支持录音");
});
it("conversation recorder reports denied permission and permits retry", async () => {
  const onActive = vi.fn(), onRecording = vi.fn(); getMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
  render(<ConversationRecorder busy={false} onActive={onActive} onRecording={onRecording} />); fireEvent.click(screen.getByText("录制回答"));
  expect(await screen.findByRole("alert")).toHaveTextContent("麦克风权限未开启"); expect(onActive).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByText("录制回答")); await screen.findByText("停止录音"); act(() => FakeRecorder.instances[0].emit()); fireEvent.click(screen.getByText("停止录音"));
  await waitFor(() => expect(onRecording).toHaveBeenCalledOnce());
});
it("conversation recorder discards partial data after a device error", async () => {
  const onRecording = vi.fn(); render(<ConversationRecorder busy={false} onActive={vi.fn()} onRecording={onRecording} />);
  fireEvent.click(screen.getByText("录制回答")); await screen.findByText("停止录音");
  act(() => { FakeRecorder.instances[0].emit(); FakeRecorder.instances[0].onerror(); });
  expect(screen.getByRole("alert")).toHaveTextContent("录音失败"); expect(onRecording).not.toHaveBeenCalled(); expect(stopTrack).toHaveBeenCalled();
});
