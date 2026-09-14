import { createContext, useContext } from "react";
export const levels = { A1: "A1 · 入门", A2: "A2 · 基础", B1: "B1 · 中级", B2: "B2 · 中高级", C1: "C1 · 高级", C2: "C2 · 熟练" };
export interface Profile { id: string; name: string; level: keyof typeof levels }
export const ProfileContext = createContext<string | null>(null);
export function storageKey(key: string, userId: string | null) { return `quicklang:${userId ? `user:${userId}:` : ""}${key}`; }
export function useStorageKey() { const id = useContext(ProfileContext); return (key: string) => storageKey(key, id); }
export function loadProfiles(): Profile[] {
  const value = JSON.parse(localStorage.getItem("quicklang:profiles") ?? "[]");
  if (!Array.isArray(value) || value.some(p => !p || typeof p.id !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(p.id) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 40 || !Object.hasOwn(levels, p.level))) throw new Error("用户数据无法读取，请检查本机存储。");
  if (new Set(value.map(p => p.id)).size !== value.length) throw new Error("用户标识重复，请检查本机存储。");
  return value;
}
export function saveProfiles(profiles: Profile[], migrateTo?: string) {
  // Commit the registry last: an interrupted migration can safely be retried.
  if (migrateTo) {
    const keys = Object.keys(localStorage).filter(k => /^quicklang:(books|selected-book|vocabulary|flash-count|spell-count|auto-repeats|auto-gap|flash:.*|spell:.*)$/.test(k));
    for (const key of keys) localStorage.setItem(storageKey(key.slice(10), migrateTo), localStorage.getItem(key)!);
  }
  localStorage.setItem("quicklang:profiles", JSON.stringify(profiles));
}
