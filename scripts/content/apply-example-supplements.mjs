import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";


const normalize = text => text.normalize("NFKC").toLowerCase();
export function readSupplements() {
  const sources = ["ink-spelling-corrections.json", "ink-examples-authored.tsv"];
  const files = sources.map(name => {
    const bytes = readFileSync(fileURLToPath(new URL(`../../src/content/supplements/${name}`, import.meta.url)));
    return { name, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const corrections = JSON.parse(files[0].bytes);
  const entries = new Map();
  const authored = new Set();
  for (const line of files[1].bytes.toString("utf8").trim().split("\n")) {
    const [word, textEn, textZh, extra] = line.split("\t");
    if (!word || !textEn || !textZh || extra || authored.has(normalize(word))) throw new Error(`CONTENT_INVALID: malformed or duplicate supplement: ${word}`);
    const spelling = corrections[word] ?? word;
    if (!normalize(textEn).includes(normalize(spelling)) || !/[\u3400-\u9fff]/u.test(textZh) || textEn.split(/\s+/).length < 4)
      throw new Error(`CONTENT_INVALID: invalid bilingual example: ${word}`);
    authored.add(normalize(word));
    entries.set(normalize(word), { method: "ai-authored", correctedSpelling: corrections[word],
      sentences: [{ textEn, textZh, source: "quicklang-ai-authored" }] });
  }
  return { entries, files: files.map(({ name, sha256 }) => ({ path: `src/content/supplements/${name}`, sha256 })) };
}
export function applySupplements(book, supplements, dictionary = new Map()) {
  return { ...book, entries: book.entries.map(entry => {
    if (entry.sentences.length) return entry;
    const supplement = supplements.get(entry.normalized_spelling);
    if (!supplement) return entry;
    const sentences = supplement.sentences;
    const corrected = supplement.correctedSpelling ? dictionary.get(normalize(supplement.correctedSpelling)) : undefined;
    if (!sentences?.length || sentences.some(s => !s.textEn?.trim() || !s.textZh?.trim() || !s.source?.trim()))
      throw new Error(`CONTENT_INVALID: invalid supplement: ${entry.spelling}`);
    return { ...entry,
      ...(supplement.correctedSpelling ? { original_spelling: entry.spelling, spelling: supplement.correctedSpelling,
        normalized_spelling: normalize(supplement.correctedSpelling),
        original_meaning: entry.meaning,
        ...(corrected?.translations?.length ? { meaning: corrected.translations.join("；"), translations: corrected.translations } : {}),
        phoneticUs: corrected?.phoneticUs ?? "", phoneticUk: corrected?.phoneticUk ?? "" } : {}),
      sentences, example: sentences[0].textEn, exampleTranslation: sentences[0].textZh,
      exampleMethod: supplement.method, contentStatus: { ...entry.contentStatus, examples: "available" },
    };
  }) };
}
