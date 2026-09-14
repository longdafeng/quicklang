import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertLibrary } from '../../../scripts/content/generate-word-library.mjs';
const source = { source_url: 'source', source_revision: 'fixed', license: 'CC-BY-SA-4.0' };
const entry = (spelling, meaning, generated = false) => ({ id: spelling, spelling, meaning,
  translations: [meaning], chapter: 1, sentences: [{ textEn: `Example ${spelling}.`, textZh: '中文例句。', source: generated ? 'quicklang-ai-authored' : 'upstream' }] });
test('case-sensitive keys, normalization, duplicate positions and shared content merging', () => {
  const data = convertLibrary([
    { id: 'a', title: 'A', entries: [entry('US', '美国'), entry('us', '我们'), entry(' apple ', '苹果', true), entry('apple', '苹果树')] },
    { id: 'b', title: 'B', entries: [entry('ａｐｐｌｅ', '苹果')] },
  ], source);
  assert.deepEqual(data.wordbooks[0].words, ['US', 'us', 'apple']);
  assert.equal(data.words.length, 3);
  const apple = data.words.find(w => w.spelling === 'apple');
  assert.equal(apple.meaning, '苹果\n苹果树');
  assert.equal(apple.example_generated, false);
  assert.equal(apple.extra_examples.length, 2);
  assert.equal(data.mappings[3].new_index, 2);
  assert.equal(data.mappings[4].spelling, 'apple');
});
test('incomplete bilingual content and invalid keys fail before output', () => {
  const book = { id: 'a', title: 'A', entries: [entry('apple', '')] };
  assert.throws(() => convertLibrary([book], source), /Incomplete offline/);
  book.entries = [entry('a'.repeat(257), '中文')];
  assert.throws(() => convertLibrary([book], source), /Invalid spelling/);
  book.entries = [{ ...entry('word', '中文'), sentences: [{ textEn: 'English only' }] }];
  assert.throws(() => convertLibrary([book], source), /Incomplete sentence/);
});

test('correction provenance is retained in scalar fields and legacy mapping', () => {
  const corrected = { ...entry('relinquish', '放弃'), original_spelling: 'relinguish', original_meaning: '原释义' };
  const data = convertLibrary([{ id: 'a', title: 'A', entries: [corrected] }], source);
  assert.equal(data.words[0].original_spelling, 'relinguish');
  assert.equal(data.words[0].original_meaning, '原释义');
  assert.equal(data.mappings[0].original_spelling, 'relinguish');
});

test('rejects duplicate books, invalid spellings and preserves phonetic conflicts', () => {
  const book = { id: 'a', title: 'A', entries: [entry('word', '单词')] };
  assert.throws(() => convertLibrary([book, book], source), /Invalid\/duplicate book/);
  for (const spelling of [null, '', ' ', 'a\0b']) assert.throws(() => convertLibrary([{ ...book, entries: [entry(spelling, '单词')] }], source), /Invalid spelling/);
  const data = convertLibrary([{ ...book, entries: [{ ...entry('word', '词'), phoneticUs: 'a' }, { ...entry('word', '词'), phoneticUs: 'b' }] }], source);
  assert.deepEqual(data.conflicts[0].phonetic_us, ['a', 'b']); assert.match(data.words[0].attribution, /Source variants/);
});

test('writes reproducible seed manifests and verifies catalog before output', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const { createHash } = await import('node:crypto');
  const { generateLibrary } = await import('../../../scripts/content/generate-word-library.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'quicklang-library-'));
  try {
    const catalog = Array.from({ length: 11 }, (_, i) => ({ id: `ink-test-${i}`, count: 1 }));
    for (const item of catalog) writeFileSync(join(dir, `${item.id}.json`), JSON.stringify({ id: item.id, title: item.id, entries: [entry('word', '词')] }));
    writeFileSync(join(dir, 'catalog.json'), JSON.stringify(catalog)); writeFileSync(join(dir, 'manifest.json'), JSON.stringify(source));
    for (const file of ['LICENSE', 'ATTRIBUTION.md']) writeFileSync(join(dir, file), 'fixture');
    const output = join(dir, 'output'); const manifest = generateLibrary(dir, output);
    assert.equal(manifest.words, 1); assert.equal(manifest.wordbooks, 11); assert.equal(manifest.memberships, 11);
    for (const [name, hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(join(output, name))).digest('hex'), hash);
    assert.deepEqual(generateLibrary(dir, output), manifest);
    catalog[0].count = 2; writeFileSync(join(dir, 'catalog.json'), JSON.stringify(catalog));
    assert.throws(() => generateLibrary(dir, join(dir, 'bad')), /Catalog mismatch/); assert.equal(existsSync(join(dir, 'bad')), false);
    catalog[0].id = '../escape'; writeFileSync(join(dir, 'catalog.json'), JSON.stringify(catalog)); assert.throws(() => generateLibrary(dir, output), /Invalid catalog path/);
    writeFileSync(join(dir, 'catalog.json'), '[]'); assert.throws(() => generateLibrary(dir, output), /Expected all 11/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
