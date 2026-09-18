import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { refreshNativeVoices } from "../../../src/mac_ui/src/features/speech/native";
import { SpeechStartup } from "../../../src/mac_ui/src/features/speech/SpeechStartup";
import { loadSpeechSettings } from "../../../src/mac_ui/src/features/speech/speech";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("../../../src/mac_ui/src/features/speech/native", () => ({ usesNativeSpeech: () => true, refreshNativeVoices: vi.fn() }));
const basic = { name: "Samantha", lang: "en-US", voiceURI: "macos-say:Samantha", localService: true, default: false };
const enhanced = { ...basic, name: "Nathan (Enhanced)", voiceURI: "macos-say:Nathan (Enhanced)" };
beforeEach(() => {
  localStorage.clear();
  vi.mocked(invoke).mockImplementation(async command => command === "speech_download_enhanced" ? "permissionRequired" : false);
  vi.mocked(refreshNativeVoices).mockResolvedValue([basic]);
  HTMLDialogElement.prototype.showModal = vi.fn();
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("renders the app while the database is still loading without enumerating voices", () => {
  vi.mocked(invoke).mockReturnValue(new Promise(() => {}));
  render(<SpeechStartup><button>Start learning</button></SpeechStartup>);
  expect(screen.getByRole("button", { name: "Start learning" })).toBeEnabled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(refreshNativeVoices).not.toHaveBeenCalled();
});

it("skips native checks when the database already records an enhanced voice", async () => {
  vi.mocked(invoke).mockImplementation(async command => command === "speech_enhanced_available");
  render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("speech_enhanced_available"));
  expect(refreshNativeVoices).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalledWith("speech_download_enhanced");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each([enhanced, { ...enhanced, name: "Samantha (Enhanced)", voiceURI: "macos-say:Samantha (Enhanced)" }])("skips prompting when a preferred enhanced voice exists", async voice => {
  vi.mocked(refreshNativeVoices).mockResolvedValue([basic, voice]);
  render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("speech_enhanced_available", { available: true }));
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("allows dismissing the non-modal prompt without saving a refusal", async () => {
  render(<SpeechStartup><button>Start learning</button></SpeechStartup>);
  const dialog = await screen.findByRole("dialog");
  expect(dialog).not.toHaveAttribute("aria-modal", "true");
  expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("稍后处理"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start learning" })).toBeEnabled();
  expect(invoke).not.toHaveBeenCalledWith("speech_download_preference", { declined: true });
});

it("offers permission and manual download when automatic startup lacks access", async () => {
  render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  const download = await screen.findByLabelText("下载增强版音色（推荐）");
  expect(download).toBeChecked();
  expect(invoke).not.toHaveBeenCalledWith("speech_open_download_settings");
  fireEvent.click(screen.getByRole("button", { name: "手动下载（无需授权）" }));
  expect(await screen.findByText("下载完成，重新检测")).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith("speech_open_download_settings");
  expect(screen.getByText("Ready")).toBeInTheDocument();
  fireEvent.click(screen.getByText("下载完成，重新检测"));
  expect(await screen.findByRole("alert")).toHaveTextContent("尚未检测到");
  vi.mocked(refreshNativeVoices).mockResolvedValue([basic, enhanced]);
  fireEvent.click(screen.getByText("下载完成，重新检测"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(loadSpeechSettings().voiceURI).toBe("");
});

it("persists refusal before using basic Samantha and remembers it on a fresh mount", async () => {
  let declined = false;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "speech_download_preference" && args && "declined" in args) declined = Boolean(args.declined);
    return command === "speech_download_enhanced" ? "permissionRequired" : command === "speech_download_preference" && declined;
  });
  const view = render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  fireEvent.click(await screen.findByLabelText("不下载，使用 Samantha，以后不再提示"));
  fireEvent.click(screen.getByText("保存选择并继续"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(declined).toBe(true);
  const attempts = vi.mocked(invoke).mock.calls.filter(([command]) => command === "speech_download_enhanced").length;
  expect(loadSpeechSettings().voiceURI).toBe(basic.voiceURI);
  view.unmount(); localStorage.clear();
  render(<SpeechStartup><p>Reopened</p></SpeechStartup>);
  expect(screen.getByText("Reopened")).toBeInTheDocument();
  await waitFor(() => expect(loadSpeechSettings().voiceURI).toBe(basic.voiceURI));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "speech_download_enhanced")).toHaveLength(attempts);
});

it("keeps the prompt open when refusal cannot be saved", async () => {
  render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  fireEvent.click(await screen.findByLabelText("不下载，使用 Samantha，以后不再提示"));
  vi.mocked(invoke).mockRejectedValueOnce(new Error("database unavailable"));
  fireEvent.click(screen.getByText("保存选择并继续"));
  expect(await screen.findByRole("alert")).toHaveTextContent("未能保存");
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(loadSpeechSettings().voiceURI).toBe("");
});

it("retries a failed startup read instead of treating it as a refusal", async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error("not ready"));
  render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  expect(await screen.findByRole("alert")).toHaveTextContent("启动音色检查失败");
  fireEvent.click(screen.getByText("重新检查"));
  expect(await screen.findByLabelText("下载增强版音色（推荐）")).toBeChecked();
});


it("starts automatically with permission and verifies inventory before continuing", async () => {
  vi.mocked(invoke).mockImplementation(async command => command === "speech_download_enhanced" ? "started" : false);
  render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  expect(await screen.findByText(/已点击 Apple 下载按钮/)).toBeInTheDocument();
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith("speech_download_enhanced");
  vi.mocked(refreshNativeVoices).mockResolvedValue([basic, enhanced]);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 4500 });
  expect(invoke).toHaveBeenCalledWith("speech_enhanced_available", { available: true });
  expect(loadSpeechSettings().voiceURI).toBe("");
});

it("lets the user open permission settings and retry without treating it as a grant", async () => {
  render(<SpeechStartup><p>Ready</p></SpeechStartup>);
  fireEvent.click(await screen.findByText("打开辅助功能权限设置"));
  expect(invoke).toHaveBeenCalledWith("speech_open_accessibility_settings");
  const retry = await screen.findByText("已授权，重试自动下载");
  await waitFor(() => expect(retry).not.toBeDisabled());
  vi.mocked(invoke).mockImplementation(async command => command === "speech_download_enhanced" ? "manual" : false);
  fireEvent.click(retry);
  expect(await screen.findByText(/未能自动操作当前系统/)).toBeInTheDocument();
  expect(screen.getByText("Ready")).toBeInTheDocument();
});
