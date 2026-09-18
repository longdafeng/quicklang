import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LibraryMaintenance, type EditableBook } from "../../../src/mac_ui/src/features/library/LibraryMaintenance";
import type { Word } from "../../../src/mac_ui/src/contracts";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const word = (spelling: string): Word => ({ id: spelling, spelling, meaning: spelling });
const book: EditableBook = { id: "book", name: "测试书", words: [word("one"), word("two")] };
function setup(resolveWord = vi.fn<(spelling: string, signal: AbortSignal) => Promise<Word>>(async () => word("new")), initialBook = book) {
  const save = vi.fn((_book: EditableBook) => true);
  const props = { book: initialBook, books: [initialBook], ready: true, select: vi.fn(), create: vi.fn(), save, resolveWord, openSettings: vi.fn() };
  const view = render(<LibraryMaintenance {...props} />);
  return { ...view, props, save, resolveWord };
}
function add(spelling = "new") {
  fireEvent.change(screen.getByLabelText("英文单词", { exact: true }), { target: { value: spelling } });
  fireEvent.click(screen.getByRole("button", { name: "添加单词", exact: true }));
}
it("preserves an entered spelling when selecting a row insertion shortcut", () => {
  setup();
  fireEvent.change(screen.getByLabelText("英文单词", { exact: true }), { target: { value: "orange" } });
  fireEvent.click(screen.getByRole("button", { name: "在 two 前插入" }));
  expect(screen.getByLabelText("英文单词", { exact: true })).toHaveValue("orange");
});
it("adds resolved words before an anchor and reports real neighbors", async () => {
  const { save } = setup();
  expect(screen.queryByLabelText("中文释义")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "在 two 前插入" }));
  await act(async () => add());
  expect(save.mock.calls[0][0].words.map((w: Word) => w.spelling)).toEqual(["one", "new", "two"]);
  expect(screen.getByRole("status")).toHaveTextContent("测试书");
  expect(screen.getByRole("status")).toHaveTextContent("第 2");
  expect(screen.getByRole("status")).toHaveTextContent("前一个：one");
  expect(screen.getByRole("status")).toHaveTextContent("后一个：two");
});
it("locates normalized duplicates beyond the current filtered page without resolving", () => {
  const { resolveWord } = setup(undefined, { ...book, words: Array.from({ length: 35 }, (_, i) => word(`word${i}`)) });
  fireEvent.change(screen.getByLabelText("搜索单词"), { target: { value: "word0" } });
  add(" ＷＯＲＤ３４ ");
  expect(resolveWord).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("已存在");
  expect(screen.getByLabelText("搜索单词")).toHaveValue("");
  expect(screen.getByRole("button", { name: "修改 word34" }).closest("li")).toHaveAttribute("aria-current", "true");
});
it("blocks competing writes, aborts explicit cancellation and ignores late results", async () => {
  let finish!: (w: Word) => void;
  const resolveWord = vi.fn<(spelling: string, signal: AbortSignal) => Promise<Word>>(() => new Promise<Word>(resolve => { finish = resolve; }));
  const { save } = setup(resolveWord);
  add();
  fireEvent.submit(screen.getByLabelText("英文单词", { exact: true }).closest("form")!);
  expect(resolveWord).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "修改 one" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除 one" })).toBeDisabled();
  expect(screen.getByLabelText("词书名称", { exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "取消添加" }));
  expect(resolveWord.mock.calls[0][1].aborted).toBe(true);
  await act(async () => finish(word("new")));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("英文单词", { exact: true })).toHaveValue("new");
});
it.each(["unmount", "switch"])("aborts pending resolution on %s", async mode => {
  let finish!: (w: Word) => void;
  const resolveWord = vi.fn<(spelling: string, signal: AbortSignal) => Promise<Word>>(() => new Promise<Word>(resolve => { finish = resolve; }));
  const view = setup(resolveWord);
  add();
  if (mode === "unmount") view.unmount();
  else view.rerender(<LibraryMaintenance {...view.props} book={{ ...book, id: "other" }} />);
  expect(resolveWord.mock.calls[0][1].aborted).toBe(true);
  await act(async () => finish(word("new")));
  expect(view.save).not.toHaveBeenCalled();
});
it("rejects a removed anchor after resolution without overwriting the current book", async () => {
  let finish!: (w: Word) => void;
  const view = setup(vi.fn<(spelling: string, signal: AbortSignal) => Promise<Word>>(() => new Promise<Word>(resolve => { finish = resolve; })));
  fireEvent.click(screen.getByRole("button", { name: "在 two 后插入" }));
  add();
  view.rerender(<LibraryMaintenance {...view.props} book={{ ...book, words: [word("one")] }} />);
  await act(async () => finish(word("new")));
  expect(view.save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("锚点");
});
it.each(["start", "end", "before", "after"] as const)("saves %s order through the searchable insertion selector", async position => {
  const view = setup();
  fireEvent.change(screen.getByLabelText("插入位置"), { target: { value: position } });
  if (position === "before" || position === "after") {
    fireEvent.change(screen.getByLabelText("搜索参考单词"), { target: { value: "two" } });
    expect(screen.queryByRole("option", { name: "one · one" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("参考单词"), { target: { value: "two" } });
  }
  await act(async () => add());
  const expected = position === "start" ? ["new", "one", "two"] : position === "before" ? ["one", "new", "two"] : ["one", "two", "new"];
  expect(view.save.mock.calls[0][0].words.map(w => w.spelling)).toEqual(expected);
});
it("jumps to and highlights the saved word and marks AI provenance", async () => {
  const view = setup(vi.fn(async () => ({ ...word("new"), sentences: [{ textEn: "New.", textZh: "新。", source: "ai" }] })), { ...book, words: Array.from({ length: 31 }, (_, i) => word(`word${i}`)) });
  fireEvent.change(screen.getByLabelText("搜索单词"), { target: { value: "word0" } });
  await act(async () => add());
  view.rerender(<LibraryMaintenance {...view.props} book={view.save.mock.calls[0][0]} />);
  expect(screen.getByLabelText("搜索单词")).toHaveValue("");
  expect(screen.getByRole("button", { name: "修改 new" }).closest("li")).toHaveAttribute("aria-current", "true");
  expect(screen.getByText(/AI 生成/)).toBeInTheDocument();
});
it("retains failed input and offers AI settings", async () => {
  const view = setup(vi.fn(async () => { throw new Error("请配置 AI"); }));
  await act(async () => add());
  expect(screen.getByRole("alert")).toHaveTextContent("请配置 AI");
  expect(screen.getByLabelText("英文单词", { exact: true })).toHaveValue("new");
  fireEvent.click(screen.getByRole("button", { name: "打开 AI 设置" }));
  expect(view.props.openSettings).toHaveBeenCalledOnce();
});
