import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../../../src/mac_ui/src/app/App";
import { startSession } from "../../../src/mac_ui/src/features/spelling/session";
vi.mock("../../../src/mac_ui/src/features/library/addWord", () => ({ resolveNewWord: vi.fn(async () => ({ id: "new", spelling: "orange", meaning: "橙子" })) }));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("quicklang:profiles", JSON.stringify([{ id: "test", name: "用户", level: "A1" }]));
  localStorage.setItem("quicklang:user:test:books", JSON.stringify([{ id: "daily", name: "测试词书", words: [{ id: "a", spelling: "apple", meaning: "苹果" }, { id: "b", spelling: "banana", meaning: "香蕉" }] }]));
  localStorage.setItem("quicklang:user:test:flash:daily", JSON.stringify({ learned: 1, end: 2 }));
  localStorage.setItem("quicklang:user:test:spell:daily", JSON.stringify({ learned: 1, session: startSession(1, 1) }));
});
afterEach(cleanup);
it("persists insertion order while keeping in-progress study on the same word", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "工具", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "词库维护", exact: true }));
  fireEvent.change(screen.getByLabelText("英文单词", { exact: true }), { target: { value: "orange" } });
  fireEvent.change(screen.getByLabelText("插入位置", { exact: true }), { target: { value: "start" } });
  fireEvent.click(screen.getByRole("button", { name: "添加单词", exact: true }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem("quicklang:user:test:books")!)[0].words.map((word: { id: string }) => word.id)).toEqual(["new", "a", "b"]));
  expect(JSON.parse(localStorage.getItem("quicklang:user:test:flash:daily")!)).toEqual({ learned: 2, end: 3 });
  expect(JSON.parse(localStorage.getItem("quicklang:user:test:spell:daily")!).session.queue).toEqual([2]);
});
