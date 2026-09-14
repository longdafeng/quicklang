import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
test('doctor explains how to recover when Cargo is missing', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'quicklang-missing-cargo-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'bin'));
    copyFileSync('scripts/tasks.mjs', join(root, 'scripts/tasks.mjs'));
    // Node accepts --version too, so no real npm or Rust installation is needed.
    symlinkSync(process.execPath, join(root, 'bin/npm'));
    const result = spawnSync(process.execPath, [join(root, 'scripts/tasks.mjs'), 'doctor'], {
      encoding: 'utf8', env: { ...process.env, PATH: join(root, 'bin') },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Required command not found: cargo/);
    assert.match(result.stderr, /Rust 1\.93\.1/);
    assert.match(result.stderr, /README\.md/);
    assert.doesNotMatch(result.stderr, /spawnSync cargo ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
