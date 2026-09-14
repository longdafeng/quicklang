import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../../../src/ui/src/app/App";
import { loadProfiles, storageKey } from "../../../src/ui/src/features/users/profiles";
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function create(name: string, level = "A1") {
  if (screen.queryByRole("button", { name: /＋ 添加用户/ })) fireEvent.click(screen.getByRole("button", { name: /＋ 添加用户/ }));
  const form = screen.queryByRole("region", { name: "添加用户" });
  const fields = form ? within(form) : screen;
  fireEvent.change(fields.getByLabelText("用户名称"), { target: { value: name } });
  fireEvent.change(fields.getByLabelText("英语水平"), { target: { value: level } });
  fireEvent.click(screen.getByText("创建用户并开始"));
}
function nav(name: string) {
  if (name === "用户设置") fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(name) })); }
it("restores the last user on launch and isolates settings, progress and vocabulary", () => {
  const view = render(<App />);
  expect(screen.getByText("今天谁来学习？")).toBeInTheDocument();
  create("小明", "B1");
  expect(screen.getByRole("heading", { level: 1, name: "选书" })).toBeVisible();
  expect(screen.getByRole("button", { name: "选书", exact: true })).toHaveAttribute("aria-current", "page");
  nav("强化学习");
  fireEvent.change(screen.getByRole("spinbutton", { name: "本次背诵数量" }), { target: { value: "12" } });
  nav("生词表");
  fireEvent.change(screen.getByLabelText("添加单词"), { target: { value: "remember" } });
  const first = loadProfiles()[0];
  localStorage.setItem(storageKey("flash:daily", first.id), JSON.stringify({ learned: 2, end: 2 }));
  nav("学习进度"); expect(screen.getByText("强化学习：2 / 3")).toBeInTheDocument();
  nav("切换用户"); create("小红", "A2");
  expect(screen.getByRole("heading", { level: 1, name: "选书" })).toBeVisible();
  expect(screen.getByRole("button", { name: "选书", exact: true })).toHaveAttribute("aria-current", "page");
  nav("强化学习");
  expect(screen.getByRole("spinbutton", { name: "本次背诵数量" })).toHaveValue(100);
  expect(screen.getByText("已经背诵 0 个单词 · 剩余 3 个")).toBeInTheDocument();
  nav("生词表"); expect(screen.getByText("还没有生词。")).toBeInTheDocument();
  nav("用户设置");
  fireEvent.change(screen.getByLabelText("用户名称"), { target: { value: "小红同学" } });
  fireEvent.change(screen.getByLabelText("英语水平"), { target: { value: "B2" } });
  fireEvent.click(screen.getByText("保存用户设置"));
  expect(loadProfiles()[1]).toMatchObject({ name: "小红同学", level: "B2" });
  nav("切换用户"); nav("小明");
  expect(screen.getByRole("heading", { level: 1, name: "学习进度" })).toBeVisible();
  nav("强化学习");
  expect(screen.getByRole("spinbutton", { name: "本次背诵数量" })).toHaveValue(12);
  expect(screen.getByText("已经背诵 2 个单词 · 剩余 1 个")).toBeInTheDocument();
  nav("生词表"); expect(screen.getByText("生词表 · 1 个")).toBeInTheDocument();
  view.unmount(); render(<App />);
  expect(screen.queryByText("今天谁来学习？")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "学习进度" })).toBeVisible();
  expect(screen.getByText("强化学习：2 / 3")).toBeVisible();
  nav("强化学习");
  expect(screen.getByText("已经背诵 2 个单词 · 剩余 1 个")).toBeInTheDocument();
  nav("切换用户"); nav("小红同学"); expect(screen.getByText("B2 · 中高级")).toBeInTheDocument();
});
it("migrates existing data to the first user only, including unfinished spelling sessions", () => {
  const saved = { learned: 1, session: { queue: [0, 1], index: 1, wrong: [0], needs: {}, correct: 0, total: 2, elapsed: 5000, phase: "test", feedback: null, round: 0 } };
  localStorage.setItem("quicklang:spell:daily", JSON.stringify(saved));
  localStorage.setItem("quicklang:vocabulary", JSON.stringify({ daily: ["remember"] }));
  localStorage.setItem("quicklang:selected-book", JSON.stringify("travel"));
  render(<App />); create("旧用户");
  const first = loadProfiles()[0];
  expect(JSON.parse(localStorage.getItem(storageKey("spell:daily", first.id))!)).toEqual(saved);
  expect(JSON.parse(localStorage.getItem(storageKey("selected-book", first.id))!)).toBe("travel");
  nav("切换用户"); create("新用户"); nav("生词表");
  expect(screen.getByText("还没有生词。")).toBeInTheDocument();
});
it("keeps the picker visible when profile persistence fails and rejects duplicate names", () => {
  render(<App />);
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  create("小明"); expect(screen.getByRole("alert")).toHaveTextContent("用户设置保存失败");
  expect(screen.getByText("今天谁来学习？")).toBeInTheDocument();
  write.mockRestore(); create("小明"); nav("切换用户"); create("小明");
  expect(screen.getByRole("alert")).toHaveTextContent("这个用户名称已存在");
  expect(loadProfiles()).toHaveLength(1);
});

it("expands only the selected menu group in the requested order", () => {
  render(<App />); create("菜单测试");
  expect(screen.getAllByRole("button", { expanded: true }).map(button => button.textContent)).toEqual(["单词背诵⌄"]);
  expect(screen.getAllByRole("button", { expanded: false }).map(button => button.textContent)).toEqual(["听说训练›", "工具›", "设置›"]);
  expect(screen.getByRole("button", { name: "选书" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "查询" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "工具", exact: true }));
  expect(screen.queryByRole("button", { name: "选书" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "词库维护", exact: true }));
  expect(screen.getByRole("heading", { level: 1, name: "词库维护" })).toBeVisible();
  expect(screen.getByRole("button", { name: "工具", exact: true })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  expect(screen.queryByRole("button", { name: "查询" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "系统设置" })).toBeVisible();
  expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
});

it("restores a newly created user and falls back safely for older installations", () => {
  const view = render(<App />); create("第一位"); nav("切换用户"); create("第二位");
  view.unmount(); const reopened = render(<App />);
  expect(screen.getByText("第二位")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "学习进度" })).toBeVisible();
  expect(screen.getByRole("button", { name: "学习进度", exact: true })).toHaveAttribute("aria-current", "page");
  reopened.unmount(); localStorage.setItem("quicklang:last-user", "missing");
  const fallback = render(<App />); expect(screen.getByText("第一位")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "学习进度" })).toBeVisible();
  fallback.unmount(); localStorage.removeItem("quicklang:last-user");
  render(<App />); expect(screen.getByText("第一位")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "学习进度" })).toBeVisible();
});
it("shows current settings before other users and the create entry, and keeps the user on failed switching", () => {
  render(<App />); create("小明"); nav("切换用户"); create("小红"); nav("切换用户");
  expect(screen.getByRole("region", { name: "当前用户设置" })).toBeVisible();
  const others = within(screen.getByRole("region", { name: "其他用户" }));
  expect(others.getAllByRole("button").map(button => button.textContent)).toEqual(["小明A1 · 入门切换到此用户", "＋ 添加用户创建独立的学习资料和进度"]);
  const last = localStorage.getItem("quicklang:last-user");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  nav("小明"); expect(screen.getByRole("alert")).toHaveTextContent("用户切换失败");
  expect(localStorage.getItem("quicklang:last-user")).toBe(last);
  expect(screen.getByRole("heading", { name: "用户设置 · 小红" })).toBeVisible();
});
