import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { downloadVerified } from '../../../scripts/bootstrap/download.mjs';
import { acquireInitLock } from '../../../scripts/bootstrap/init.mjs';
import { readToolchain } from '../../../scripts/bootstrap/toolchain.mjs';
import { networkEnvironment } from '../../../scripts/bootstrap/network.mjs';
import { runCommand } from '../../../scripts/bootstrap/process.mjs';

/** Serve local deterministic artifacts and remove all test resources on completion. */
async function artifactFixture(callback, { ignoreRanges = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'quicklang-download-'));
  const body = Buffer.alloc(2 * 1024 * 1024 + 17, 'fixture');
  const digest = createHash('sha256').update(body).digest('hex');
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, range: request.headers.range });
    let start = 0, end = body.length - 1;
    if (request.headers.range && !ignoreRanges) {
      [start, end] = request.headers.range.slice(6).split('-').map(Number);
      response.statusCode = 206;
      response.setHeader('Content-Range', `bytes ${start}-${end}/${body.length}`);
    }
    response.setHeader('Content-Length', end - start + 1);
    response.end(request.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback({ directory, body, digest, requests, url: `http://127.0.0.1:${server.address().port}/artifact`,
      options: { allowHttp: true, parallelThreshold: 1, env: { ...process.env, QUICKLANG_NETWORK: 'direct', NO_PROXY: '*', no_proxy: '*' } } });
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('downloads ranges, repairs bad cache, and reuses only verified artifacts', () => artifactFixture(async ({ directory, body, digest, requests, url, options }) => {
  const path = join(directory, 'artifact');
  writeFileSync(path, 'interrupted download');
  await downloadVerified(url, path, digest, options);
  assert.deepEqual(readFileSync(path), body);
  assert.ok(requests.some(request => request.range));
  assert.ok(readdirSync(directory).some(name => name.startsWith('artifact.invalid-')));
  const count = requests.length;
  await downloadVerified(url, path, digest, options);
  assert.equal(requests.length, count);
  assert.equal(existsSync(path + '.partial'), false);
}));

test('falls back to a complete GET when byte ranges are ignored', () => artifactFixture(async ({ directory, body, digest, url, options, requests }) => {
  const path = join(directory, 'artifact');
  await downloadVerified(url, path, digest, options);
  assert.deepEqual(readFileSync(path), body);
  assert.ok(requests.some(request => request.method === 'GET' && !request.range));
}, { ignoreRanges: true }));

test('never publishes a checksum mismatch', () => artifactFixture(async ({ directory, url, options }) => {
  const path = join(directory, 'artifact');
  await assert.rejects(downloadVerified(url, path, '0'.repeat(64), options), /Checksum mismatch/);
  assert.equal(existsSync(path), false);
}));

test('initialization lock rejects concurrent runs and releases cleanly', () => {
  const root = mkdtempSync(join(tmpdir(), 'quicklang-lock-'));
  try {
    const release = acquireInitLock(root);
    assert.throws(() => acquireInitLock(root), /already running/);
    release();
    acquireInitLock(root)();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('toolchain is derived from the repository pin', () => {
  const root = mkdtempSync(join(tmpdir(), 'quicklang-toolchain-'));
  try {
    writeFileSync(join(root, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.93.1"\ncomponents = ["rustfmt", "clippy"]\n');
    assert.deepEqual(readToolchain(root), { version: '1.93.1', components: ['rustfmt', 'clippy'] });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('direct network selection is isolated from the caller environment', () => {
  const env = { HTTPS_PROXY: 'http://example.invalid', NO_PROXY: 'localhost' };
  assert.equal(networkEnvironment(env, 'direct').NO_PROXY, '*');
  assert.equal(env.NO_PROXY, 'localhost');
  assert.deepEqual(networkEnvironment(env, 'proxy'), env);
});

test('read-only launch retry recovers SIGKILL but normal failures are not retried', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quicklang-launch-'));
  try {
    const marker = join(root, 'marker');
    const script = `const fs = require('fs'); if (!fs.existsSync(process.argv[1])) { fs.writeFileSync(process.argv[1], 'created'); process.kill(process.pid, 'SIGKILL'); }`;
    await runCommand(process.execPath, ['-e', script, marker], { quiet: true, retryKilled: true });
    await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(7)'], { quiet: true, retryKilled: true }), /failed \(7\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('shell entrypoint is usable outside the repository and exposes help', { skip: process.platform === 'win32' }, () => {
  const script = join(process.cwd(), 'scripts/init.sh');
  const result = spawnSync('/bin/sh', [script, '--help'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /QUICKLANG_NETWORK/);
});
