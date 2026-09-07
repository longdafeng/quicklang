#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Stable 128-bit content key encoded in the ULID-compatible Crockford alphabet.
// It is a content hash, not a chronological ULID; no time ordering is implied.
function contentId(normalized) {
  let value = BigInt("0x" + createHash("sha256").update("en:" + normalized).digest("hex").slice(0, 32));
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let encoded = "";
  for (let i = 0; i < 26; i++) { encoded = alphabet[Number(value & 31n)] + encoded; value >>= 5n; }
  return encoded;
}
export function normalizeBook(book) {
  if (!book || typeof book.id !== "string" || !/^ink-[a-z0-9-]+$/.test(book.id)
    || typeof book.name !== "string" || !book.name.trim()
    || !Number.isInteger(book.chapterLength) || book.chapterLength < 1 || book.chapterLength > 1000
    || !Array.isArray(book.words) || !book.words.length) throw new Error("CONTENT_INVALID: invalid book");
  const seen = new Set();
  const entries = [];
  for (const spelling of book.words) {
    if (typeof spelling !== "string" || !spelling.trim() || spelling.length > 256)
      throw new Error("CONTENT_INVALID: invalid word");
    const normalized = spelling.normalize("NFKC").toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push({
      id: contentId(normalized),
      spelling, normalized_spelling: normalized, language: "en",
      chapter: Math.floor(entries.length / book.chapterLength) + 1, ordinal: entries.length,
    });
  }
  return { id: book.id, title: book.name, license: "CC-BY-SA-4.0", entries };
}
function main() {
  if (process.argv.includes("--help")) { console.log("INK_SOURCE=/path/to/ink-learner node scripts/content/import-ink.mjs (pinned input only)"); return; }
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const source = resolve(process.env.INK_SOURCE || join(root, "repos/ink-learner"));
  const manifest = JSON.parse(readFileSync(join(root, "src/content/manifests/ink.json"), "utf8"));
  // Validate every source before writing a single output, including license/attribution.
  const inputs = manifest.files.map(file => {
    const bytes = readFileSync(join(source, file.path));
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new Error("CONTENT_INVALID: checksum mismatch: " + file.path);
    return { file, bytes };
  });
  const books = inputs.filter(x => x.file.path.endsWith(".json")).map(x => normalizeBook(JSON.parse(x.bytes)));
  const output = join(root, "build/content/ink");
  mkdirSync(output, { recursive: true });
  for (const book of books) writeFileSync(join(output, book.id + ".json"), JSON.stringify(book, null, 2) + "\n");
  writeFileSync(join(output, "manifest.json"), JSON.stringify({ ...manifest,
    modifications: "Normalized spellings, deterministic content keys, duplicate removal and chapter assignment; no definitions or examples imported.",
    counts: books.map(book => ({ id: book.id, entries: book.entries.length })),
  }, null, 2) + "\n");
  copyFileSync(join(source, "seeds/LICENSE_ASSETS"), join(output, "LICENSE"));
  copyFileSync(join(source, "docs/reference/acknowledgments.md"), join(output, "ATTRIBUTION.md"));
  console.log("Imported " + books.length + " word lists (" + books.reduce((sum, b) => sum + b.entries.length, 0) + " entries) into build/content/ink. No database was modified.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
