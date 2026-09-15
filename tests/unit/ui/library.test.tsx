import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../../../src/mac_ui/src/app/App";
beforeEach(() => { localStorage.clear(); localStorage.setItem("quicklang:profiles", JSON.stringify([{ id: "test", name: "测试用户", level: "A1" }])); });
function renderApp() { return render(<App />); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function maintenance() { fireEvent.click(screen.getByRole("button", { name: "工具", exact: true })); fireEvent.click(screen.getByRole("button", { name: /词库维护/ })); }
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }
it("creates a book, adds and edits words, persists it and shares it with study", () => {
  const view = renderApp(); maintenance();
  fill("新词书名称", "工作英语"); fireEvent.click(screen.getByText("创建词书"));
  expect(screen.getByText("这本书还没有单词，请先添加。")).toBeInTheDocument();
  fill("英文单词", "meeting"); fill("中文释义", "会议"); fill("英文例句", "Join the meeting.");
  fireEvent.click(screen.getByText("添加单词"));
  fireEvent.click(screen.getByRole("button", { name: "修改 meeting" }));
  fill("中文释义", "会议；会面"); fireEvent.click(screen.getByText("保存单词"));
  expect(screen.getByText("会议；会面")).toBeInTheDocument();
  fill("英文单词", "MEETING"); fireEvent.click(screen.getByText("添加单词"));
  expect(screen.getByRole("alert")).toHaveTextContent("已存在该单词");
  view.unmount(); renderApp(); maintenance();
  expect(screen.getByLabelText("词书名称", { exact: true })).toHaveValue("工作英语");
  expect(screen.getByText("会议；会面")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "单词背诵", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /强化学习/ }));
  expect(screen.getByText("已经背诵 0 个单词 · 剩余 1 个")).toBeInTheDocument();
});
it("edits built-in books without duplicates and confirms deletion before resetting affected progress", () => {
  localStorage.setItem("quicklang:user:test:flash:daily", JSON.stringify({ learned: 1, end: 1 }));
  localStorage.setItem("quicklang:user:test:spell:daily", JSON.stringify({ learned: 1, session: null }));
  localStorage.setItem("quicklang:user:test:vocabulary", JSON.stringify({ daily: ["remember", "practice"] }));
  renderApp(); maintenance();
  fill("词书名称", "我的日常英语"); fireEvent.click(screen.getByText("保存名称"));
  expect(localStorage.getItem("quicklang:user:test:flash:daily")).toContain('"learned":1');
  expect(screen.getAllByRole("option", { name: "我的日常英语" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "删除 remember" }));
  fireEvent.click(screen.getByText("取消删除"));
  expect(screen.getByRole("button", { name: "修改 remember" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "删除 remember" }));
  fireEvent.click(screen.getByText("确认删除单词"));
  expect(screen.queryByRole("button", { name: "修改 remember" })).not.toBeInTheDocument();
  expect(localStorage.getItem("quicklang:user:test:spell:daily")).toBeNull();
  expect(JSON.parse(localStorage.getItem("quicklang:user:test:vocabulary")!).daily).toEqual(["practice"]);
  fireEvent.click(screen.getByRole("button", { name: "单词背诵", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /强化学习/ }));
  expect(screen.getByText("已经背诵 0 个单词 · 剩余 2 个")).toBeInTheDocument();
});
it("does not report success or replace the book when storage is full", () => {
  renderApp(); maintenance();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  fill("新词书名称", "无法保存的书"); fireEvent.click(screen.getByText("创建词书"));
  expect(screen.getByRole("alert")).toHaveTextContent("词书保存失败");
  expect(screen.queryByRole("option", { name: "无法保存的书" })).not.toBeInTheDocument();
});

it("preserves phonetics, translations and attribution when editing a word", () => {
  const metadata = { phoneticUs: "fəˈnetɪk", phoneticUk: "uk", translations: ["原释义"], sentences: [{ textEn: "Original example.", textZh: "原例句", source: "upstream" }] };
  localStorage.setItem("quicklang:user:test:books", JSON.stringify([{ id: "daily", name: "Daily", words: [{ id: "one", spelling: "one", meaning: "一", ...metadata }] }]));
  renderApp(); maintenance(); fireEvent.click(screen.getByRole("button", { name: "修改 one" }));
  fill("中文释义", "第一"); fireEvent.click(screen.getByText("保存单词"));
  expect(JSON.parse(localStorage.getItem("quicklang:user:test:books")!)[0].words[0]).toEqual(expect.objectContaining({ ...metadata, meaning: "第一" }));
});

it("keeps the current book and reports failure when importing exceeds storage quota", async () => {
  renderApp(); fireEvent.click(screen.getByRole("button", { name: "选书", exact: true }));
  const file = { size: 100, text: async () => JSON.stringify({ name: "Imported", words: [{ spelling: "test", meaning: "测试" }] }) };
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  fireEvent.change(screen.getByLabelText(/选择 JSON 文件/), { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("词书保存失败");
  expect(screen.queryByRole("button", { name: /Imported/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /日常英语.*正在学习/ })).toBeInTheDocument();
});
