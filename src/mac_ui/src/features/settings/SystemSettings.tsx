import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { emptySettings, endpoint } from "../conversation/ai";
import { useAIProfiles } from "./AIProfiles";
import type { AIProfile, AIProfileInput, KeyAction } from "./aiProfilesRepository";
import { SpeechSettings } from "./SpeechSettings";

export type SettingsTab = "speech" | "models";
const tabs = [{ id: "speech", label: "单词发音" }, { id: "models", label: "大模型设置" }] as const;
export function SystemSettings({ initialTab = "speech" }: { initialTab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "speech" : event.key === "End" ? "models" : tab === "speech" ? "models" : "speech";
    setTab(next); document.getElementById(`settings-tab-${next}`)?.focus();
  }
  return <><div className="settings-tabs" role="tablist" aria-label="系统设置">{tabs.map(item => <button key={item.id} id={`settings-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={navigate}>{item.label}</button>)}</div>
    <section role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} tabIndex={0}>{tab === "speech" ? <SpeechSettings /> : <ModelSettings />}</section></>;
}
function ModelSettings() {
  const { snapshot, revision, busy, ready, available, error, warning, reload, save, remove, activate, migrate, migrationBusy, migrationStatus } = useAIProfiles();
  const [selected, setSelected] = useState<string | null>(snapshot.activeId ?? snapshot.profiles[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!creating && !snapshot.profiles.some(p => p.id === selected)) setSelected(snapshot.activeId ?? snapshot.profiles[0]?.id ?? null);
  }, [snapshot, selected, creating]);
  const profile = snapshot.profiles.find(p => p.id === selected);
  if (!available) return <p className="notice" role="status">当前环境不支持数据库配置。请使用桌面客户端管理大模型配置；浏览器预览不会保存配置或密钥。</p>;
  return <section className="study-card system-settings" aria-labelledby="model-settings-title"><h2 id="model-settings-title">大模型设置</h2>
    <p className="muted">配置保存在本机数据库，密钥加密保存。仅在使用时读取到内存，不会写入浏览器存储。</p>
    {error && <p className="notice" role="alert">{error}</p>}
    <CredentialRecovery />
    <section aria-label="旧配置迁移"><p className="muted">旧版浏览器配置不会自动导入。点击迁移仅导入可确认的配置，失败时保留原数据。</p><button disabled={migrationBusy || busy || !ready} onClick={() => void migrate()}>迁移旧配置</button>{migrationBusy && <p role="status">正在迁移旧配置…</p>}{migrationStatus && <p role="status">{migrationStatus}</p>}{warning && <p className="notice" role="alert">{warning}</p>}</section>
    <p className="muted">重新读取、切换配置或成功保存后，将以数据库最新内容重置编辑表单，丢弃未保存修改及输入的密钥。</p>
    <button disabled={busy} onClick={() => { setSaved(false); void reload(); }}>重试读取配置</button>
    {busy && <p role="status">正在读取或保存配置…</p>}
    <p>共 {snapshot.profiles.length} 个配置 · 当前使用：{snapshot.profiles.find(p => p.id === snapshot.activeId)?.name ?? "未选择"}</p>
    <fieldset disabled={busy || !ready}><legend>配置管理</legend>
      <label htmlFor="ai-profile-select">选择配置</label><select id="ai-profile-select" value={selected ?? ""} onChange={event => { setSelected(event.target.value || null); setCreating(false); setDeleting(false); setSaved(false); }}><option value="">新配置</option>{snapshot.profiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === snapshot.activeId ? "（当前使用）" : ""}</option>)}</select>
      <div className="actions"><button onClick={() => { setCreating(true); setSelected(null); setDeleting(false); setSaved(false); }}>新增配置</button>{profile && <><button disabled={profile.id === snapshot.activeId} onClick={() => { setSaved(false); void activate(profile.id); }}>{profile.id === snapshot.activeId ? "当前使用中" : "使用此配置"}</button><button onClick={() => setDeleting(true)}>删除配置</button></>}</div>
      {deleting && profile && <div role="alertdialog" aria-labelledby="delete-profile-title" aria-describedby="delete-profile-help" className="notice"><h3 id="delete-profile-title">删除配置“{profile.name}”？</h3><p id="delete-profile-help">{profile.id === snapshot.activeId ? "当前配置正在使用，删除后将清空当前选择和运行时凭据，AI 功能将暂停，直到选择其他配置。" : "此操作会永久删除配置及其密钥，无法撤销。"}</p><button autoFocus onClick={() => setDeleting(false)}>取消</button><button onClick={() => void remove(profile.id).then(ok => { if (ok) { setDeleting(false); setSelected(null); setSaved(false); } })}>确认删除</button></div>}
    </fieldset>
    {ready && <ProfileForm key={`${profile?.id ?? "new"}:${revision}`} profile={profile} busy={busy || deleting} onSave={async input => {
      const beforeIds = new Set(snapshot.profiles.map(p => p.id));
      const next = await save(input);
      if (!next) return false;
      const savedId = input.id ?? next.profiles.find(p => !beforeIds.has(p.id))?.id ?? null;
      setSelected(savedId); setSaved(true); setCreating(false);
      return true;
    }} />}
    {saved && !error && <p role="status">配置已保存到本机数据库。</p>}
  </section>;
}
function CredentialRecovery() {
  const { missingMasterKey, resetCredentials, busy, ready } = useAIProfiles();
  const [confirming, setConfirming] = useState(false), [complete, setComplete] = useState(false);
  return <>
    {missingMasterKey && <section aria-label="主密钥恢复"><p className="notice">检测到系统钥匙串中的主密钥丢失，现有加密凭据无法读取。</p><button disabled={busy || !ready} onClick={() => { setComplete(false); setConfirming(true); }}>恢复丢失的主密钥</button></section>}
    {confirming && <div role="alertdialog" aria-labelledby="credential-recovery-title" aria-describedby="credential-recovery-help" className="notice"><h3 id="credential-recovery-title">清除所有配置的已保存密钥？</h3><p id="credential-recovery-help">此操作将删除所有配置的已保存 API Key，不可撤销。配置名称、地址、模型和当前选择会保留。完成后必须重新输入所需的 API Key，才能继续使用需要密钥的服务。</p><button autoFocus disabled={busy} onClick={() => setConfirming(false)}>取消恢复</button><button disabled={busy || !missingMasterKey || !ready} onClick={() => void resetCredentials().then(next => { setConfirming(false); setComplete(Boolean(next)); })}>确认清除所有已保存密钥</button></div>}
    {complete && <p role="status">所有已保存密钥已清除，配置资料和当前选择已保留。请重新填写所需的 API Key。</p>}
  </>;
}
function ProfileForm({ profile, busy, onSave }: { profile?: AIProfile; busy: boolean; onSave: (input: AIProfileInput) => Promise<boolean> }) {
  const [draft, setDraft] = useState(() => ({ name: profile?.name ?? "", baseUrl: profile?.baseUrl ?? "", model: profile?.model ?? "", transcriptionModel: profile?.transcriptionModel ?? "" }));
  const [keyAction, setKeyAction] = useState<KeyAction>(profile ? "preserve" : "replace");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  function change(field: keyof typeof draft, value: string) { setDraft(previous => ({ ...previous, [field]: value })); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const next = { name: draft.name.trim(), baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), transcriptionModel: draft.transcriptionModel.trim() };
    if (!next.name || !next.baseUrl || !next.model) { setError("请填写配置名称、服务地址和对话模型。"); return; }
    try { endpoint(next.baseUrl, "chat/completions"); } catch { setError("请输入有效的 HTTPS 服务地址，或本机 HTTP 地址；不要包含账号、密码、查询参数或锚点。"); return; }
    if (keyAction === "replace" && profile && !apiKey.trim()) { setError("替换密钥时请填写新的 API Key；如需删除密钥，请选择清除。"); return; }
    if (await onSave({ ...next, id: profile?.id ?? null, keyAction: keyAction === "replace" && !apiKey.trim() ? "clear" : keyAction, apiKey: keyAction === "replace" && apiKey.trim() ? apiKey.trim() : null })) { setApiKey(""); setKeyAction("preserve"); }
  }
  return <form onSubmit={event => void submit(event)}><fieldset disabled={busy}><legend>{profile ? "编辑配置" : "新增配置"}</legend>
    <button type="button" onClick={() => { setDraft({ ...emptySettings, name: "本机 LiteLLM", baseUrl: "http://127.0.0.1:4000/v1", model: "quicklang-chat", transcriptionModel: "quicklang-transcribe" }); setApiKey(""); setKeyAction("clear"); setError(""); }}>填入本机 LiteLLM 配置</button>
    <label htmlFor="ai-profile-name">配置名称</label><input id="ai-profile-name" required value={draft.name} onChange={e => change("name", e.target.value)} />
    <label htmlFor="ai-base-url">服务地址（Base URL）</label><input id="ai-base-url" required type="url" value={draft.baseUrl} onChange={e => change("baseUrl", e.target.value)} />
    <p className="muted">填写接口根地址，包含版本路径（例如 /v1）。填入本机 LiteLLM 配置不会启动服务。</p>
    <label htmlFor="ai-model">对话模型</label><input id="ai-model" required value={draft.model} onChange={e => change("model", e.target.value)} />
    <label htmlFor="ai-transcription-model">语音转写模型（选填）</label><input id="ai-transcription-model" value={draft.transcriptionModel} onChange={e => change("transcriptionModel", e.target.value)} />
    <p>API Key：<strong>{profile?.hasApiKey ? "已设置" : "未设置"}</strong></p>
    <label htmlFor="ai-key-action">密钥操作</label><select id="ai-key-action" value={keyAction} onChange={e => { setKeyAction(e.target.value as KeyAction); setApiKey(""); }}>{profile && <option value="preserve">保留已有密钥</option>}<option value="replace">{profile ? "替换密钥" : "设置密钥"}</option><option value="clear">清除密钥（无密钥服务）</option></select>
    <label htmlFor="ai-api-key">API Key（选填）</label><input id="ai-api-key" type="password" autoComplete="new-password" spellCheck={false} disabled={keyAction !== "replace"} value={apiKey} onChange={e => setApiKey(e.target.value)} aria-describedby="ai-key-help" />
    <p id="ai-key-help" className="muted">已保存的密钥不会回显。保留不会改变原密钥；替换需填写新密钥；清除将在保存后删除原密钥。</p>
    <button className="primary" type="submit">保存配置</button>
    {error && <p role="alert" className="notice">{error}</p>}
  </fieldset></form>;
}
