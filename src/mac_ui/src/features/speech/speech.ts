import { usesNativeSpeech, nativeVoices, refreshNativeVoices, speakNative, stopNativeSpeech } from "./native";

export interface SpeechSettings {
  accent: "en-US" | "en-GB";
  voiceURI: string;
  rate: number;
}

const storageKey = "quicklang:speech-settings";

/** Load device-wide preferences, recovering safely from invalid storage. */
export function loadSpeechSettings(): SpeechSettings {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return {
      accent: value?.accent === "en-GB" ? "en-GB" : "en-US",
      voiceURI: typeof value?.voiceURI === "string" ? value.voiceURI : "",
      rate: typeof value?.rate === "number" && value.rate >= 0.7 && value.rate <= 1.2 ? value.rate : 1,
    };
  } catch { return { accent: "en-US", voiceURI: "", rate: 1 }; }
}

/** Persist preferences; storage errors are reported to the caller. */
export function saveSpeechSettings(settings: SpeechSettings): void {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

/** Normalize platform language tags for exact accent matching. */
function normalize(lang: string): string { return lang.replaceAll("_", "-").toLowerCase(); }

/** Rank explicit quality labels without assuming the API exposes actual voice quality. */
function quality(voice: SpeechSynthesisVoice): number {
  const label = `${voice.name} ${voice.voiceURI}`;
  return /premium|优质/i.test(label) ? 3 : /enhanced|增强/i.test(label) ? 2 : voice.default ? 1 : 0;
}

/** Check installed English voices independently of the selected accent or voice. */
export function hasEnhancedEnglishVoice(voices: SpeechSynthesisVoice[]): boolean {
  return voices.some(voice => voice.localService && normalize(voice.lang).split("-")[0] === "en" && quality(voice) >= 2);
}

/** Prefer conventional narration voices when WebKit provides no default or quality labels. */
function narrationPreference(voice: SpeechSynthesisVoice): number {
  return /^(Samantha|Alex|Daniel|Karen|Moira|Tessa|Tingting|Meijia)(\b|$)/i.test(voice.name) ? 1 : 0;
}

/** Rank the requested US default chain using both Apple identifiers and display names. */
function defaultVoicePreference(voice: SpeechSynthesisVoice, language: string): number {
  if (language !== "en-us" || normalize(voice.lang) !== language) return 0;
  const enhanced = /enhanced|增强/i.test(`${voice.name} ${voice.voiceURI}`);
  const nathan = /^Nathan(\b|$)/i.test(voice.name) || /[._-]Nathan$/i.test(voice.voiceURI);
  const samantha = /^Samantha(\b|$)/i.test(voice.name) || /[._-]Samantha$/i.test(voice.voiceURI);
  if (nathan && enhanced) return 3;
  if (samantha && enhanced) return 2;
  return samantha ? 1 : 0;
}

/** Honor saved choices, then apply the US default chain before generic accent and quality fallbacks. */
export function selectVoice(voices: SpeechSynthesisVoice[], lang: string, voiceURI = ""): SpeechSynthesisVoice | undefined {
  const language = normalize(lang);
  const candidates = voices.filter(v => v.localService && normalize(v.lang).split("-")[0] === language.split("-")[0]);
  const preferred = candidates.find(v => v.voiceURI === voiceURI && normalize(v.lang) === language);
  if (preferred) return preferred;
  return candidates.sort((a, b) => Number(normalize(b.lang) === language) - Number(normalize(a.lang) === language)
    || defaultVoicePreference(b, language) - defaultVoicePreference(a, language)
    || quality(b) - quality(a) || narrationPreference(b) - narrationPreference(a)
    || a.name.localeCompare(b.name))[0];
}

/** Return local voices exposed by the current browser or desktop webview. */
export function availableVoices(): SpeechSynthesisVoice[] {
  if (usesNativeSpeech()) return nativeVoices();
  return "speechSynthesis" in window ? window.speechSynthesis.getVoices().filter(v => v.localService) : [];
}

/** Refresh installed desktop voices or the browser voice snapshot. */
export async function refreshSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  return usesNativeSpeech() ? refreshNativeVoices() : availableVoices();
}

/** Await delayed voice discovery for at most one second, with cancellation and cleanup. */
function waitForVoices(synth: SpeechSynthesis, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, 1000);
    /** Release discovery listeners and complete the wait. */
    function finish() {
      clearTimeout(timer);
      synth.removeEventListener("voiceschanged", changed);
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new Error("cancelled")); else resolve();
    }
    /** Complete discovery once the platform publishes voices. */
    function changed() { if (synth.getVoices().length) finish(); }
    /** End discovery immediately when the learning session stops. */
    function abort() { finish(); }
    synth.addEventListener("voiceschanged", changed);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted || synth.getVoices().length) finish();
  });
}

/** Cancel system playback; active utterances also settle through their abort signal. */
export function stopSpeech(): void { stopNativeSpeech(); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }

/** Speak with saved preferences (or a preview override), rejecting failures and cancellation. */
export async function speak(text: string, lang: string, signal: AbortSignal, settings = loadSpeechSettings(), pauseScale = 1): Promise<void> {
  if (signal.aborted) throw new Error("cancelled");
  if (usesNativeSpeech()) {
    const english = normalize(lang).split("-")[0] === "en";
    const language = english ? settings.accent : lang;
    const voices = await refreshNativeVoices();
    if (signal.aborted) throw new Error("cancelled");
    const voice = selectVoice(voices, language, english ? settings.voiceURI : "");
    if (!voice) throw new Error("未找到可用的本机音色，请下载对应语言音色。");
    return speakNative(text, voice.voiceURI, english ? settings.rate : 1, signal, pauseScale);
  }
  if (!("speechSynthesis" in window)) throw new Error("当前环境不支持朗读，请使用支持语音的浏览器或客户端。");
  const synth = window.speechSynthesis;
  if (!synth.getVoices().length && typeof synth.addEventListener === "function") await waitForVoices(synth, signal);
  if (signal.aborted) throw new Error("cancelled");
  const english = normalize(lang).startsWith("en-") || lang === "en";
  const language = english ? settings.accent : lang;
  const voice = selectVoice(synth.getVoices(), language, english ? settings.voiceURI : "");
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang ?? language;
    if (voice) utterance.voice = voice;
    utterance.rate = english ? settings.rate : 1;
    /** Settle playback once and remove signal and utterance handlers. */
    function finish(error?: Error) {
      signal.removeEventListener("abort", abort);
      utterance.onend = null; utterance.onerror = null;
      if (error) reject(error); else resolve();
    }
    /** Detach callbacks before stopping to avoid platform cancellation races. */
    function abort() { finish(new Error("cancelled")); synth.cancel(); }
    signal.addEventListener("abort", abort, { once: true });
    utterance.onend = () => finish();
    utterance.onerror = () => finish(new Error("朗读失败，请检查系统语音并重试。"));
    try { synth.speak(utterance); }
    catch { finish(new Error("朗读失败，请检查系统语音并重试。")); }
  });
}
