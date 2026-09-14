import { homedir, hostname } from 'node:os';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { runCommand } from './process.mjs';
import { selectNetwork, fetchDependencies } from './network.mjs';
import { ensureRust } from './toolchain.mjs';
import { ensureNpm } from './npm.mjs';

/** Reject unsupported hosts before downloading or changing any dependencies. */
export async function preflight(root, env) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js 22.12+ is required');
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Initialization requires macOS 15+ on Apple Silicon; no Windows/Linux embedded runtime is pinned');
  const options = { cwd: root, env, quiet: true };
  const macos = await runCommand('/usr/bin/sw_vers', ['-productVersion'], options);
  if (Number(macos.stdout.split('.')[0]) < 15) throw new Error('macOS 15+ is required');
  try { await runCommand('xcrun', ['--find', 'clang'], options); }
  catch { throw new Error('Apple Command Line Tools are missing. Run xcode-select --install, finish the installation, then rerun make init.'); }
  for (const [command, args] of [['npm', ['--version']], ['git', ['--version']], ['curl', ['--version']], ['perl', ['-v']], ['make', ['--version']]]) {
    await runCommand(command, args, options);
  }
  try { await runCommand('cmake', ['--version'], options); }
  catch {
    const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find(existsSync);
    if (!brew) throw new Error('CMake is missing. Install CMake (or Homebrew), then rerun make init. Rust will be installed automatically.');
    await runCommand(brew, ['install', 'cmake'], { cwd: root, env });
    const prefix = await runCommand(brew, ['--prefix', 'cmake'], options);
    env.PATH = join(prefix.stdout.trim(), 'bin') + delimiter + (env.PATH || '');
    await runCommand('cmake', ['--version'], { ...options, env });
  }
}

/** Acquire a repository initialization lock, recovering only locks owned by a dead local process. */
export function acquireInitLock(root) {
  const directory = join(root, 'deps/cache/init.lock');
  mkdirSync(join(root, 'deps/cache'), { recursive: true });
  try { mkdirSync(directory); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(join(directory, 'owner.json'), 'utf8')); }
    catch { throw new Error(`Initialization lock has no valid owner: ${directory}. Check for another initialization before removing it.`); }
    if (owner.host !== hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error(`Initialization lock cannot be recovered automatically: ${directory}`);
    try { process.kill(owner.pid, 0); }
    catch (probe) {
      if (probe.code !== 'ESRCH') throw probe;
      rmSync(directory, { recursive: true });
      return acquireInitLock(root);
    }
    throw new Error(`Initialization already running (PID ${owner.pid})`);
  }
  writeFileSync(join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, host: hostname() }));
  return () => rmSync(directory, { recursive: true, force: true });
}

/** Prepare dependencies and runtime, then initialize the user's library exactly once. */
export async function initialize(root, initialEnv) {
  let env = { ...initialEnv };
  console.log('[1/6] Checking host prerequisites');
  await preflight(root, env);
  const release = acquireInitLock(root);
  try {
    env = await selectNetwork(env);
    console.log('[2/6] Preparing repository-local Rust');
    env = await ensureRust(root, env);
    console.log('[3/6] Installing locked npm and Cargo dependencies');
    env = await ensureNpm(root, env);
    const options = { cwd: root, env };
    await fetchDependencies('npm', ['ci', '--fetch-retries=2', '--fetch-timeout=60000'], options);
    await fetchDependencies('cargo', ['fetch', '--locked'], { ...options, env: { ...env, CARGO_HTTP_TIMEOUT: '60' }, retryKilled: true });
    console.log('[4/6] Preparing verified seekdb runtime');
    await runCommand(process.execPath, ['scripts/bootstrap/seekdb.mjs'], options);
    console.log('[5/6] Generating library and building importer');
    await runCommand(process.execPath, ['scripts/content/generate-word-library.mjs'], options);
    await runCommand('cargo', ['build', '--locked', '--offline', '-p', 'quicklang-storage-seekdb', '--bin', 'init-word-library'], { ...options, retryKilled: true });
    const importer = join(resolve(root, env.CARGO_TARGET_DIR || 'build/cargo'), 'debug/init-word-library');
    // No arguments validates startup without opening a database; exit 1 prints usage.
    await runCommand(importer, [], { ...options, quiet: true, retryKilled: true, allowedStatuses: [1] });
    const config = JSON.parse(readFileSync(join(root, 'src/shell/tauri.conf.json'), 'utf8'));
    const data = env.QUICKLANG_DATA_DIR ? resolve(root, env.QUICKLANG_DATA_DIR)
      : join(homedir(), 'Library/Application Support', config.identifier, 'seekdb-1.4.0');
    console.log('[6/6] Initializing database and preserving existing library data');
    await runCommand(importer, [join(root, 'build/content/word-library'), data, join(root, 'deps/cache/seekdb-runtime')], options);
    console.log('Initialization complete. Start the application with make dev.');
  } finally { release(); }
}
