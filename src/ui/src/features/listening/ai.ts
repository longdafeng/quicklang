import { invoke, isTauri } from "@tauri-apps/api/core";
import { endpoint, type AISettings } from "../conversation/ai";
import { validateCues } from "./model";
export async function generateSubtitles(settings: AISettings, key: string, blob: Blob, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("已取消", "AbortError");
  if (!settings.transcriptionModel.trim()) throw new Error("请在系统设置中填写支持时间戳的语音转写模型。");
  if (!blob.size || blob.size > 8_000_000) throw new Error("音频为空或超过 8 MB。");
  let result: unknown;
  if (isTauri()) {
    const audio = await blob.arrayBuffer();
    if (signal.aborted) throw new DOMException("已取消", "AbortError");
    result = await invoke("listening_transcribe", { baseUrl: settings.baseUrl, apiKey: key, model: settings.transcriptionModel, audio: Array.from(new Uint8Array(audio)), mime: blob.type });
  }
  else {
    const form = new FormData(); form.append("model", settings.transcriptionModel); form.append("language", "en"); form.append("response_format", "verbose_json"); form.append("timestamp_granularities[]", "segment");
    const ext = ({ "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm" } as Record<string, string>)[blob.type] ?? "webm";
    form.append("file", blob, `material.${ext}`);
    const response = await fetch(endpoint(settings.baseUrl, "audio/transcriptions"), { method: "POST", headers: key ? { Authorization: `Bearer ${key}` } : {}, body: form, signal, credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error(`字幕生成失败（${response.status}），请检查模型是否支持 verbose_json。`);
    const reader = response.body?.getReader(); if (!reader) throw new Error("服务未返回字幕。");
    const decoder = new TextDecoder(); let text = "", size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 256_000) { await reader.cancel(); throw new Error("字幕响应过大。"); } text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); }
    finally { reader.releaseLock(); }
    result = JSON.parse(text);
  }
  if (signal.aborted) throw new DOMException("已取消", "AbortError");
  const segments = (result as { segments?: unknown })?.segments;
  if (!Array.isArray(segments) || !segments.length) throw new Error("模型未返回时间戳，请换用支持 verbose_json 的转写模型，或导入 SRT/VTT 字幕。");
  return validateCues(segments);
}
