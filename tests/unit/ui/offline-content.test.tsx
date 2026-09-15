import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { books, loadBook } from "../../../src/mac_ui/src/features/library/books";
import { WordCard } from "../../../src/mac_ui/src/features/study/shared";

afterEach(() => vi.unstubAllGlobals());
it("loads all 11 books with definitions and available bilingual examples using bundled files only", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    expect(url).toMatch(/^\/content\/ink\/ink-[a-z0-9-]+\.json$/);
    return { ok: true, json: async () => JSON.parse(readFileSync(`src/mac_ui/public${url}`, "utf8")) };
  }));
  expect(books).toHaveLength(11);
  for (const book of books) {
    const words = await loadBook(book.id, new AbortController().signal);
    expect(words).toHaveLength(book.count);
    expect(words.every(word => word.meaning.trim())).toBe(true);
    expect(words.filter(word => word.example && word.exampleTranslation)).toHaveLength(book.withExamples);
    expect(words.every(word => word.sentences?.every(sentence => sentence.source && sentence.textEn && sentence.textZh))).toBe(true);
  }
});
it("renders a real imported definition and bilingual example", async () => {
  const data = JSON.parse(readFileSync("src/mac_ui/public/content/ink/ink-cet4.json", "utf8"));
  const word = data.entries.find((word: { spelling: string }) => word.spelling === "abandon");
  expect(word.meaning).toContain("放弃");
  render(<WordCard word={word} />);
  expect(screen.getByText(word.meaning)).toBeInTheDocument();
  expect(screen.getByText(word.example)).toBeInTheDocument();
  expect(screen.getByText(word.exampleTranslation)).toBeInTheDocument();
});
it("does not silently accept an old spelling-only asset", async () => {
  const data = JSON.parse(readFileSync("src/mac_ui/public/content/ink/ink-cet4.json", "utf8"));
  data.entries[0].meaning = "";
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => data })));
  await expect(loadBook("ink-cet4", new AbortController().signal)).rejects.toThrow("词书内容不完整");
});

it("has no remaining missing examples and labels generated content in study", () => {
  const coverage = JSON.parse(readFileSync("src/mac_ui/public/content/ink/coverage.json", "utf8"));
  expect(coverage.every((book: any) => book.entries === book.withExamples && !book.missingExamples.length)).toBe(true);
  expect(coverage.reduce((sum: number, book: any) => sum + book.generatedExamples, 0)).toBe(1943);
  const data = JSON.parse(readFileSync("src/mac_ui/public/content/ink/ink-gre.json", "utf8"));
  const word = data.entries.find((word: any) => word.sentences[0].source === "quicklang-ai-authored");
  render(<WordCard word={word} />);
  expect(screen.getByText("AI 补充例句")).toBeInTheDocument();
  expect(screen.getByText(word.example)).toBeInTheDocument();
  expect(screen.getByText(word.exampleTranslation)).toBeInTheDocument();
});
