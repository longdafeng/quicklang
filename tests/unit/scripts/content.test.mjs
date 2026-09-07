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
