import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PhraseCards } from "../../../src/ui/src/features/listening/PhraseCards";
import { newMaterial } from "../../../src/ui/src/features/listening/model";
const material = { ...newMaterial("Lesson", "audio/mpeg"), cues: [{ start: 0, end: 1, text: "Keep practicing every day." }] };
afterEach(cleanup);
it("validates phrase context, trims inputs and prevents duplicate bookmarks", async () => {
  const save = vi.fn(); const view = render(<PhraseCards material={material} disabled={false} save={save} play={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("收藏单词或意群"), { target: { value: "unrelated" } }); await act(async () => { fireEvent.click(screen.getByText("保存到语境闪卡")); });
  expect(screen.getByRole("alert")).toHaveTextContent("当前片段"); expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("收藏单词或意群"), { target: { value: " Keep practicing " } }); fireEvent.change(screen.getByLabelText("释义或笔记"), { target: { value: " 坚持练习 " } }); await act(async () => { fireEvent.click(screen.getByText("保存到语境闪卡")); });
  const phrases = [{ text: "Keep practicing", meaning: "坚持练习", sentence: 0 }]; expect(save).toHaveBeenCalledWith(phrases);
  view.rerender(<PhraseCards material={{ ...material, phrases }} disabled={false} save={save} play={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("收藏单词或意群"), { target: { value: "KEEP PRACTICING" } }); await act(async () => { fireEvent.click(screen.getByText("保存到语境闪卡")); }); expect(screen.getByRole("alert")).toHaveTextContent("已经收藏"); expect(save).toHaveBeenCalledTimes(1);
});
it("plays context, reveals and hides meanings, cycles and removes cards", () => {
  const save = vi.fn(), play = vi.fn(); const phrases = [{ text: "Keep", meaning: "保持", sentence: 0 }, { text: "day", meaning: "", sentence: 0 }];
  render(<PhraseCards material={{ ...material, phrases }} disabled={false} save={save} play={play} />);
  fireEvent.click(screen.getByText("听原句")); expect(play).toHaveBeenCalledWith(0);
  fireEvent.click(screen.getByText("显示释义和原句")); expect(screen.getByText("保持")).toBeInTheDocument();
  fireEvent.click(screen.getByText("隐藏释义和原句")); expect(screen.queryByText("保持")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("下一张词汇")); fireEvent.click(screen.getByText("显示释义和原句")); expect(screen.getByText(/未填写释义/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("取消词汇收藏")); expect(save).toHaveBeenCalledWith([phrases[0]]);
});
it("disables mutation while saving and when the bookmark limit is reached", () => {
  const phrases = Array.from({ length: 500 }, () => ({ text: "day", meaning: "", sentence: 0 }));
  render(<PhraseCards material={{ ...material, phrases }} disabled={true} save={vi.fn()} play={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("收藏单词或意群"), { target: { value: "Keep" } }); expect(screen.getByText("保存到语境闪卡")).toBeDisabled(); expect(screen.getByText("取消词汇收藏")).toBeDisabled();
});
it("retains phrase drafts when persistence fails", async () => {
  const save = vi.fn().mockResolvedValue(false); render(<PhraseCards material={material} disabled={false} save={save} play={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("收藏单词或意群"), { target: { value: "Keep" } }); fireEvent.change(screen.getByLabelText("释义或笔记"), { target: { value: "保持" } });
  await act(async () => { fireEvent.click(screen.getByText("保存到语境闪卡")); });
  expect(screen.getByLabelText("收藏单词或意群")).toHaveValue("Keep"); expect(screen.getByLabelText("释义或笔记")).toHaveValue("保持");
});
