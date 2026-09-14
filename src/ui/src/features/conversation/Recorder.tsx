import { useEffect, useRef, useState } from "react";
export interface Recording { blob: Blob; url: string; createdAt: number }
export function Recorder({ onRecording, busy, onActive }: { onActive: (active: boolean) => void; onRecording: (recording: Recording) => void; busy: boolean }) {
  const [state, setState] = useState<"idle" | "requesting" | "recording">("idle");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lock = useRef(false);
  function stop() {
    clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) { generation.current++; stop(); lock.current = false; setState("idle"); onActive(false); } };
    document.addEventListener("visibilitychange", hide);
    return () => { generation.current++; stop(); document.removeEventListener("visibilitychange", hide); };
  }, []);
  async function start() {
    if (lock.current) return;
    lock.current = true;
    const run = ++generation.current;
    setError(""); setState("requesting"); onActive(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("当前环境不支持录音。可在支持麦克风的浏览器中练习，或手动填写回答。");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (run !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = next;
      const chunks: Blob[] = []; let size = 0; let failed = false;
      next.ondataavailable = event => {
        size += event.data.size;
        if (size > 8_000_000) { setError("录音超过 8 MB，请缩短回答。"); stop(); return; }
        if (event.data.size) chunks.push(event.data);
      };
      next.onstop = () => {
        media.getTracks().forEach(t => t.stop()); clearTimeout(timer.current);
        if (run !== generation.current) return;
        lock.current = false; setState("idle"); onActive(false);
        if (failed || size > 8_000_000) return;
        const blob = new Blob(chunks, { type: next.mimeType || mime || "audio/webm" });
        if (!blob.size) { setError("录音为空，请检查麦克风后重试。"); return; }
        onRecording({ blob, url: URL.createObjectURL(blob), createdAt: Date.now() });
      };
      next.onerror = () => { failed = true; if (run === generation.current) { setError("录音失败，请检查麦克风后重试。"); stop(); } };
      next.start(1000); setState("recording"); timer.current = setTimeout(stop, 60_000);
    } catch (e) {
      if (run !== generation.current) return;
      stop(); lock.current = false; setState("idle"); onActive(false);
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "麦克风权限未开启，请在系统或浏览器设置中允许 QuickLang 使用麦克风。" : e instanceof Error ? e.message : "无法开启麦克风。");
    }
  }
  return <div className="record-controls"><div className="actions">
    <button disabled={busy || state !== "idle"} onClick={() => void start()}>录制回答</button>
    {state === "requesting" && <span role="status">等待麦克风权限…</span>}
    {state === "recording" && <button className="primary" onClick={stop}>停止录音</button>}
  </div><p className="muted">每次最多 60 秒。录音暂存在本次练习中，离开前可下载保留；不会自动上传。</p>{error && <p role="alert">{error}</p>}</div>;
}
