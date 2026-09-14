import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fetchDependencies } from './network.mjs';
import { runCommand } from './process.mjs';

/** Use the pinned npm version, installing a local copy when the system version differs. */
export async function ensureNpm(root, env) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const version = manifest.packageManager?.match(/^npm@([\d.]+)$/)?.[1];
  if (!version) throw new Error('package.json must pin packageManager to an exact npm version');
  const options = { cwd: root, env, quiet: true };
  const current = await runCommand('npm', ['--version'], options);
  if (current.stdout.trim() === version) return env;
  const prefix = join(root, 'deps/cache/npm');
  const cli = join(prefix, 'node_modules/npm/bin/npm-cli.js');
  const localManifest = join(prefix, 'node_modules/npm/package.json');
  if (!existsSync(cli) || !existsSync(join(prefix, 'node_modules/.bin/npm')) || !existsSync(localManifest) || JSON.parse(readFileSync(localManifest, 'utf8')).version !== version) {
    console.log(`Preparing repository-local npm ${version} (system npm is ${current.stdout.trim()}).`);
    mkdirSync(prefix, { recursive: true });
    writeFileSync(join(prefix, 'package.json'), JSON.stringify({ name: 'quicklang-npm-bootstrap', private: true }));
    // The exact tarball avoids fetching npm's very large all-version metadata document.
    const archive = `https://registry.npmjs.org/npm/-/npm-${version}.tgz`;
    await fetchDependencies('npm', ['install', '--prefix', prefix, '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund', '--no-save', '--fetch-timeout=60000', archive], { cwd: prefix, env });
  }
  const localEnv = { ...env, PATH: join(prefix, 'node_modules/.bin') + delimiter + (env.PATH || '') };
  const verified = await runCommand(process.execPath, [cli, '--version'], { ...options, env: localEnv });
  if (verified.stdout.trim() !== version) throw new Error('Local npm version does not match packageManager');
  return localEnv;
}
