import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { emptySettings } from "../conversation/ai";
import { aiErrorCode, resetAICredentials, activateAIProfile, deleteAIProfile, loadAIProfiles, migrateLegacyAIProfiles, nativeProfilesAvailable, resolveAIProfile, saveAIProfile, type AIProfileInput, type AIProfilesSnapshot, type AIRuntime } from "./aiProfilesRepository";

const emptyRuntime = (): AIRuntime => ({ settings: { ...emptySettings }, apiKey: "" });
interface ProfilesState {
  missingMasterKey: boolean; resetCredentials: () => Promise<AIProfilesSnapshot | null>;
  snapshot: AIProfilesSnapshot; revision: number; runtime: AIRuntime; busy: boolean; ready: boolean; available: boolean; error: string; warning: string;
  runtimeError: string; migrationBusy: boolean; migrationStatus: string;
  resolveRuntime: () => Promise<AIRuntime>;
  reload: () => Promise<void>; migrate: () => Promise<void>;
  save: (input: AIProfileInput) => Promise<AIProfilesSnapshot | null>; remove: (id: string) => Promise<AIProfilesSnapshot | null>; activate: (id: string) => Promise<AIProfilesSnapshot | null>;
}
const ProfilesContext = createContext<ProfilesState | null>(null);
export function useAIProfiles(): ProfilesState {
  const state = useContext(ProfilesContext);
  if (!state) throw new Error("AIProfilesProvider is required");
  return state;
}

/** Metadata is DB-only; credentials are fetched on demand and held in memory only. */
export function AIProfilesProvider({ children }: { children: ReactNode }) {
  const available = nativeProfilesAvailable();
  const [snapshot, setSnapshot] = useState<AIProfilesSnapshot>({ profiles: [], activeId: null });
  const snapshotRef = useRef(snapshot);
  const [runtime, setRuntime] = useState(emptyRuntime);
  const [missingMasterKey, setMissingMasterKey] = useState(false);
  const cache = useRef<AIRuntime | null>(null), pending = useRef<Promise<AIRuntime> | null>(null);
  const [revision, setRevision] = useState(0), [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(available), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [migrationBusy, setMigrationBusy] = useState(false), [migrationStatus, setMigrationStatus] = useState("");
  const generation = useRef(0), locked = useRef(false), migrationLock = useRef(false), readyRef = useRef(false);
  const invalidate = useCallback(() => {
    generation.current++; cache.current = null; pending.current = null;
    setRuntime(emptyRuntime()); setRuntimeError(""); setMissingMasterKey(false);
    return generation.current;
  }, []);
  const apply = useCallback((next: AIProfilesSnapshot) => {
    snapshotRef.current = next; setSnapshot(next); setRevision(value => value + 1);
    readyRef.current = true; setReady(true);
  }, []);
  const resolveRuntime = useCallback(async (): Promise<AIRuntime> => {
    if (!available || !readyRef.current || locked.current || !snapshotRef.current.activeId) throw new Error("请先在大模型设置中选择配置。");
    const version = generation.current;
    const started = performance.now();
    try {
      const request = cache.current ? Promise.resolve(cache.current) : pending.current ?? resolveAIProfile(snapshotRef.current.activeId);
      pending.current = request;
      const resolved = await request;
      // Check even cached resolutions: a mutation may begin between promise microtasks.
      if (version !== generation.current) throw new Error("配置已更改，请重新发起 AI 请求。");
      cache.current = resolved; setRuntime(resolved); setRuntimeError("");
      console.info("[ai-profiles] Runtime credentials ready", { elapsedMs: Math.round(performance.now() - started) });
      return { ...resolved, assertCurrent: () => { if (version !== generation.current) throw new Error("配置已更改，请重新发起 AI 请求。"); } };
    } catch (cause) {
      if (version !== generation.current) throw new Error("配置已更改，请重新发起 AI 请求。");
      cache.current = null; setRuntime(emptyRuntime());
      setMissingMasterKey(aiErrorCode(cause) === "AI_MASTER_KEY_MISSING");
      const message = "当前配置密钥读取或解密失败，请在大模型设置中重新填写密钥并保存，或重试 AI 请求。数据库配置仍可编辑。";
      setRuntimeError(message);
      console.warn("[ai-profiles] Runtime credential resolution failed", { elapsedMs: Math.round(performance.now() - started) });
      throw new Error(message);
    } finally { if (version === generation.current) pending.current = null; }
  }, [available]);
  const reload = useCallback(async () => {
    if (!available || locked.current) return;
    locked.current = true; invalidate(); setBusy(true); setError("");
    try { apply((await loadAIProfiles()).snapshot); }
    catch {
      console.warn("[ai-profiles] Configuration loading failed");
      readyRef.current = false; setReady(false); setError("数据库配置读取失败，请等待数据库就绪后重试。");
    } finally { locked.current = false; setBusy(false); }
  }, [available, apply, invalidate]);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    async function start(attempt = 0) {
      await reload();
      if (alive && attempt < 4) timer = setTimeout(() => { if (alive && !readyRef.current) void start(attempt + 1); }, 1500);
    }
    if (available) void start();
    return () => { alive = false; clearTimeout(timer); generation.current++; cache.current = null; pending.current = null; };
  }, [available, reload]);
  async function mutate(action: () => Promise<AIProfilesSnapshot>, recovery = false): Promise<AIProfilesSnapshot | null> {
    if (locked.current || !readyRef.current) return null;
    locked.current = true; invalidate(); setBusy(true); setError("");
    try { const next = await action(); apply(next); console.info("[ai-profiles] Database configuration updated"); return next; }
    catch (cause) {
      console.warn("[ai-profiles] Configuration update failed"); readyRef.current = false; setReady(false);
      const recoveryErrors: Record<string, string> = {
        AI_RECOVERY_KEY_PRESENT: "恢复失败：主密钥仍存在（可能格式异常），为保护数据未执行清除。请检查系统钥匙串，不要删除现有主密钥。",
        AI_KEYCHAIN_UNAVAILABLE: "恢复失败：系统钥匙串不可用，请解锁或允许访问钥匙串后重试读取配置。",
        AI_RECOVERY_CONFIRMATION_REQUIRED: "恢复失败：后端未收到有效确认，请重新读取配置后再确认。",
      };
      setError(recovery ? recoveryErrors[aiErrorCode(cause)] ?? "恢复失败，运行时凭据已清空。请重新读取配置确认数据库状态；不要假定密钥已删除。" : "配置操作失败，运行时凭据已清空。请重试读取配置以确认数据库状态，再继续操作。");
      return null;
    }
    finally { locked.current = false; setBusy(false); }
  }
  async function migrate() {
    if (!available || migrationLock.current || locked.current || !readyRef.current) return;
    migrationLock.current = true; setMigrationBusy(true); setWarning(""); setMigrationStatus("");
    // Migration does not share the runtime or CRUD busy/error channels.
    invalidate();
    const started = performance.now();
    try {
      const result = await migrateLegacyAIProfiles();
      setWarning(result.warning);
      if (!result.warning) setMigrationStatus("旧配置迁移检查完成。");
      await reload();
      console.info("[ai-profiles] Explicit migration finished", { elapsedMs: Math.round(performance.now() - started) });
    } catch { setWarning("旧配置迁移失败，原数据未删除。数据库配置可正常使用，请重试迁移。"); console.warn("[ai-profiles] Explicit migration failed"); }
    finally { migrationLock.current = false; setMigrationBusy(false); }
  }
  return <ProfilesContext.Provider value={{ missingMasterKey, resetCredentials: () => missingMasterKey ? mutate(resetAICredentials, true) : Promise.resolve(null), snapshot, revision, runtime, resolveRuntime, runtimeError, migrationBusy, migrationStatus, migrate, available, busy, ready, error, warning, reload, save: input => mutate(() => saveAIProfile(input)), remove: id => mutate(() => deleteAIProfile(id)), activate: id => mutate(() => activateAIProfile(id)) }}>{children}</ProfilesContext.Provider>;
}
