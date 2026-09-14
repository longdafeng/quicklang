import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { verify } from '../../../scripts/bootstrap/seekdb.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'quicklang-runtime-')); const pin = join(root, '..', `${root.split('/').pop()}.pin`);
  try {
    writeFileSync(pin, '{}'); const files = {};
    for (const name of ['seekdb', 'libseekdb.dylib', 'libssl.3.dylib', 'libcrypto.3.dylib']) { writeFileSync(join(root, name), 'fixture'); files[name] = hash('fixture'); }
    const manifest = { pin_sha256: hash('{}'), files }; writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest)); run(root, pin, manifest);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(pin, { force: true }); }
}
test('offline runtime verification accepts complete pinned files', () => fixture((root, pin) => assert.doesNotThrow(() => verify(root, pin))));
test('offline runtime verification rejects changed pins and tampered bytes', () => fixture((root, pin) => {
  writeFileSync(pin, 'changed'); assert.throws(() => verify(root, pin), /pin changed/); writeFileSync(pin, '{}');
  writeFileSync(join(root, 'seekdb'), 'tampered'); assert.throws(() => verify(root, pin), /checksum mismatch/);
}));
test('offline runtime verification rejects missing manifest entries and unexpected files', () => fixture((root, pin, manifest) => {
  const original = readFileSync(join(root, 'manifest.json')); delete manifest.files['seekdb']; writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest)); assert.throws(() => verify(root, pin), /Incomplete runtime/);
  writeFileSync(join(root, 'manifest.json'), original); writeFileSync(join(root, 'extra'), 'extra'); assert.throws(() => verify(root, pin), /Unexpected runtime files/);
}));
test('offline runtime verification rejects symlinked files', () => fixture((root, pin) => {
  rmSync(join(root, 'seekdb')); symlinkSync(pin, join(root, 'seekdb')); assert.throws(() => verify(root, pin), /Unexpected symlink/);
}));
