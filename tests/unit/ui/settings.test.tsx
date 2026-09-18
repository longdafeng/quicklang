import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { SystemSettings } from "../../../src/mac_ui/src/features/settings/SystemSettings";
import { AIProfilesProvider, useAIProfiles } from "../../../src/mac_ui/src/features/settings/AIProfiles";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("../../../src/mac_ui/src/features/settings/SpeechSettings", () => ({ SpeechSettings: () => <p>语音偏好</p> }));
const profile = { id: "one", name: "工作配置", baseUrl: "https://models.example/v1", model: "chat", transcriptionModel: "asr", hasApiKey: true };
let snapshot: { profiles: typeof profile[]; activeId: string | null };
function Runtime() { const { runtime, resolveRuntime, runtimeError } = useAIProfiles(); return <><button onClick={() => void resolveRuntime().catch(() => {})}>请求 AI</button><output data-testid="runtime">{runtime.settings.model}:{runtime.apiKey}</output>{runtimeError && <p role="alert">{runtimeError}</p>}</>; }
function mount(tab: "speech" | "models" = "models") { return render(<AIProfilesProvider><SystemSettings initialTab={tab} /><Runtime /></AIProfilesProvider>); }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); snapshot = { profiles: [profile], activeId: "one" }; vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockImplementation(async (command, args: any) => {
    if (command === "ai_profiles_list") return snapshot;
    if (command === "ai_profile_resolve") return { settings: { baseUrl: profile.baseUrl, model: profile.model, transcriptionModel: profile.transcriptionModel }, apiKey: "runtime-secret" };
    if (command === "ai_profile_save") {
      const { input } = args, previous = snapshot.profiles.find(p => p.id === input.id);
      const saved = { id: input.id ?? "new", name: input.name, baseUrl: input.baseUrl, model: input.model, transcriptionModel: input.transcriptionModel, hasApiKey: input.keyAction === "preserve" ? previous?.hasApiKey ?? false : input.keyAction === "replace" };
      snapshot = { profiles: previous ? snapshot.profiles.map(p => p.id === input.id ? saved : p) : [...snapshot.profiles, saved], activeId: snapshot.profiles.length ? snapshot.activeId : saved.id }; return snapshot;
    }
    if (command === "ai_profile_delete") { snapshot = { profiles: snapshot.profiles.filter(p => p.id !== args.id), activeId: snapshot.activeId === args.id ? null : snapshot.activeId }; return snapshot; }
    if (command === "ai_profile_activate") { snapshot = { ...snapshot, activeId: args.id }; return snapshot; }
    throw new Error("unexpected command");
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("allows CRUD while resolution is pending and rejects stale credentials", async () => {
  let finish!: (value: unknown) => void;
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd, args) => cmd === "ai_profile_resolve" ? new Promise(resolve => { finish = resolve; }) : original(cmd, args));
  mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "请求 AI" }));
  expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await screen.findByText("配置已保存到本机数据库。");
  finish({ settings: profile, apiKey: "stale-secret" });
  await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent(/^:$/));
  expect(screen.queryByText(/stale-secret/)).not.toBeInTheDocument();
});
it("provides accessible keyboard tabs and truthful unavailable state", async () => {
  vi.mocked(isTauri).mockReturnValue(false); mount("speech");
  expect(screen.getByRole("tab", { name: "单词发音" })).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(screen.getByRole("tab", { name: "单词发音" }), { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "大模型设置" })).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByText(/当前环境不支持数据库配置/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "保存配置" })).not.toBeInTheDocument();
});
it("loads active credentials only into runtime and saves explicit key actions without echo", async () => {
  mount(); await screen.findByText("已设置");
  expect(screen.getByText(/共 1 个配置/)).toBeInTheDocument();
  expect(screen.getByLabelText("API Key（选填）")).toHaveValue("");
  expect(invoke).not.toHaveBeenCalledWith("ai_profile_resolve", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "请求 AI" }));
  await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("chat:runtime-secret"));
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("ai_profile_save", { input: { id: "one", name: profile.name, baseUrl: profile.baseUrl, model: "chat", transcriptionModel: "asr", keyAction: "preserve", apiKey: null } }));
  fireEvent.change(screen.getByLabelText("密钥操作"), { target: { value: "replace" } });
  fireEvent.change(screen.getByLabelText("API Key（选填）"), { target: { value: "new-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("ai_profile_save", { input: expect.objectContaining({ id: "one", keyAction: "replace", apiKey: "new-secret" }) }));
  await waitFor(() => expect(screen.getByLabelText("API Key（选填）")).toHaveValue(""));
  expect(JSON.stringify(localStorage)).not.toMatch(/secret/);
});
it("confirms deletion of active profile and clears runtime", async () => {
  mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "删除配置" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("当前配置正在使用");
  expect(invoke).not.toHaveBeenCalledWith("ai_profile_delete", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent(/^:$/));
  expect(await screen.findByText(/共 0 个配置/)).toBeInTheDocument();
});
it("keeps database records and clears credentials when decryption fails", async () => {
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd, args) => cmd === "ai_profile_resolve" ? Promise.reject(new Error("decrypt secret-sensitive")) : original(cmd, args));
  mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "请求 AI" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("重新填写密钥");
  expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled();
  expect(screen.getByTestId("runtime")).toHaveTextContent(/^:$/);
  expect(screen.getByText(/共 1 个配置/)).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalledWith("ai_profile_delete", expect.anything());
});
it("activates another saved profile and refreshes in-memory credentials", async () => {
  snapshot = { profiles: [profile, { ...profile, id: "two", name: "备用配置", model: "second" }], activeId: "one" };
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation(async (cmd, args: any) => {
    if (cmd === "ai_profile_activate") { snapshot = { ...snapshot, activeId: args.id }; return snapshot; }
    if (cmd === "ai_profile_resolve" && args.id === "two") return { settings: { ...profile, model: "second" }, apiKey: "second-secret" };
    return original(cmd, args);
  });
  mount(); await screen.findByText("已设置");
  fireEvent.change(screen.getByLabelText("选择配置"), { target: { value: "two" } });
  fireEvent.click(screen.getByRole("button", { name: "使用此配置" }));
  await waitFor(() => expect(screen.getByText(/当前使用：备用配置/)).toBeInTheDocument());
  expect(invoke).not.toHaveBeenCalledWith("ai_profile_resolve", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "请求 AI" }));
  await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("second:second-secret"));
  expect(screen.getByText(/当前使用：备用配置/)).toBeInTheDocument();
  expect(screen.getByLabelText("API Key（选填）")).toHaveValue("");
});
it("creates the first database profile and uses its auto-active snapshot", async () => {
  snapshot = { profiles: [], activeId: null }; mount();
  await screen.findByRole("button", { name: "保存配置" });
  fireEvent.change(screen.getByLabelText("配置名称"), { target: { value: "首个配置" } });
  fireEvent.change(screen.getByLabelText("服务地址（Base URL）"), { target: { value: profile.baseUrl } });
  fireEvent.change(screen.getByLabelText("对话模型"), { target: { value: "chat" } });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  expect(await screen.findByText(/当前使用：首个配置/)).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalledWith("ai_profile_resolve", expect.anything());
  expect(localStorage.getItem("quicklang:ai-settings")).toBeNull();
});
it("clears saved keys explicitly and validates unsafe endpoints before writes", async () => {
  mount(); await screen.findByText("已设置");
  fireEvent.change(screen.getByLabelText("服务地址（Base URL）"), { target: { value: "https://models.example/v1?token=secret" } });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的 HTTPS");
  expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "ai_profile_save")).toBe(false);
  fireEvent.change(screen.getByLabelText("服务地址（Base URL）"), { target: { value: profile.baseUrl } });
  fireEvent.change(screen.getByLabelText("密钥操作"), { target: { value: "clear" } });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("ai_profile_save", { input: expect.objectContaining({ keyAction: "clear", apiKey: null }) }));
});
it("retries delayed database readiness automatically", async () => {
  const original = vi.mocked(invoke).getMockImplementation()!;
  let attempts = 0;
  vi.mocked(invoke).mockImplementation((cmd, args) => cmd === "ai_profiles_list" && attempts++ === 0 ? Promise.reject(new Error("DB_NOT_READY")) : original(cmd, args));
  mount(); expect(await screen.findByRole("alert")).toHaveTextContent("数据库配置读取失败");
  await waitFor(() => expect(screen.getByText("已设置")).toBeInTheDocument(), { timeout: 2500 });
});
it("retains legacy data on failed writes and recovers without discarding it", async () => {
  snapshot = { profiles: [], activeId: null };
  localStorage.setItem("quicklang:ai-settings", JSON.stringify({ baseUrl: profile.baseUrl, model: "chat" }));
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd, args) => cmd === "ai_profile_save" ? Promise.reject(new Error("disk full")) : original(cmd, args));
  mount(); await screen.findByRole("button", { name: "保存配置" });
  expect(invoke).not.toHaveBeenCalledWith("ai_profile_save", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  await screen.findByRole("alert");
  expect(localStorage.getItem("quicklang:ai-settings")).not.toBeNull();
  vi.mocked(invoke).mockImplementation(original);
  fireEvent.click(screen.getByRole("button", { name: "重试读取配置" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled());
  expect(localStorage.getItem("quicklang:ai-settings")).not.toBeNull();
  expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "ai_profile_save")).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("手动恢复");
});
it("keeps malformed legacy nonblocking and preserves unknown secret-bearing data", async () => {
  localStorage.setItem("quicklang:ai-settings", "broken"); const view = mount();
  await screen.findByText("已设置");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("旧配置");
  await waitFor(() => expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled());
  expect(screen.getByTestId("runtime")).toHaveTextContent(/^:$/);
  expect(localStorage.getItem("quicklang:ai-settings")).toBe("broken");
  view.unmount(); localStorage.setItem("quicklang:ai-settings", JSON.stringify({ baseUrl: profile.baseUrl, model: "chat", apiKey: "legacy-secret" }));
  mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("手动恢复");
  expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "ai_profile_save")).toHaveLength(0);
  expect(localStorage.getItem("quicklang:ai-settings")).toContain("legacy-secret");
});
it("does not consider metadata equality proof of a migration", async () => {
  snapshot.profiles[0] = { ...profile, name: "迁移的配置" };
  localStorage.setItem("quicklang:ai-settings", JSON.stringify({ baseUrl: profile.baseUrl, model: "chat", transcriptionModel: "asr" }));
  mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  await waitFor(() => expect(localStorage.getItem("quicklang:ai-settings")).toBeNull());
  expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "ai_profile_save")).toHaveLength(1);
  expect(snapshot.profiles).toHaveLength(2);
});
it("selects newly created B without activating it and reload discards stale drafts", async () => {
  mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "新增配置" }));
  fireEvent.change(screen.getByLabelText("配置名称"), { target: { value: "B" } });
  fireEvent.change(screen.getByLabelText("服务地址（Base URL）"), { target: { value: profile.baseUrl } });
  fireEvent.change(screen.getByLabelText("对话模型"), { target: { value: "second" } });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await waitFor(() => expect(screen.getByLabelText("选择配置")).toHaveValue("new"));
  expect(screen.getByLabelText("配置名称")).toHaveValue("B");
  expect(snapshot.activeId).toBe("one");
  fireEvent.change(screen.getByLabelText("对话模型"), { target: { value: "unsaved" } });
  snapshot = { ...snapshot, profiles: snapshot.profiles.map(p => p.id === "new" ? { ...p, model: "updated-db" } : p) };
  fireEvent.click(screen.getByRole("button", { name: "重试读取配置" }));
  await waitFor(() => expect(screen.getByLabelText("对话模型")).toHaveValue("updated-db"));
});
it("clears runtime after mutation failure and preserves database profiles", async () => {
  mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "请求 AI" }));
  await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("runtime-secret"));
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd, args) => cmd === "ai_profile_save" ? Promise.reject(new Error("failed")) : original(cmd, args));
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("运行时凭据已清空");
  expect(screen.getByTestId("runtime")).toHaveTextContent(/^:$/);
  expect(snapshot.profiles).toHaveLength(1);
});
it("ignores a stale resolve after a newer reload", async () => {
  let resolveOld!: (value: any) => void;
  let reload!: () => Promise<void>;
  function Controls() { reload = useAIProfiles().reload; return null; }
  const original = vi.mocked(invoke).getMockImplementation()!;
  let resolves = 0;
  vi.mocked(invoke).mockImplementation((cmd, args) => {
    if (cmd === "ai_profile_resolve" && resolves++ === 0) return new Promise(resolve => { resolveOld = resolve; });
    return original(cmd, args);
  });
  await act(async () => { render(<AIProfilesProvider><Controls /><Runtime /></AIProfilesProvider>); });
  fireEvent.click(screen.getByRole("button", { name: "请求 AI" }));
  await waitFor(() => expect(resolveOld).toBeDefined());
  await act(async () => { await reload(); });
  fireEvent.click(screen.getByRole("button", { name: "请求 AI" }));
  await waitFor(() => expect(screen.getByTestId("runtime")).toHaveTextContent("chat:runtime-secret"));
  await act(async () => { resolveOld({ settings: { ...profile, model: "stale" }, apiKey: "stale-secret" }); });
  expect(screen.getByTestId("runtime")).toHaveTextContent("chat:runtime-secret");
});
it("stops migration after confirmed DB save but failed receipt persistence", async () => {
  localStorage.setItem("quicklang:ai-settings", JSON.stringify({ baseUrl: profile.baseUrl, model: "chat" }));
  const originalSet = Storage.prototype.setItem;
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "quicklang:ai-migration-receipt" && value.includes('"saved"')) throw new Error("receipt unavailable");
    originalSet.call(this, key, value);
  });
  const view = mount(); await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("手动恢复");
  expect(localStorage.getItem("quicklang:ai-settings")).not.toBeNull();
  view.unmount(); write.mockRestore(); mount();
  await screen.findByText("已设置");
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("手动恢复");
  expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "ai_profile_save")).toHaveLength(1);
});
it("migrates legacy metadata after DB save and does not duplicate after cleanup failure", async () => {
  snapshot = { profiles: [], activeId: null };
  localStorage.setItem("quicklang:ai-settings", JSON.stringify({ baseUrl: profile.baseUrl, model: "chat", transcriptionModel: "asr" }));
  const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
  const view = mount(); await screen.findByRole("button", { name: "保存配置" });
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("旧配置清理失败");
  expect(localStorage.getItem("quicklang:ai-settings")).not.toBeNull();
  view.unmount(); remove.mockRestore(); mount();
  await screen.findByRole("button", { name: "保存配置" });
  fireEvent.click(screen.getByRole("button", { name: "迁移旧配置" }));
  await waitFor(() => expect(localStorage.getItem("quicklang:ai-settings")).toBeNull());
  expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "ai_profile_save")).toHaveLength(1);
});
