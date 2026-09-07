import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { Spelling } from "../../../src/ui/src/features/spelling/Spelling";
import { AutoRecite } from "../../../src/ui/src/features/auto-recite/AutoRecite";
import { Flashcard } from "../../../src/ui/src/features/flashcard/Flashcard";
const words = [{ id: "1", spelling: "word", meaning: "单词" }, { id: "2", spelling: "next", meaning: "下一个" }];
afterEach(() => vi.useRealTimers());
describe("study interactions", () => {
  it("requires spelling, reports error, and resets the next card", async () => {
    render(<Spelling words={words} />);
    expect(screen.getByRole("button", { name: /检查拼写/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("英文拼写"), { target: { value: "wrod" } });
    fireEvent.click(screen.getByRole("button", { name: /检查拼写/ }));
    await screen.findByText(/再记一次/);
    fireEvent.click(screen.getByRole("button", { name: /下一个单词/ }));
    expect(screen.getByLabelText("英文拼写")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "下一个" })).toBeInTheDocument();
  });
  it("supports normalized keyboard answers", async () => {
    render(<Spelling words={words} />);
    fireEvent.change(screen.getByLabelText("英文拼写"), { target: { value: "ＷＯＲＤ" } });
    fireEvent.submit(screen.getByLabelText("英文拼写").closest("form")!);
    await screen.findByText(/拼写正确/);
  });
  it("reveals a flashcard only on demand", () => {
    render(<Flashcard words={words} />);
    expect(screen.queryByText("word")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("显示答案"));
    expect(screen.getByText("word")).toBeInTheDocument();
    fireEvent.click(screen.getByText("记住"));
    expect(screen.queryByText("next")).not.toBeInTheDocument();
    expect(screen.getByText("下一个")).toBeInTheDocument();
  });
  it("pauses on blur and removes timers on unmount", async () => {
    vi.useFakeTimers();
    const view = render(<AutoRecite words={words} />);
    act(() => vi.advanceTimersByTime(350));
    expect(screen.getByLabelText("当前单词")).toHaveTextContent("w");
    fireEvent(window, new Event("blur"));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByLabelText("当前单词")).toHaveTextContent("w|");
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    act(() => vi.advanceTimersByTime(350));
    expect(screen.getByLabelText("当前单词")).toHaveTextContent("wo");
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
