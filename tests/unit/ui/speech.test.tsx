import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpeechSettings } from "../../../src/mac_ui/src/features/settings/SpeechSettings";
import { loadSpeechSettings, saveSpeechSettings, selectVoice, speak } from "../../../src/mac_ui/src/features/speech/speech";

/** Create a local voice fixture with a stable identifier. */
function voice(name: string, lang = "en-US", localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, voiceURI: name, default: false };
}
let voices: SpeechSynthesisVoice[];
let utterances: SpeechSynthesisUtterance[];
let synth: EventTarget & { getVoices: () => SpeechSynthesisVoice[]; speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
beforeEach(() => {
  localStorage.clear(); voices = [voice("Basic"), voice("Ava Enhanced"), voice("Daniel Premium", "en-GB")]; utterances = [];
  synth = Object.assign(new EventTarget(), { getVoices: () => voices, speak: vi.fn(u => utterances.push(u)), cancel: vi.fn() });
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    /** Retain preview text for playback assertions. */
    constructor(public text: string) {}
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("prioritizes accent before quality and honors explicit local choices", () => {
  expect(selectVoice(voices, "en-US")?.name).toBe("Ava Enhanced");
  expect(selectVoice(voices, "en-US", "Basic")?.name).toBe("Basic");
  expect(selectVoice(voices, "en-GB", "Basic")?.name).toBe("Daniel Premium");
  expect(selectVoice([voice("Remote Premium", "en-US", false), voice("Basic")], "en-US")?.name).toBe("Basic");
  expect(selectVoice([voice("Daniel", "en_GB")], "en-GB")?.name).toBe("Daniel");
  expect(selectVoice([voice("French", "fr-FR")], "en-US")).toBeUndefined();
});

it("prefers Samantha over Albert when desktop WebKit marks no default voice", () => {
  const desktopVoices = [voice("Albert"), voice("Samantha"), voice("Whisper")];
  expect(selectVoice(desktopVoices, "en-US")?.name).toBe("Samantha");
  expect(selectVoice(desktopVoices, "en-US", "Albert")?.name).toBe("Albert");
  expect(selectVoice([...desktopVoices, voice("Ava Enhanced")], "en-US")?.name).toBe("Samantha");
});

it("saves and restores preferences, previews drafts, and applies them to shared playback", async () => {
  const view = render(<SpeechSettings />);
  fireEvent.change(screen.getByLabelText("英语口音"), { target: { value: "en-GB" } });
  fireEvent.change(screen.getByLabelText("系统音色"), { target: { value: "Daniel Premium" } });
  fireEvent.change(screen.getByLabelText(/英文语速/), { target: { value: "0.9" } });
  fireEvent.click(screen.getByText("试听发音"));
  expect(utterances[0]).toMatchObject({ lang: "en-GB", voice: voices[2], rate: 0.9 });
  expect(loadSpeechSettings().accent).toBe("en-US");
  fireEvent.click(screen.getByText("保存发音设置"));
  view.unmount();
  expect(synth.cancel).toHaveBeenCalled();
  render(<SpeechSettings />);
  expect(screen.getByLabelText("系统音色")).toHaveValue("Daniel Premium");
  const pending = speak("word", "en-US", new AbortController().signal);
  expect(utterances[1]).toMatchObject({ lang: "en-GB", voice: voices[2], rate: 0.9 });
  utterances[1].onend?.(new Event("end") as SpeechSynthesisEvent); await pending;
  const chinese = speak("单词", "zh-CN", new AbortController().signal);
  expect(utterances[2]).toMatchObject({ lang: "zh-CN", rate: 1 });
  utterances[2].onend?.(new Event("end") as SpeechSynthesisEvent); await chinese;
});

it("updates delayed lists and recovers from an unavailable saved voice", () => {
  saveSpeechSettings({ accent: "en-US", voiceURI: "Removed", rate: 1 });
  voices = []; render(<SpeechSettings />);
  expect(screen.getByText(/已选音色当前不可用/)).toBeInTheDocument();
  voices = [voice("New Enhanced")];
  act(() => { synth.dispatchEvent(new Event("voiceschanged")); });
  expect(screen.getByRole("option", { name: /New Enhanced/ })).toBeInTheDocument();
  fireEvent.click(screen.getByText("试听发音"));
  expect(utterances[0].voice).toBe(voices[0]);
});

it("previews Apple with each letter separately and stops the sequence on cancellation", async () => {
  render(<SpeechSettings />);
  fireEvent.click(screen.getByText("试听发音"));
  for (const [index, text] of ["Apple", "A", "P", "P", "L", "E", "Apple"].entries()) {
    expect(utterances[index].text).toBe(text);
    await act(async () => { utterances[index].onend?.(new Event("end") as SpeechSynthesisEvent); });
  }
  expect(utterances[7].text).toBe("Beautiful. World. I enjoy learning English every day.");
  fireEvent.click(screen.getByText("停止试听"));
  expect(synth.cancel).toHaveBeenCalled();
  expect(screen.queryByText("停止试听")).not.toBeInTheDocument();
});

it("waits for voice discovery and aborts pending discovery without playback", async () => {
  voices = []; vi.useFakeTimers();
  const controller = new AbortController();
  const pending = speak("word", "en-US", controller.signal);
  const rejected = expect(pending).rejects.toThrow("cancelled");
  controller.abort(); await rejected;
  expect(vi.getTimerCount()).toBe(0); expect(synth.speak).not.toHaveBeenCalled();
  const next = speak("word", "en-US", new AbortController().signal);
  voices = [voice("Ava Enhanced")]; synth.dispatchEvent(new Event("voiceschanged"));
  await Promise.resolve();
  expect(utterances[0].voice).toBe(voices[0]);
  utterances[0].onend?.(new Event("end") as SpeechSynthesisEvent); await next;
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds discovery waits and cleans up cancellation during speech", async () => {
  voices = []; vi.useFakeTimers();
  const controller = new AbortController();
  const pending = speak("word", "en-US", controller.signal);
  await vi.advanceTimersByTimeAsync(1000);
  expect(utterances).toHaveLength(1);
  const rejected = expect(pending).rejects.toThrow("cancelled");
  controller.abort(); await rejected;
  expect(utterances[0].onend).toBeNull(); expect(synth.cancel).toHaveBeenCalled();
});

it("reports storage failures and safely loads corrupt settings", () => {
  localStorage.setItem("quicklang:speech-settings", "broken");
  expect(loadSpeechSettings()).toEqual({ accent: "en-US", voiceURI: "", rate: 1 });
  localStorage.setItem("quicklang:speech-settings", '{"rate":99,"voiceURI":23}');
  expect(loadSpeechSettings().rate).toBe(1);
  render(<SpeechSettings />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  fireEvent.click(screen.getByText("保存发音设置"));
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});


it("uses the US default chain as voices disappear and honors an explicit override", () => {
  const nathan = { ...voice("Nathan"), voiceURI: "com.apple.voice.enhanced.en-US.Nathan" };
  const samantha = { ...voice("Samantha"), voiceURI: "com.apple.voice.enhanced.en-US.Samantha" };
  const basic = { ...voice("Samantha"), voiceURI: "com.apple.voice.compact.en-US.Samantha" };
  const alternatives = [voice("Ava Premium"), voice("Nathan"), voice("Daniel Enhanced", "en-GB")];
  expect(selectVoice([...alternatives, basic, samantha, nathan], "en-US")).toBe(nathan);
  expect(selectVoice([...alternatives, basic, samantha], "en-US", nathan.voiceURI)).toBe(samantha);
  expect(selectVoice([...alternatives, basic], "en-US", nathan.voiceURI)).toBe(basic);
  expect(selectVoice(alternatives, "en-US")?.name).toBe("Ava Premium");
  expect(selectVoice([nathan, basic], "en-US", basic.voiceURI)).toBe(basic);
  expect(selectVoice([...alternatives, nathan], "en-GB")?.name).toBe("Daniel Enhanced");
  expect(selectVoice([voice("Samantha (Enhanced)"), voice("Nathan (Enhanced)", "en_US")], "en-US")?.name).toBe("Nathan (Enhanced)");
});
