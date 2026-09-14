import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runCommand } from './process.mjs';
import { networkEnvironment } from './network.mjs';

/** Compute the digest used to validate complete cached artifacts. */
export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Fetch a URL with bounded retries and optional byte ranges. */
async function curl(url, path, env, { range, head = false, allowHttp = false } = {}) {
  const args = ['--proto', allowHttp ? '=http,https' : '=https', '--proto-redir', allowHttp ? '=http,https' : '=https', '-fLsS', '--connect-timeout', '10', '--max-time', head ? '30' : '180', '--speed-limit', '16384', '--speed-time', '20', '--retry', '2'];
  if (head) args.push('-I');
  else args.push('-o', path);
  if (range) args.push('--range', range);
  args.push(url);
  return runCommand('curl', args, { env, quiet: true });
}

/** Download bounded concurrent ranges, checking exact lengths before assembling an artifact. */
async function rangedDownload(url, partial, digest, size, env, allowHttp) {
  const chunkSize = 1024 * 1024;
  const directory = partial + '.parts';
  const metadata = JSON.stringify({ url, digest, size, chunkSize });
  mkdirSync(directory, { recursive: true });
  const marker = join(directory, 'metadata.json');
  if (existsSync(marker) && readFileSync(marker, 'utf8') !== metadata) rmSync(directory, { recursive: true });
  mkdirSync(directory, { recursive: true });
  writeFileSync(marker, metadata);
  const count = Math.ceil(size / chunkSize);
  let next = 0;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(8, count) }, async () => {
    while (next < count) {
      const index = next++;
      const start = index * chunkSize, end = Math.min(size, start + chunkSize) - 1;
      const path = join(directory, String(index));
      if (!existsSync(path) || readFileSync(path).length !== end - start + 1) {
        await curl(url, path, env, { range: `${start}-${end}`, allowHttp });
        if (readFileSync(path).length !== end - start + 1) throw new Error('Server did not honor the requested byte range');
      }
      console.log(`Download ${index + 1}/${count}: ${new URL(url).pathname.split('/').pop()}`);
    }
  }));
  const failed = workers.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  writeFileSync(partial, Buffer.concat(Array.from({ length: count }, (_, index) => readFileSync(join(directory, String(index))))));
}

/** Download into a staging file and publish only after SHA-256 verification; recover bad caches automatically. */
export async function downloadVerified(url, path, digest, { env = process.env, parallelThreshold = 8 * 1024 * 1024, allowHttp = false } = {}) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('A SHA-256 digest is required');
  if (existsSync(path)) {
    if (sha256(path) === digest) return;
    const backup = `${path}.invalid-${Date.now()}`;
    renameSync(path, backup);
    console.warn(`Invalid cached download preserved at ${backup}; downloading again.`);
  }
  mkdirSync(dirname(path), { recursive: true });
  const partial = path + '.partial';
  const routes = [env];
  if ((env.QUICKLANG_NETWORK || 'auto') === 'auto') {
    routes.push(env.NO_PROXY === '*' || env.no_proxy === '*'
      ? { ...env, NO_PROXY: '', no_proxy: '' } : networkEnvironment(env, 'direct'));
  }
  let failure;
  for (const route of routes) {
    try {
      let size = 0;
      try {
        const { stdout } = await curl(url, partial, route, { head: true, allowHttp });
        const finalHeaders = stdout.trim().split(/\r?\n\r?\n/).at(-1);
        size = Number(finalHeaders.match(/^content-length:\s*(\d+)/im)?.[1] || 0);
      } catch { /* A server without HEAD support can still provide a complete GET response. */ }
      if (size >= parallelThreshold) {
        // Wait for every worker before any fallback can reuse the same staging files.
        try { await rangedDownload(url, partial, digest, size, route, allowHttp); }
        catch (error) {
          console.warn(`Range download unavailable: ${error.message}; trying a single stream.`);
          await curl(url, partial, route, { allowHttp });
        }
      } else await curl(url, partial, route, { allowHttp });
      if (sha256(partial) !== digest) {
        rmSync(partial + '.parts', { recursive: true, force: true });
        throw new Error(`Checksum mismatch for ${url}`);
      }
      renameSync(partial, path);
      rmSync(partial + '.parts', { recursive: true, force: true });
      console.log(`Verified download: ${path}`);
      return;
    } catch (error) {
      failure = error;
      console.warn(`Download attempt failed: ${error.message}`);
    }
  }
  throw failure;
}
