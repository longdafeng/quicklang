#!/usr/bin/env node
import { readSupplements, applySupplements } from "./apply-example-supplements.mjs";
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
export function enrichBook(book, dictionary) {
  return { ...book, entries: book.entries.map(entry => {
    const detail = dictionary.get(entry.normalized_spelling);
    const translations = (detail?.translations ?? []).filter(text => typeof text === "string" && text.trim());
    const sentences = (detail?.sentences ?? []).filter(sentence =>
      typeof sentence.textEn === "string" && sentence.textEn.trim() &&
      typeof sentence.textZh === "string" && sentence.textZh.trim()
    ).map(sentence => ({ textEn: sentence.textEn, textZh: sentence.textZh, source: sentence.source ?? "ink-learner" }));
    return { ...entry, meaning: translations.join("；"), translations,
      example: sentences[0]?.textEn ?? "", exampleTranslation: sentences[0]?.textZh ?? "", sentences,
      phoneticUs: detail?.phoneticUs ?? "", phoneticUk: detail?.phoneticUk ?? "",
      definitionSource: "ink-learner / KyleBing/english-vocabulary",
      contentStatus: { meaning: translations.length ? "available" : "missing", examples: sentences.length ? "available" : "missing" },
    };
  }) };
}
function main() {
  const supplements = readSupplements();
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
  const dictionary = new Map();
  for (const input of inputs.filter(x => x.file.path.startsWith("seeds/dictionary/shards/"))) {
    for (const [word, detail] of Object.entries(JSON.parse(input.bytes))) dictionary.set(word.normalize("NFKC").toLowerCase(), detail);
  }
  if (!dictionary.size) throw new Error("CONTENT_INVALID: missing dictionary");
  const books = inputs.filter(x => x.file.path.startsWith("seeds/ink/") && x.file.path.endsWith(".json"))
    .map(x => applySupplements(enrichBook(normalizeBook(JSON.parse(x.bytes)), dictionary), supplements.entries, dictionary));
  const coverage = books.map(book => ({ id: book.id, entries: book.entries.length,
    generatedExamples: book.entries.filter(entry => entry.exampleMethod === "ai-authored").length,
    withMeaning: book.entries.filter(entry => entry.meaning).length,
    withExamples: book.entries.filter(entry => entry.sentences.length).length,
    missingMeaning: book.entries.filter(entry => !entry.meaning).map(entry => entry.spelling),
    missingExamples: book.entries.filter(entry => !entry.sentences.length).map(entry => entry.spelling),
  }));
  if (coverage.some(book => book.withMeaning !== book.entries || book.withExamples !== book.entries))
    throw new Error("CONTENT_INCOMPLETE: provide bilingual supplements for every missing entry before importing");
  const output = join(root, "build/content/ink");
  mkdirSync(output, { recursive: true });
  for (const book of books) writeFileSync(join(output, book.id + ".json"), JSON.stringify(book, null, 2) + "\n");
  writeFileSync(join(output, "manifest.json"), JSON.stringify({ ...manifest,
    modifications: "Normalized spellings and dictionary lookup keys, deterministic content keys, duplicate removal and chapter assignment. Joined Chinese definitions, phonetics and bilingual sentences from pinned Ink dictionary shards. Preserved upstream examples. Filled gaps with original AI-authored QuickLang bilingual sentences labelled quicklang-ai-authored. Corrected documented spelling errors while preserving content IDs.",
    supplements: supplements.files,
    counts: books.map(book => ({ id: book.id, entries: book.entries.length })),
  }, null, 2) + "\n");
  writeFileSync(join(output, "coverage.json"), JSON.stringify(coverage, null, 2) + "\n");
  copyFileSync(join(source, "seeds/LICENSE_ASSETS"), join(output, "LICENSE"));
  writeFileSync(join(output, "ATTRIBUTION.md"), readFileSync(join(source, "docs/reference/acknowledgments.md"), "utf8") + "\n\n## QuickLang example supplements\n\nMissing examples were filled with AI-authored QuickLang examples (`quicklang-ai-authored`). Existing upstream examples are unchanged. Supplementary examples are distributed under CC BY-SA 4.0. AI-authored examples are not quotations from the upstream dictionary. Spelling corrections retain the original spelling and stable content ID. See the bundled manifest for input checksums.\n");
  // Ship separately licensed, verified assets with both browser and desktop builds.
  const bundled = join(root, "src/mac_ui/public/content/ink");
  mkdirSync(bundled, { recursive: true });
  for (const book of books) writeFileSync(join(bundled, book.id + ".json"), JSON.stringify(book) + "\n");
  writeFileSync(join(bundled, "catalog.json"), JSON.stringify(books.map((book, index) => ({ id: book.id, title: book.title, count: book.entries.length,
    withMeaning: coverage[index].withMeaning, withExamples: coverage[index].withExamples })), null, 2) + "\n");
  for (const file of ["manifest.json", "coverage.json", "LICENSE", "ATTRIBUTION.md"]) copyFileSync(join(output, file), join(bundled, file));
  console.log("Imported " + books.length + " word lists (" + books.reduce((sum, b) => sum + b.entries.length, 0) + " entries) into build/content/ink. No database was modified.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
