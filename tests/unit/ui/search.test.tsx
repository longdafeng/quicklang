import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WordSearch, type SearchBook } from "../../../src/ui/src/features/search/WordSearch";
import { loadBook } from "../../../src/ui/src/features/library/books";
vi.mock("../../../src/ui/src/features/library/books", () => ({ loadBook: vi.fn() }));
const books: SearchBook[] = [
  { id: "one", name: "第一本", bundled: false, words: [{ id: "a", spelling: "remember", meaning: "记住；回想起", example: "Remember me." }] },
  { id: "two", name: "第二本", bundled: false, words: [{ id: "b", spelling: "memory", meaning: "记忆" }] },
];
beforeEach(() => vi.mocked(loadBook).mockReset());
afterEach(cleanup);
function search(value: string) {
  fireEvent.change(screen.getByLabelText("中文或英文"), { target: { value } });
  fireEvent.submit(screen.getByRole("search"));
}
it("searches Chinese meanings and normalized English, and filters to the current book", async () => {
  render(<WordSearch books={books} currentBookId="one" />);
  search("记");
  expect(await screen.findByText("“记” · 找到 2 条")).toBeInTheDocument();
  expect(screen.getByText("Remember me.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("查询范围"), { target: { value: "current" } });
  expect(screen.getByText("“记” · 找到 1 条")).toBeInTheDocument();
  search("  ＲＥＭＥＭＢＥＲ  ");
  expect(screen.getByRole("heading", { name: "remember" })).toBeInTheDocument();
  expect(screen.getByText("所属词书：第一本")).toBeInTheDocument();
  search("不存在的释义");
  expect(screen.getByText(/没有找到对应单词/)).toBeInTheDocument();
});
it("uses local edited content instead of loading the bundled original", async () => {
  render(<WordSearch books={[{ ...books[0], id: "ink-cet4" }]} currentBookId="ink-cet4" />);
  search("记住");
  expect(await screen.findByText("“记住” · 找到 1 条")).toBeInTheDocument();
  expect(loadBook).not.toHaveBeenCalled();
});
it("keeps local results on a load failure and retries the bundled book", async () => {
  vi.mocked(loadBook).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([{ id: "c", spelling: "recall", meaning: "回想起" }]);
  render(<WordSearch books={[...books, { id: "ink", name: "内置词书", words: [], bundled: true }]} currentBookId="one" />);
  search("回想");
  expect(await screen.findByRole("alert")).toHaveTextContent("内置词书");
  expect(screen.getByRole("heading", { name: "remember" })).toBeInTheDocument();
  fireEvent.click(screen.getByText("重试加载"));
  expect(await screen.findByRole("heading", { name: "recall" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
