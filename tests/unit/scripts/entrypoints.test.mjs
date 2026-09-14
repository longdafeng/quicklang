import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readSupplements, applySupplements } from '../../../scripts/content/apply-example-supplements.mjs';
for (const path of ['scripts/tasks.mjs', 'scripts/bootstrap/seekdb.mjs', 'scripts/compliance/check.mjs', 'scripts/content/import-ink.mjs']) {
  test(`${path} exposes help without initialization`, () => {
    const result = spawnSync(process.execPath, [path, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.ok(result.stdout.trim());
  });
}
test('task runner rejects unknown commands', () => {
  const result = spawnSync(process.execPath, ['scripts/tasks.mjs', 'invalid-target'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Unknown target/);
});
test('supplement source checksums and correction metadata are loaded', () => {
  const result = readSupplements(); assert.ok(result.entries.size > 0); assert.equal(result.files.length, 2);
  for (const file of result.files) assert.match(file.sha256, /^[0-9a-f]{64}$/);
});
test('supplements preserve existing examples, skip missing keys and reject partial examples', () => {
  const existing = { spelling: 'word', normalized_spelling: 'word', sentences: [{ textEn: 'Original', textZh: '原文' }] };
  assert.equal(applySupplements({ entries: [existing] }, new Map()).entries[0], existing);
  const empty = { ...existing, sentences: [] }; assert.equal(applySupplements({ entries: [empty] }, new Map()).entries[0], empty);
  for (const sentences of [[], [{ textEn: 'English', textZh: '' }], [{ textEn: 'English', textZh: '中文' }]]) {
    assert.throws(() => applySupplements({ entries: [empty] }, new Map([['word', { sentences }]])), /invalid supplement/);
  }
});
