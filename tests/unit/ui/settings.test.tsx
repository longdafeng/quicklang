import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../../../src/mac_ui/src/app/App";
import { loadAISettings } from "../../../src/mac_ui/src/features/settings/SystemSettings";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function openSettings() {
  if (screen.queryByText("今天谁来学习？")) {
    if (screen.queryByRole("button", { name: /设置测试用户/ })) fireEvent.click(screen.getByRole("button", { name: /设置测试用户/ }));
    else {
      fireEvent.change(screen.getByLabelText("用户名称"), { target: { value: "设置测试用户" } });
      fireEvent.click(screen.getByRole("button", { name: "创建用户并开始" }));
    }
  }
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /系统设置/ }));
}

function fillSettings() {
  fireEvent.change(screen.getByLabelText("服务地址（Base URL）"), { target: { value: "https://models.example/v1" } });
  fireEvent.change(screen.getByLabelText("对话模型"), { target: { value: " test-model " } });
  fireEvent.change(screen.getByLabelText("API Key（选填）"), { target: { value: "secret-test-key" } });
}

it("opens system settings and persists model configuration without persisting the API key", () => {
  const view = render(<App />); openSettings(); fillSettings();
  fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
  expect(screen.getByRole("status")).toHaveTextContent("设置已保存");
  expect(JSON.parse(localStorage.getItem("quicklang:ai-settings")!)).toEqual({ baseUrl: "https://models.example/v1", model: "test-model", transcriptionModel: "" });
  expect(JSON.stringify(localStorage)).not.toContain("secret-test-key");
  fireEvent.click(screen.getByRole("button", { name: "单词背诵", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /选书/ })); openSettings();
  expect(screen.getByLabelText("API Key（选填）")).toHaveValue("secret-test-key");
  view.unmount(); render(<App />); openSettings();
  expect(screen.getByLabelText("对话模型")).toHaveValue("test-model");
  expect(screen.getByLabelText("API Key（选填）")).toHaveValue("");
});

it("rejects unsafe service URLs and reports storage failures without claiming success", () => {
  render(<App />); openSettings(); fillSettings();
  fireEvent.change(screen.getByLabelText("服务地址（Base URL）"), { target: { value: "https://models.example/v1?key=secret" } });
  fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
  expect(screen.getByRole("alert")).toHaveTextContent("请输入有效的 HTTPS 服务地址");
  expect(localStorage.getItem("quicklang:ai-settings")).toBeNull();
  fillSettings();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Full"); });
  fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
  expect(screen.getByRole("alert")).toHaveTextContent("设置保存失败");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("recovers from malformed stored configuration", () => {
  localStorage.setItem("quicklang:ai-settings", "broken json");
  expect(loadAISettings()).toEqual({ baseUrl: "", model: "", transcriptionModel: "" });
  localStorage.setItem("quicklang:ai-settings", JSON.stringify({ model: 12, baseUrl: "https://models.example/v1" }));
  expect(loadAISettings()).toEqual({ baseUrl: "https://models.example/v1", model: "", transcriptionModel: "" });
});

it("fills gateway aliases without saving or reusing the previous provider credential", () => {
  render(<App />); openSettings(); fillSettings();
  fireEvent.click(screen.getByRole("button", { name: "填入本机 LiteLLM 配置" }));
  expect(screen.getByLabelText("服务地址（Base URL）")).toHaveValue("http://127.0.0.1:4000/v1");
  expect(screen.getByLabelText("对话模型")).toHaveValue("quicklang-chat");
  expect(screen.getByLabelText("语音转写模型（选填）")).toHaveValue("quicklang-transcribe");
  expect(screen.getByLabelText("API Key（选填）")).toHaveValue("");
  expect(localStorage.getItem("quicklang:ai-settings")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
  expect(loadAISettings().model).toBe("quicklang-chat");
});
