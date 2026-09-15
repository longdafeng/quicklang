import { shortenEdgeSilence } from "./silence";
import { invoke, isTauri } from "@tauri-apps/api/core";

let cachedVoices: SpeechSynthesisVoice[] = [];
let active: AbortController | undefined;

/** Detect the desktop bridge without affecting browser-only speech. */
export function usesNativeSpeech(): boolean { return isTauri(); }

/** Return the last native enumeration for synchronous settings rendering. */
export function nativeVoices(): SpeechSynthesisVoice[] { return cachedVoices; }

/** Refresh installed macOS voices through the native bridge. */
export async function refreshNativeVoices(): Promise<SpeechSynthesisVoice[]> {
  cachedVoices = await invoke<SpeechSynthesisVoice[]>("speech_voices");
  return cachedVoices;
}

/** Stop local audio and prevent a pending render from starting playback. */
export function stopNativeSpeech(): void { active?.abort(); }

/** Render a native voice and play its WAV with cancellation and object URL cleanup. */
export async function speakNative(text: string, voiceURI: string, rate: number, signal: AbortSignal, pauseScale = 1): Promise<void> {
  stopNativeSpeech();
  const controller = new AbortController(); active = controller;
  /** Forward caller cancellation to pending generation and active playback. */
  function abort() { controller.abort(); }
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw new Error("cancelled");
    const bytes = await invoke<number[]>("speech_render", { text, voiceUri: voiceURI, rate });
    if (controller.signal.aborted) throw new Error("cancelled");
    const url = URL.createObjectURL(new Blob([shortenEdgeSilence(new Uint8Array(bytes), pauseScale)], { type: "audio/wav" }));
    const audio = new Audio(url);
    try {
      await new Promise<void>((resolve, reject) => {
        /** Settle playback once and release audio event handlers. */
        function finish(error?: Error) {
          controller.signal.removeEventListener("abort", cancelled);
          audio.onended = null; audio.onerror = null;
          if (error) reject(error); else resolve();
        }
        /** Stop playback when the learning session or preview is cancelled. */
        function cancelled() { audio.pause(); finish(new Error("cancelled")); }
        controller.signal.addEventListener("abort", cancelled, { once: true });
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error("本机语音播放失败"));
        audio.play().catch(() => finish(new Error("本机语音播放失败")));
      });
    } finally { audio.pause(); URL.revokeObjectURL(url); }
  } finally {
    signal.removeEventListener("abort", abort);
    if (active === controller) active = undefined;
  }
}
