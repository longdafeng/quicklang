import { useState, type FormEvent } from "react";
import { emptySettings, endpoint, type AISettings } from "../conversation/ai";

const storageKey = "quicklang:ai-settings";

export function loadAISettings(): AISettings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!saved || typeof saved !== "object") return { ...emptySettings };
    const values = saved as Record<string, unknown>;
    return {
      baseUrl: typeof values.baseUrl === "string" ? values.baseUrl : "",
      model: typeof values.model === "string" ? values.model : "",
      transcriptionModel: typeof values.transcriptionModel === "string" ? values.transcriptionModel : "",
    };
  } catch { return { ...emptySettings }; }
}

interface Props {
  settings: AISettings;
  apiKey: string;
  onSave: (settings: AISettings, apiKey: string) => void;
}

export function SystemSettings({ settings, apiKey, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  const [key, setKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  function change(field: keyof AISettings, value: string) {
    setDraft(previous => ({ ...previous, [field]: value })); setSaved(false); setError("");
  }
  function save(event: FormEvent) {
    event.preventDefault(); setSaved(false); setError("");
    const next = { baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), transcriptionModel: draft.transcriptionModel.trim() };
    if (!next.baseUrl || !next.model) { setError("请填写服务地址和对话模型。"); return; }
    try { endpoint(next.baseUrl, "chat/completions"); }
    catch { setError("请输入有效的 HTTPS 服务地址，或本机 HTTP 地址；不要包含账号、密码、查询参数或锚点。"); return; }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setError("设置保存失败，请检查本机存储空间后重试。"); return; }
    onSave(next, key.trim()); setDraft(next); setKey(key.trim()); setSaved(true);
  }
  return <section className="study-card system-settings" aria-labelledby="model-settings-title">
    <h2 id="model-settings-title">大模型设置</h2>
    <p className="muted">推荐通过 LiteLLM 网关统一接入多家模型服务，用于 AI 对话和语音转写。也可填写兼容 OpenAI 接口的服务地址。</p>
    <button type="button" onClick={() => {
      setDraft({ baseUrl: "http://127.0.0.1:4000/v1", model: "quicklang-chat", transcriptionModel: "quicklang-transcribe" });
      setKey(""); setSaved(false); setError("");
    }}>填入本机 LiteLLM 配置</button>
    <form onSubmit={save}>
      <label htmlFor="ai-base-url">服务地址（Base URL）</label>
      <input id="ai-base-url" type="url" required placeholder="https://your-service.example/v1" value={draft.baseUrl} onChange={e => change("baseUrl", e.target.value)} aria-describedby="ai-url-help" />
      <p id="ai-url-help" className="muted">填写服务或网关的接口根地址，包含所需的版本路径（例如 /v1）。本机 LiteLLM 需先启动，填入配置不会自动启动服务。</p>
      <label htmlFor="ai-model">对话模型</label>
      <input id="ai-model" required placeholder="填写服务商提供的模型名称" value={draft.model} onChange={e => change("model", e.target.value)} />
      <label htmlFor="ai-transcription-model">语音转写模型（选填）</label>
      <input id="ai-transcription-model" placeholder="使用语音转写时填写" value={draft.transcriptionModel} onChange={e => change("transcriptionModel", e.target.value)} />
      <p className="muted">使用网关时填写模型别名，可将对话和转写分配给不同厂商；转写需要支持语音识别的模型。</p>
      <label htmlFor="ai-api-key">API Key（选填）</label>
      <div className="api-key-field"><input id="ai-api-key" type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} value={key} onChange={e => { setKey(e.target.value); setSaved(false); setError(""); }} aria-describedby="ai-key-help" /><button type="button" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} aria-pressed={showKey} onClick={() => setShowKey(value => !value)}>{showKey ? "隐藏" : "显示"}</button></div>
      <p id="ai-key-help" className="muted">连接 LiteLLM 时填写网关密钥，厂商密钥配置在网关端。API Key 仅在当前运行期间保留，重启或刷新后需重新填写。无需密钥的本机服务可留空。</p>
      <div className="actions"><button type="submit" className="primary">保存设置</button></div>
      {error && <p className="notice" role="alert">{error}</p>}
      {saved && <p role="status">设置已保存，API Key 仅在当前运行期间保留。</p>}
    </form>
  </section>;
}
