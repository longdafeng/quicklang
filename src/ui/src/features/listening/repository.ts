import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Material, RecordEntry } from "./model";
export const desktopListening = () => isTauri();
// Browser mode is explicitly a temporary UI preview, never a database fallback.
async function request<T>(owner: string, operation: object): Promise<T> {
  if (!isTauri()) throw new Error("请在桌面应用中保存听力材料。");
  try { return await invoke<T>("listening_repository", { owner, operation }); }
  catch (e) { throw new Error(typeof e === "object" && e && "message" in e ? String(e.message) : String(e)); }
}
export const listMaterials = (owner: string) => request<RecordEntry[]>(owner, { action: "list" });
export const deleteMaterial = (owner: string, entry: RecordEntry) => request<void>(owner, { action: "delete", id: entry.id, version: entry.version });
export async function saveMaterial(owner: string, entry: RecordEntry, payload: Material, blob?: Blob): Promise<RecordEntry> {
  const audio = blob ? Array.from(new Uint8Array(await blob.arrayBuffer()), byte => byte.toString(16).padStart(2, "0")).join("") : null;
  const version = await request<number>(owner, { action: "save", id: entry.id, version: entry.version, payload, audio });
  return { id: entry.id, version, payload };
}
export async function loadAudio(owner: string, entry: RecordEntry): Promise<Blob> {
  const hex = await request<string>(owner, { action: "audio", id: entry.id });
  if (typeof hex !== "string" || !hex.length || hex.length > 16_000_000 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) throw new Error("音频数据损坏，请重新导入材料。");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new Blob([bytes], { type: entry.payload.mime });
}
