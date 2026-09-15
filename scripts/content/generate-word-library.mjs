#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const unique = values => [...new Set(values.filter(v => typeof v === 'string' && v.trim()))];
function spellingKey(value) {
  if (typeof value !== 'string') throw new Error('Invalid spelling');
  const key = value.normalize('NFKC').trim();
  if (!key || [...key].length > 256 || /[\u0000-\u001f\u007f]/u.test(key)) throw new Error('Invalid spelling: ' + value);
  return key; // Case is deliberately preserved.
}
export function convertLibrary(books, source) {
  const grouped = new Map(), wordbooks = [], mappings = [], bookIds = new Set();
  for (const book of books) {
    if (!book.id || bookIds.has(book.id) || !book.title?.trim() || !Array.isArray(book.entries)) throw new Error('Invalid/duplicate book');
    bookIds.add(book.id);
    const words = [], positions = new Map();
    for (const [index, entry] of book.entries.entries()) {
      const spelling = spellingKey(entry.spelling);
      if (!positions.has(spelling)) { positions.set(spelling, words.length); words.push(spelling); }
      mappings.push({ book_id: book.id, old_id: entry.id, old_index: index, chapter: entry.chapter,
        spelling, new_index: positions.get(spelling), original_spelling: entry.original_spelling ?? entry.spelling });
      if (!grouped.has(spelling)) grouped.set(spelling, []);
      grouped.get(spelling).push(entry);
    }
    wordbooks.push({ id: book.id, title: book.title, words });
  }
  const conflicts = [];
  const words = [...grouped].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([spelling, entries]) => {
    const meanings = unique(entries.flatMap(e => e.translations?.length ? e.translations : [e.meaning]));
    const sentences = new Map();
    for (const e of entries) for (const sentence of e.sentences ?? []) {
      if (!sentence.textEn?.trim() || !sentence.textZh?.trim()) throw new Error('Incomplete sentence: ' + spelling);
      const item = { textEn: sentence.textEn, textZh: sentence.textZh, source: sentence.source ?? 'ink-learner',
        license: sentence.license ?? source.license, generated: sentence.source === 'quicklang-ai-authored' };
      sentences.set(JSON.stringify(item), item);
    }
    const ordered = [...sentences.values()].sort((a, b) => Number(a.generated) - Number(b.generated));
    if (!meanings.length || !ordered.length) throw new Error('Incomplete offline word: ' + spelling);
    const us = unique(entries.map(e => e.phoneticUs)), uk = unique(entries.map(e => e.phoneticUk));
    const originalSpellings = unique(entries.map(e => e.original_spelling));
    const originalMeanings = unique(entries.map(e => e.original_meaning));
    const variants = { phonetic_us: us, phonetic_uk: uk, original_spelling: originalSpellings };
    if (Object.values(variants).some(v => v.length > 1)) conflicts.push({ spelling, ...variants });
    const [main, ...extra] = ordered;
    return { spelling, language: 'en', meaning: meanings.join('\n'), phonetic_us: us[0] ?? null, phonetic_uk: uk[0] ?? null,
      example: main.textEn, example_translation: main.textZh, example_source: main.source,
      example_license: main.license, example_generated: main.generated, extra_examples: extra.length ? extra : null,
      definition_source: unique(entries.map(e => e.definitionSource)).join('; ') || null,
      source_url: source.source_url, source_revision: source.source_revision, license_spdx: source.license,
      attribution: 'Ink-Learner / KyleBing/english-vocabulary; CC BY-SA 4.0. See bundled ATTRIBUTION.md and LICENSE.' +
        (Object.values(variants).some(v => v.length > 1) ? '\nSource variants: ' + JSON.stringify(variants) : ''),
      original_spelling: originalSpellings[0] ?? null, original_meaning: originalMeanings.join('\n') || null,
      user_modified: false, version: 1, created_at: 0, updated_at: 0 };
  });
  return { words, wordbooks, mappings, conflicts };
}
export function generateLibrary(input = join(root, 'src/mac_ui/public/content/ink'), output = join(root, 'build/content/word-library')) {
  const catalog = JSON.parse(readFileSync(join(input, 'catalog.json'), 'utf8'));
  if (catalog.length !== 11) throw new Error('Expected all 11 Ink wordbooks');
  const inputs = [], books = catalog.map(item => {
    if (!/^ink-[a-z0-9-]+$/.test(item.id)) throw new Error('Invalid catalog path');
    const bytes = readFileSync(join(input, item.id + '.json'));
    inputs.push({ file: item.id + '.json', sha256: hash(bytes) });
    const book = JSON.parse(bytes);
    if (book.id !== item.id || book.entries.length !== item.count) throw new Error('Catalog mismatch');
    return book;
  });
  const source = JSON.parse(readFileSync(join(input, 'manifest.json'), 'utf8'));
  const data = convertLibrary(books, source);
  mkdirSync(output, { recursive: true });
  const files = {};
  for (const [name, rows] of [['words.jsonl', data.words], ['wordbooks.jsonl', data.wordbooks], ['legacy-map.jsonl', data.mappings], ['merge-conflicts.jsonl', data.conflicts]]) {
    const bytes = rows.map(row => JSON.stringify(row) + '\n').join('');
    writeFileSync(join(output, name), bytes); files[name] = hash(bytes);
  }
  for (const file of ['LICENSE', 'ATTRIBUTION.md', 'manifest.json']) {
    const name = file === 'manifest.json' ? 'source-manifest.json' : file;
    copyFileSync(join(input, file), join(output, name)); files[name] = hash(readFileSync(join(output, name)));
  }
  const manifest = { schema_version: 3, format: 'quicklang-word-library-v1', files, inputs,
    words: data.words.length, wordbooks: data.wordbooks.length, source_entries: data.mappings.length,
    memberships: data.wordbooks.reduce((sum, b) => sum + b.words.length, 0),
    modifications: 'Case-preserving NFKC spelling keys; merged meanings and bilingual examples; book duplicates retain first position; source timestamps unknown (0); old IDs/chapters retained in legacy-map.jsonl.' };
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Generated ${manifest.words} words, ${manifest.wordbooks} books, ${manifest.memberships} ordered memberships in ${output}`);
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) generateLibrary();
