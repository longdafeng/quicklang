import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AIProfilesProvider, useAIProfiles } from "../../../src/mac_ui/src/features/settings/AIProfiles";
import { SystemSettings } from "../../../src/mac_ui/src/features/settings/SystemSettings";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("../../../src/mac_ui/src/features/settings/SpeechSettings", () => ({ SpeechSettings: () => null }));
const profiles = ["A", "B"].map(id => ({ id, name: id, baseUrl: "https://example.com/v1", model: "chat", transcriptionModel: "asr", hasApiKey: true }));
let snapshot = { profiles, activeId: "A" };
let resolveCode = "AI_MASTER_KEY_MISSING";
let resetCode = "";
function Probe() { const { runtime, revision, resolveRuntime, runtimeError, ready } = useAIProfiles(); return <><button disabled={!ready} onClick={() => void resolveRuntime().catch(() => {})}>请求凭据</button><output data-testid="state">{JSON.stringify({ runtime, revision })}</output>{runtimeError && <p role="alert">{runtimeError}</p>}</>; }
async function mount() { render(<AIProfilesProvider><SystemSettings initialTab="models" /><Probe /></AIProfilesProvider>); await waitFor(() => expect(screen.getByRole("button", { name: "请求凭据" })).toBeEnabled()); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "请求凭据" })); }); }
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); snapshot = { profiles, activeId: "A" }; resolveCode = "AI_MASTER_KEY_MISSING"; resetCode = "";
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "ai_profiles_list") return snapshot;
    if (command === "ai_profile_resolve") {
      if (snapshot.profiles[0].hasApiKey) throw { code: resolveCode, message: "sensitive backend details", retryable: false };
      return { settings: { baseUrl: profiles[0].baseUrl, model: "chat", transcriptionModel: "asr" }, apiKey: "" };
    }
    if (command === "ai_profiles_reset_credentials") {
      if (resetCode) throw { code: resetCode, message: "sensitive backend details", retryable: false };
      snapshot = { ...snapshot, profiles: snapshot.profiles.map(p => ({ ...p, hasApiKey: false })) }; return snapshot;
    }
    throw new Error("unexpected command");
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("requires explicit confirmation and cancel never invokes credential reset", async () => {
  await mount(); fireEvent.click(await screen.findByRole("button", { name: "恢复丢失的主密钥" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("所有配置");
  expect(screen.getByRole("alertdialog")).toHaveTextContent("不可撤销");
  expect(screen.getByRole("alertdialog")).toHaveTextContent("配置名称、地址、模型和当前选择会保留");
  fireEvent.click(screen.getByRole("button", { name: "取消恢复" }));
  expect(invoke).not.toHaveBeenCalledWith("ai_profiles_reset_credentials", expect.anything());
  expect(snapshot.profiles.every(p => p.hasApiKey)).toBe(true);
});
it("resets all credentials only after confirmation preserving metadata active selection and refreshing revision", async () => {
  await mount(); fireEvent.click(await screen.findByRole("button", { name: "恢复丢失的主密钥" }));
  const before = JSON.parse(screen.getByTestId("state").textContent!).revision;
  fireEvent.click(screen.getByRole("button", { name: "确认清除所有已保存密钥" }));
  expect(await screen.findByText(/所有已保存密钥已清除/)).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith("ai_profiles_reset_credentials", { confirmed: true });
  expect(snapshot).toEqual({ profiles: profiles.map(p => ({ ...p, hasApiKey: false })), activeId: "A" });
  const state = JSON.parse(screen.getByTestId("state").textContent!);
  expect(state.runtime.apiKey).toBe(""); expect(state.revision).toBeGreaterThan(before);
  expect(screen.queryByRole("button", { name: "恢复丢失的主密钥" })).not.toBeInTheDocument();
});
it.each(["AI_RECOVERY_KEY_PRESENT", "AI_KEYCHAIN_UNAVAILABLE", "AI_RECOVERY_CONFIRMATION_REQUIRED"])("does not claim success on backend refusal %s", async code => {
  resetCode = code; await mount(); fireEvent.click(await screen.findByRole("button", { name: "恢复丢失的主密钥" }));
  fireEvent.click(screen.getByRole("button", { name: "确认清除所有已保存密钥" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("恢复失败"));
  expect(screen.queryByText(/所有已保存密钥已清除/)).not.toBeInTheDocument();
  expect(snapshot.profiles.every(p => p.hasApiKey)).toBe(true);
  expect(screen.getByRole("alert")).not.toHaveTextContent("sensitive backend details");
  expect(JSON.parse(screen.getByTestId("state").textContent!).runtime.apiKey).toBe("");
});
it.each(["AI_MASTER_KEY_INVALID", "AI_KEYCHAIN_UNAVAILABLE", "AI_DECRYPTION_FAILED"])("does not offer destructive recovery for %s", async code => {
  resolveCode = code; await mount(); await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "恢复丢失的主密钥" })).not.toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalledWith("ai_profiles_reset_credentials", expect.anything());
});
