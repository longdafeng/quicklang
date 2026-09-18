import { invoke } from "@tauri-apps/api/core";
import { usesNativeSpeech } from "../speech/native";
import { useEffect, useRef, useState } from "react";
import { availableVoices, hasEnhancedEnglishVoice, refreshSpeechVoices, loadSpeechSettings, saveSpeechSettings, selectVoice, speak, type SpeechSettings as Preferences } from "../speech/speech";

/** Configure device speech preferences and preview unsaved voices without affecting study settings. */
export function SpeechSettings() {
  const [draft, setDraft] = useState(loadSpeechSettings);
  const [voices, setVoices] = useState(availableVoices);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const preview = useRef<AbortController | null>(null);
  const supported = usesNativeSpeech() || "speechSynthesis" in window;
  const englishVoices = voices.filter(v => v.lang.replaceAll("_", "-").toLowerCase() === draft.accent.toLowerCase());
  const selected = selectVoice(voices, draft.accent, draft.voiceURI);

  useEffect(() => {
    if (!supported) return;
    /** Refresh after system downloads or delayed browser discovery. */
    function refresh() { if (!usesNativeSpeech()) { setVoices(availableVoices()); return; } void refreshSpeechVoices().then(setVoices).catch(() => setError("读取本机音色失败，请重试。")); }
    const synth = window.speechSynthesis;
    synth?.addEventListener?.("voiceschanged", refresh);
    window.addEventListener("focus", refresh);
    refresh();
    return () => {
      synth?.removeEventListener?.("voiceschanged", refresh);
      window.removeEventListener("focus", refresh);
      preview.current?.abort();
    };
  }, [supported]);

  /** Stop any old preview and mark the edited preferences as unsaved. */
  function change(next: Preferences) {
    preview.current?.abort(); setPlaying(false);
    setDraft(next); setMessage(""); setError("");
  }

  /** Persist this device's speech settings and report storage failures. */
  async function save() {
    setError(""); setMessage("");
    try { if (usesNativeSpeech()) await invoke("speech_download_preference", { declined: false }); saveSpeechSettings(draft); setMessage("发音设置已保存，所有学习模式的英文朗读均使用此设置。"); }
    catch { setError("发音设置保存失败，请检查本机存储空间后重试。"); }
  }

  /** Preview the current draft and suppress obsolete results after cancellation. */
  async function listen() {
    preview.current?.abort();
    const controller = new AbortController(); preview.current = controller;
    setPlaying(true); setError("");
    try {
      for (const text of ["Apple", "A", "P", "P", "L", "E", "Apple", "Beautiful. World. I enjoy learning English every day."]) {
        await speak(text, draft.accent, controller.signal, draft);
      }
    }
    catch { if (!controller.signal.aborted) setError("试听失败，请检查系统语音并重试。"); }
    finally { if (!controller.signal.aborted) { setPlaying(false); preview.current = null; } }
  }

  return <section className="study-card system-settings" aria-labelledby="speech-settings-title">
    <h2 id="speech-settings-title">单词发音</h2>
    <p className="muted">使用本机系统语音。美音默认依次选择 Nathan（Enhanced）、Samantha（Enhanced）、Samantha；都不可用时再选择其他本机英语音色。</p>
    {!supported && <p>当前环境不支持系统朗读。</p>}
    <div className="speech-controls">
      <label htmlFor="speech-accent">英语口音</label>
      <select id="speech-accent" value={draft.accent} onChange={e => change({ ...draft, accent: e.target.value as Preferences["accent"], voiceURI: "" })}>
        <option value="en-US">美式英语</option><option value="en-GB">英式英语</option>
      </select>
      <label htmlFor="speech-voice">系统音色</label>
      <select id="speech-voice" disabled={!supported} value={draft.voiceURI} onChange={e => change({ ...draft, voiceURI: e.target.value })}>
        <option value="">自动选择{selected && !draft.voiceURI ? `（${selected.name}）` : ""}</option>
        {draft.voiceURI && !englishVoices.some(v => v.voiceURI === draft.voiceURI) && <option value={draft.voiceURI}>已选音色当前不可用（暂用自动选择）</option>}
        {englishVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
      </select>
      {!englishVoices.length && <p className="muted">暂未发现此口音的本机音色。朗读将尝试其他英语音色或系统默认声音；可下载语音后刷新列表。</p>}
      {!hasEnhancedEnglishVoice(voices) && <aside aria-label="下载增强版音色" className="speech-download-help">
        <strong>想使用增强版音色？</strong>
        <ol>
          <li>打开 Mac「系统设置 → 辅助功能 → 朗读与语音」（旧版叫「朗读内容」）。</li>
          <li>点击「系统声音」旁的 ⓘ 或「管理声音」，进入声音列表，选择「英语（美国）」，点击 Nathan (Enhanced) 或 Samantha (Enhanced) 旁的云朵下载按钮。</li>
          <li>下载完成后，回到这里点击「刷新音色列表」。保持「自动选择」即可按上方顺序使用；手动选择其他音色后，请点击「保存发音设置」。</li>
        </ol>
        <p className="muted">首次下载需要联网，安装后可离线朗读。找不到音色时，可在声音列表中搜索 Enhanced；刷新后仍未出现，可重启 QuickLang。</p>
        <a href="https://support.apple.com/zh-cn/guide/mac-help/mchlp2290/mac" target="_blank" rel="noopener noreferrer">查看 Apple 官方下载说明</a>
      </aside>}
      <label htmlFor="speech-rate">英文语速 · {draft.rate.toFixed(2)}×</label>
      <input id="speech-rate" type="range" min="0.7" max="1.2" step="0.05" value={draft.rate} onChange={e => change({ ...draft, rate: Number(e.target.value) })} />
      <div className="actions">
        <button type="button" disabled={!supported} onClick={() => void listen()}>试听发音</button>
        {playing && <button type="button" onClick={() => { preview.current?.abort(); setPlaying(false); }}>停止试听</button>}
        <button type="button" disabled={!supported} onClick={() => { void refreshSpeechVoices().then(setVoices).catch(() => setError("读取本机音色失败，请重试。")); }}>刷新音色列表</button>
        <button type="button" className="primary" onClick={() => void save()}>保存发音设置</button>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
