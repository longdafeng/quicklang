import { invoke, isTauri } from "@tauri-apps/api/core";
import { endpoint, type AISettings } from "../conversation/ai";

export interface AIProfile extends AISettings { id: string; name: string; hasApiKey: boolean }
export interface AIProfilesSnapshot { profiles: AIProfile[]; activeId: string | null }
export type KeyAction = "preserve" | "replace" | "clear";
export interface AIProfileInput extends AISettings { id: string | null; name: string; keyAction: KeyAction; apiKey: string | null }
export interface AIRuntime { settings: AISettings; apiKey: string; assertCurrent?: () => void }
export type ResolveAIRuntime = () => Promise<AIRuntime>;
export const nativeProfilesAvailable = isTauri;
export const saveAIProfile = (input: AIProfileInput) => invoke<AIProfilesSnapshot>("ai_profile_save", { input });
export const deleteAIProfile = (id: string) => invoke<AIProfilesSnapshot>("ai_profile_delete", { id });
export const activateAIProfile = (id: string) => invoke<AIProfilesSnapshot>("ai_profile_activate", { id });
export const resolveAIProfile = (id: string) => invoke<AIRuntime>("ai_profile_resolve", { id });
/** Native AppError is serialized as { code, message, retryable }; never expose its raw message. */
export function aiErrorCode(cause: unknown): string {
  return cause !== null && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : "";
}
export const resetAICredentials = () => invoke<AIProfilesSnapshot>("ai_profiles_reset_credentials", { confirmed: true });
const legacyKey = "quicklang:ai-settings";
export interface AIProfilesLoad { snapshot: AIProfilesSnapshot; warning: string }
const receiptKey = "quicklang:ai-migration-receipt";
const recovery = "旧配置迁移结果无法安全确认，原数据未删除，不会自动重复写入。请手动恢复：先检查数据库配置列表，缺少时使用新增配置重新填写；确认后自行备份并清理旧数据。";
let loading: Promise<AIProfilesLoad> | undefined;

/** Listing is strictly database-only: browser storage and Keychain cannot block CRUD. */
export async function loadAIProfiles(): Promise<AIProfilesLoad> {
  return { snapshot: await invoke<AIProfilesSnapshot>("ai_profiles_list"), warning: "" };
}

/** Explicit, serialized migration. Receipts prevent duplicate writes after uncertain outcomes. */
export function migrateLegacyAIProfiles(): Promise<AIProfilesLoad> {
  if (!loading) loading = migrateLegacy().finally(() => { loading = undefined; });
  return loading;
}
async function migrateLegacy(): Promise<AIProfilesLoad> {
  let snapshot = await invoke<AIProfilesSnapshot>("ai_profiles_list");
  const result = (warning = ""): AIProfilesLoad => ({ snapshot, warning });
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return result();
    let legacy: Record<string, unknown>;
    try { legacy = JSON.parse(raw); } catch { return result("旧配置格式无效，原数据未删除。数据库配置可正常使用；修复旧数据后重试读取配置。"); }
    // The actual legacy format contains settings only. Never copy or discard unknown fields/secrets.
    if (!legacy || typeof legacy !== "object" || Array.isArray(legacy) || Object.keys(legacy).some(key => !["baseUrl", "model", "transcriptionModel"].includes(key))) return result(recovery);
    if (typeof legacy.baseUrl !== "string" || typeof legacy.model !== "string" || !legacy.model.trim() || (legacy.transcriptionModel !== undefined && typeof legacy.transcriptionModel !== "string")) return result("旧配置不完整，原数据未删除。数据库配置可正常使用；修复旧数据后重试读取配置。");
    const settings = { baseUrl: legacy.baseUrl.trim(), model: legacy.model.trim(), transcriptionModel: typeof legacy.transcriptionModel === "string" ? legacy.transcriptionModel.trim() : "" };
    try { endpoint(settings.baseUrl, "chat/completions"); } catch { return result("旧配置服务地址无效，原数据未删除。数据库配置可正常使用；修复旧数据后重试读取配置。"); }
    const receiptRaw = localStorage.getItem(receiptKey);
    if (receiptRaw) {
      const receipt = JSON.parse(receiptRaw);
      // Only our confirmed write receipt authorizes cleanup; metadata equality alone never does.
      if (receipt.state !== "saved" || receipt.source !== raw || !snapshot.profiles.some(p => p.id === receipt.id && p.baseUrl === settings.baseUrl && p.model === settings.model && p.transcriptionModel === settings.transcriptionModel)) return result(recovery);
    } else {
      // Persist intent BEFORE invoking: a crash, lost response or failed receipt write must not retry a mutation.
      localStorage.setItem(receiptKey, JSON.stringify({ state: "pending" }));
      const beforeIds = new Set(snapshot.profiles.map(p => p.id));
      try { snapshot = await saveAIProfile({ ...settings, id: null, name: "迁移的配置", keyAction: "clear", apiKey: null }); }
      catch { console.warn("[ai-profiles] Migration outcome uncertain; automatic writes stopped"); return result(recovery); }
      const created = snapshot.profiles.filter(p => !beforeIds.has(p.id));
      if (created.length !== 1) return result(recovery);
      localStorage.setItem(receiptKey, JSON.stringify({ state: "saved", id: created[0].id, source: raw }));
      console.info("[ai-profiles] Legacy settings migrated with confirmed receipt");
    }
    // Refuse to remove data changed while the async DB write was in progress.
    if (localStorage.getItem(legacyKey) !== raw) return result(recovery);
    try { localStorage.removeItem(legacyKey); } catch { return result("旧配置清理失败，数据库配置已保存。请允许本机存储访问后重试，不会重复迁移。"); }
    return result();
  } catch {
    console.warn("[ai-profiles] Migration storage unavailable; database remains usable");
    return result(recovery);
  }
}
