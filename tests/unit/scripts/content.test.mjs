import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBook } from "../../../scripts/content/import-ink.mjs";
test("content IDs and chapters are deterministic after normalization and deduplication", () => {
  const book = { id: "ink-test", name: "Sample", chapterLength: 2, words: ["Word", "ＷＯＲＤ", "test", "third"] };
  const result = normalizeBook(book);
  assert.equal(result.entries.length, 3);
  assert.match(result.entries[0].id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.deepEqual(result.entries.map(x => x.chapter), [1, 1, 2]);
  assert.deepEqual(normalizeBook(book), result);
  assert.equal(normalizeBook({ ...book, words: ["word"] }).entries[0].id, result.entries[0].id);
});
test("content rejects malformed books and path traversal identifiers", () => {
  for (const book of [null, {}, { id: "../escape", name: "x", chapterLength: 2, words: ["x"] },
    { id: "ink-x", name: "x", chapterLength: 0, words: ["x"] },
    { id: "ink-x", name: "x", chapterLength: 2, words: [""] }]) {
    assert.throws(() => normalizeBook(book), /CONTENT_INVALID/);
  }
});

test("dictionary enrichment preserves Chinese text and source labels without inventing missing examples", async () => {
  const { enrichBook } = await import("../../../scripts/content/import-ink.mjs");
  const book = normalizeBook({ id: "ink-test", name: "Sample", chapterLength: 2, words: ["Word", "test"] });
  const dictionary = new Map([
    ["word", { translations: ["n. 单词", "n. 话语"], phoneticUs: "/wɜːrd/", sentences: [{ textEn: "Say a word.", textZh: "说一个词。", source: "tatoeba" }] }],
    ["test", { translations: ["n. 测试"] }],
  ]);
  const entries = enrichBook(book, dictionary).entries;
  assert.equal(entries[0].id, book.entries[0].id);
  assert.equal(entries[0].meaning, "n. 单词；n. 话语");
  assert.equal(entries[0].exampleTranslation, "说一个词。");
  assert.equal(entries[0].sentences[0].source, "tatoeba");
  assert.equal(entries[0].phoneticUs, "/wɜːrd/");
  assert.equal(entries[1].example, "");
  assert.equal(entries[1].contentStatus.examples, "missing");
});

test("supplements fill gaps without replacing upstream sentences or changing progress identifiers", async () => {
  const { applySupplements, readSupplements } = await import("../../../scripts/content/apply-example-supplements.mjs");
  const { enrichBook } = await import("../../../scripts/content/import-ink.mjs");
  const supplements = readSupplements();
  assert.equal(supplements.entries.size, 1775);
  const dictionary = new Map([
    ["magnate", { translations: ["巨头"], sentences: [{ textEn: "The magnate arrived early.", textZh: "那位巨头很早就到了。", source: "upstream" }] }],
    ["reservior", { translations: ["水库"] }],
    ["reservoir", { translations: ["n. 水库"], phoneticUs: "/test/" }],
  ]);
  const book = enrichBook(normalizeBook({ id: "ink-test", name: "Sample", chapterLength: 2, words: ["magnate", "reservior"] }), dictionary);
  const result = applySupplements(book, supplements.entries, dictionary);
  assert.deepEqual(result.entries[0], book.entries[0]);
  assert.equal(result.entries[1].id, book.entries[1].id);
  assert.equal(result.entries[1].ordinal, book.entries[1].ordinal);
  assert.equal(result.entries[1].original_spelling, "reservior");
  assert.equal(result.entries[1].spelling, "reservoir");
  assert.equal(result.entries[1].phoneticUs, "/test/");
  assert.equal(result.entries[1].sentences[0].source, "quicklang-ai-authored");
  assert.equal(result.entries[1].contentStatus.examples, "available");
  assert.deepEqual(applySupplements(result, supplements.entries, dictionary), result);
});
