import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usesNativeSpeech, refreshNativeVoices } from "./native";
import { loadSpeechSettings, saveSpeechSettings } from "./speech";

type DownloadStatus = "installed" | "started" | "permissionRequired" | "manual";

type Stage = "checking" | "prompt" | "waiting" | "error" | "ready";

/** Detect either supported enhanced US voice by its native display name or Apple identifier. */
export function hasPreferredEnhancedVoice(voices: SpeechSynthesisVoice[]): boolean {
  return voices.some(v => v.localService && v.lang.replaceAll("_", "-").toLowerCase() === "en-us"
    && /^(Nathan|Samantha)(\b|$)/i.test(v.name) && /enhanced/i.test(`${v.name} ${v.voiceURI}`));
}

/** Apply the explicit opt-out using the ordinary installed Samantha voice. */
function useBasicSamantha(voices: SpeechSynthesisVoice[]): void {
  const voice = voices.find(v => v.name === "Samantha" && v.lang === "en-US" && !/enhanced/i.test(v.voiceURI));
  if (!voice) throw new Error("未找到普通 Samantha 音色，请在系统声音设置中安装后重新检测。");
  saveSpeechSettings({ ...loadSpeechSettings(), accent: "en-US", voiceURI: voice.voiceURI });
}

/** Persist only confirmed inventory, never a successful download-button click. */
async function rememberEnhancedVoice(): Promise<void> {
  await invoke("speech_enhanced_available", { available: true });
  console.info("[speech] Confirmed enhanced voice saved for future startups");
}

/** Check speech readiness in the background without gating application startup. */
export function SpeechStartup({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>(() => usesNativeSpeech() ? "checking" : "ready");
  const [status, setStatus] = useState<DownloadStatus>("permissionRequired");
  const [download, setDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const installed = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!usesNativeSpeech()) return;
    let alive = true;
    setStage("checking"); setError("");
    async function checkInBackground() {
      const available = await invoke<boolean>("speech_enhanced_available");
      if (!alive) return;
      if (available) {
        console.info("[speech] Skipping startup check: database confirms enhanced voice");
        setStage("ready");
        return;
      }
      const declined = await invoke<boolean>("speech_download_preference");
      if (!alive) return;
      const voices = await refreshNativeVoices();
      if (!alive) return;
      installed.current = voices;
      if (declined) { useBasicSamantha(voices); setStage("ready"); }
      else if (hasPreferredEnhancedVoice(voices)) {
        await rememberEnhancedVoice();
        if (alive) setStage("ready");
      }
      else {
        const result = await invoke<DownloadStatus>("speech_download_enhanced");
        if (!alive) return;
        setStatus(result);
        // Installation is confirmed by inventory, never by a successful click.
        setStage(result === "started" || result === "installed" ? "waiting" : "prompt");
      }
    }
    void checkInBackground().catch(cause => {
      console.error("[speech] Background startup check failed", cause);
      if (alive) { setError("启动音色检查失败，不影响继续使用。可稍后重试。"); setStage("error"); }
    });
    return () => { alive = false; };
  }, [attempt]);

  /** Save an explicit refusal before continuing; failed writes remain visible and retryable. */
  async function decline() {
    setBusy(true); setError("");
    try {
      await invoke("speech_download_preference", { declined: true });
      useBasicSamantha(installed.current);
      setStage("ready");
    } catch { setError("未能保存选择或启用 Samantha，请重试。选择保存成功前不会关闭提示。"); }
    finally { setBusy(false); }
  }

  /** Try the native automation again after an affirmative choice or permission change. */
  async function automaticDownload() {
    setBusy(true); setError("");
    try {
      await invoke("speech_download_preference", { declined: false });
      const result = await invoke<DownloadStatus>("speech_download_enhanced");
      setStatus(result);
      setStage(result === "permissionRequired" ? "prompt" : "waiting");
    } catch { setError("自动下载未能启动。可以重试或使用手动下载。"); }
    finally { setBusy(false); }
  }

  /** Let the user grant OS permission themselves; opening the pane grants no access. */
  async function openPermission() {
    setBusy(true); setError("");
    try { await invoke("speech_open_accessibility_settings"); }
    catch { setError("无法打开权限设置，请手动进入系统设置 → 隐私与安全性 → 辅助功能。"); }
    finally { setBusy(false); }
  }

  /** Open Apple's manual download UI without claiming installation. */
  async function openDownload() {
    setBusy(true); setError("");
    try {
      await invoke("speech_open_download_settings");
      await invoke("speech_download_preference", { declined: false });
      setStage("waiting");
    } catch { setError("无法打开下载设置或保存选择，请重试。也可手动进入系统设置 → 辅助功能 → 朗读内容。"); }
    finally { setBusy(false); }
  }

  /** Re-enumerate installed voices and only report completion once an enhanced voice is available. */
  async function recheck() {
    setBusy(true); setError("");
    try {
      const voices = await refreshNativeVoices(); installed.current = voices;
      if (!hasPreferredEnhancedVoice(voices)) { setError("尚未检测到 Nathan 或 Samantha 增强版。请等待系统下载完成后再检测。"); return; }
      await rememberEnhancedVoice();
      await invoke("speech_download_preference", { declined: false });
      saveSpeechSettings({ ...loadSpeechSettings(), accent: "en-US", voiceURI: "" });
      setStage("ready");
    } catch { setError("音色检测或设置保存失败，请重试。"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (stage !== "waiting" || busy) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    /** Poll serially and ignore stale results after refusal or unmount. */
    async function poll() {
      try {
        const voices = await refreshNativeVoices();
        if (!alive) return;
        installed.current = voices;
        if (hasPreferredEnhancedVoice(voices)) {
          await rememberEnhancedVoice();
          if (!alive) return;
          saveSpeechSettings({ ...loadSpeechSettings(), accent: "en-US", voiceURI: "" });
          setStage("ready"); return;
        }
      } catch (cause) { console.warn("[speech] Background voice polling failed; will retry", cause); }
      if (alive) timer = setTimeout(() => void poll(), 3000);
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => { alive = false; clearTimeout(timer); };
  }, [stage, busy]);

  return <>{children}{stage !== "ready" && stage !== "checking" && !dismissed && <dialog open className="speech-startup" aria-labelledby="speech-startup-title">
    <button className="speech-startup-dismiss" onClick={() => setDismissed(true)}>稍后处理</button>
    <h2 id="speech-startup-title">下载增强版英语音色</h2>
    {(stage === "prompt" || stage === "waiting") && <>
      <p>未检测到 Nathan (Enhanced) 或 Samantha (Enhanced)。建议下载增强版，获得更自然的英语朗读；安装后可离线使用。</p>
      <p>QuickLang 优先尝试下载 Nathan (Enhanced)。系统下载完成后会自动检测并启用；也可以手动下载 Samantha (Enhanced)。</p>
      {status === "permissionRequired" && <p>自动操作需要 QuickLang 的「辅助功能」权限。请在系统设置中自行开启，返回后点击「已授权，重试自动下载」。也可以选择手动下载，无需授权。</p>}
      {status === "started" && <p role="status">已点击 Apple 下载按钮，正在等待系统完成下载。请保持联网。</p>}
      {status === "manual" && <p role="status">未能自动操作当前系统的音色界面，请手动点击增强版右侧的云朵按钮。</p>}
      {stage === "prompt" ? <fieldset disabled={busy}>
        <legend>是否下载增强版音色？</legend>
        <label><input type="radio" name="speech-download" checked={download} onChange={() => setDownload(true)} /> 下载增强版音色（推荐）</label>
        <label><input type="radio" name="speech-download" checked={!download} onChange={() => setDownload(false)} /> 不下载，使用 Samantha，以后不再提示</label>
      </fieldset> : <ol>
        <li>在「辅助功能 → 朗读与语音」（旧版为「朗读内容」）中，点击系统声音旁的 ⓘ，进入声音列表。</li>
        <li>选择英语（美国），搜索 Nathan 或 Samantha，点击 Enhanced 版本右侧的云朵按钮。</li>
        <li>等待下载完成后，QuickLang 会自动检测，也可点击「重新检测」。</li>
      </ol>}
      <div className="actions">
        {stage === "prompt" ? <button autoFocus disabled={busy} className="primary" onClick={() => void (download ? automaticDownload() : decline())}>{download ? "已授权，重试自动下载" : "保存选择并继续"}</button> : <>
          <button disabled={busy} className="primary" onClick={() => void recheck()}>下载完成，重新检测</button>
          <button disabled={busy} onClick={() => void automaticDownload()}>重试自动下载</button>
          <button disabled={busy} onClick={() => void decline()}>不下载，使用 Samantha，以后不再提示</button>
        </>}
        {status === "permissionRequired" && <button disabled={busy} onClick={() => void openPermission()}>打开辅助功能权限设置</button>}
        <button disabled={busy} onClick={() => void openDownload()}>手动下载（无需授权）</button>
      </div>
    </>}
    {error && <p role="alert">{error}</p>}
    {stage === "error" && <button onClick={() => setAttempt(value => value + 1)}>重新检查</button>}
  </dialog>}</>;
}
