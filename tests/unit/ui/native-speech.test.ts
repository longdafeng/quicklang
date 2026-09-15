import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { refreshNativeVoices, speakNative } from "../../../src/mac_ui/src/features/speech/native";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("loads native enhanced voices absent from WebKit", async () => {
  const voices = [{ name: "Nathan (Enhanced)", voiceURI: "macos-say:Nathan (Enhanced)", lang: "en-US", localService: true, default: false }];
  vi.mocked(invoke).mockResolvedValueOnce(voices);
  expect(await refreshNativeVoices()).toEqual(voices);
  expect(invoke).toHaveBeenCalledWith("speech_voices");
});

it("does not play audio when cancelled during native rendering", async () => {
  let complete!: (bytes: number[]) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { complete = resolve as typeof complete; }));
  const audio = vi.fn(); vi.stubGlobal("Audio", audio);
  const controller = new AbortController();
  const pending = speakNative("Apple", "macos-say:Nathan (Enhanced)", 1, controller.signal);
  const rejected = expect(pending).rejects.toThrow("cancelled");
  controller.abort(); complete([1, 2, 3]); await rejected;
  expect(audio).not.toHaveBeenCalled();
});

it("plays native audio and releases playback resources on cancellation", async () => {
  vi.mocked(invoke).mockResolvedValueOnce([82, 73, 70, 70]);
  const player = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), onended: null, onerror: null };
  vi.stubGlobal("Audio", class { /** Provide a controllable audio player. */ constructor() { return player; } });
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:voice"), revokeObjectURL: revoke });
  const controller = new AbortController();
  const pending = speakNative("Apple", "macos-say:Nathan (Enhanced)", 1, controller.signal);
  await Promise.resolve();
  expect(player.play).toHaveBeenCalledOnce();
  const rejected = expect(pending).rejects.toThrow("cancelled");
  controller.abort(); await rejected;
  expect(player.pause).toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledWith("blob:voice");
});
