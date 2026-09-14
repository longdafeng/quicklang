import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../conversation/ai";
export function Recorder({ onSeconds, onTranscribe, disabled, onRecording }: { onSeconds: (n: number) => void; onTranscribe: (blob: Blob) => void; disabled: boolean; onRecording: (value: boolean) => void }) {
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const live = useRef(true), generation = useRef(0), lock = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [recording, setRecording] = useState(false), [starting, setStarting] = useState(false), [blob, setBlob] = useState<Blob | null>(null), [url, setUrl] = useState(""), [error, setError] = useState("");
  useEffect(() => { live.current = true; return () => { live.current = false; generation.current++; clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  useEffect(() => { if (!blob) return; const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  async function start() {
    if (lock.current) return;
    lock.current = true; const run = ++generation.current;
    setError(""); setStarting(true); onRecording(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("当前环境不支持录音，可以在下方输入跟读或复述内容。");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!live.current || run !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t));
      if (!type) throw new Error("当前环境没有可用的录音格式，请输入文字练习。");
      const next = new MediaRecorder(media, { mimeType: type }); recorder.current = next;
      const chunks: Blob[] = []; let bytes = 0; let failed = false; const began = Date.now();
      next.ondataavailable = event => { chunks.push(event.data); bytes += event.data.size; if (bytes > 7_500_000 && next.state === "recording") next.stop(); };
      next.onerror = () => { failed = true; if (live.current) setError("录音失败，请检查麦克风后重试。"); if (next.state === "recording") next.stop(); media.getTracks().forEach(t => t.stop()); };
      next.onstop = () => { clearTimeout(timer.current); media.getTracks().forEach(t => t.stop()); if (live.current && run === generation.current) { lock.current = false; setRecording(false); onRecording(false); if (failed) return; if (!bytes || bytes > 8_000_000) { setError("录音为空或超过 8 MB，请重新录制。"); return; } setBlob(new Blob(chunks, { type })); onSeconds(Math.min(120, Math.round((Date.now() - began) / 1000))); } };
      next.start(500); setRecording(true); onRecording(true); setBlob(null);
      timer.current = setTimeout(() => { if (next.state === "recording") next.stop(); }, 120_000);
    } catch (e) { stream.current?.getTracks().forEach(t => t.stop()); if (live.current && run === generation.current) { lock.current = false; onRecording(false); setError(e instanceof DOMException && e.name === "NotAllowedError" ? "麦克风权限未开启，请在系统或浏览器设置中允许 QuickLang 使用麦克风。" : errorMessage(e)); } }
    finally { if (live.current) setStarting(false); }
  }
  return <div className="listening-recorder"><div className="actions"><button disabled={(!recording && disabled) || starting} onClick={() => { if (recording) recorder.current?.stop(); else void start(); }}>{starting ? "正在打开麦克风…" : recording ? "停止录音" : "开始录音"}</button>{blob && <button disabled={disabled || recording} onClick={() => onTranscribe(blob)}>发送录音并转写</button>}</div><p className="muted">录音最长 2 分钟，可先回听；点击转写才会发送至配置的模型服务。录音仅保留在本次页面。</p>{url && blob && <audio aria-label="我的录音" controls src={url} />}{error && <p role="alert">{error}</p>}</div>;
}
