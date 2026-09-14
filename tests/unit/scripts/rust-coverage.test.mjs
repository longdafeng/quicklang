import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testLines, summarize } from '../../../scripts/testing/rust-coverage.mjs';
test('excludes inline tests while retaining production code after test modules', () => {
  const source = 'fn production() {}\n#[cfg(test)]\nmod tests {\n    fn test() {}\n}\nfn later() {}';
  assert.deepEqual([...testLines(source)], [2,3,4,5]);
  const result = summarize('SF:sample.rs\nDA:1,1\nDA:4,10\nDA:6,0\nend_of_record', () => source);
  assert.equal(result.total, 2); assert.equal(result.covered, 1); assert.equal(result.percent, 50);
});
test('handles conditional test modules, duplicate counts, empty files and malformed reports', () => {
  assert.deepEqual([...testLines('#[cfg(all(test, unix))]\nmod tests {\n}\n')], [1,2,3]);
  assert.throws(() => testLines('#[cfg(test)]\nfn unsupported() {}'), /Unsupported/);
  assert.throws(() => testLines('#[cfg(test)]\nmod tests {'), /Unterminated/);
  assert.throws(() => summarize(''), /No source coverage/);
  const result = summarize('SF:a\nDA:1,0\nDA:1,2\nend_of_record\nSF:b\nend_of_record', () => 'fn f() {}');
  assert.equal(result.total, 1); assert.equal(result.covered, 1); assert.equal(result.files[1].percent,100);
});
