import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { downloadVerified } from './download.mjs';
import { runCommand } from './process.mjs';
import { fetchDependencies } from './network.mjs';

/** Read the exact Rust version and required components from the repository's toolchain file. */
export function readToolchain(root) {
  const text = readFileSync(join(root, 'rust-toolchain.toml'), 'utf8');
  const version = text.match(/^channel\s*=\s*"([\d.]+)"/m)?.[1];
  const components = [...(text.match(/^components\s*=\s*\[([^\]]*)\]/m)?.[1] || '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
  if (!version || !components.length) throw new Error('Expected a pinned Rust channel and components in rust-toolchain.toml');
  return { version, components };
}

/** Install and validate repository-local Rust; never alter global Rust or shell startup files. */
export async function ensureRust(root, env) {
  const { version, components } = readToolchain(root);
  const cargoHome = join(root, 'deps/cache/cargo');
  const localEnv = { ...env, RUSTUP_TOOLCHAIN: version, CARGO_HOME: cargoHome, RUSTUP_HOME: join(root, 'deps/cache/rustup'), PATH: join(cargoHome, 'bin') + delimiter + (env.PATH || '') };
  const options = { cwd: root, env: localEnv, retryKilled: true };
  const rustup = join(cargoHome, 'bin/rustup');
  if (!existsSync(rustup)) {
    const pin = JSON.parse(readFileSync(join(root, 'scripts/bootstrap/rustup.lock.json'), 'utf8'));
    const installer = join(root, 'deps/cache', `rustup-init-${pin.version}`);
    await downloadVerified(pin.url, installer, pin.sha256, { env });
    chmodSync(installer, 0o755);
    await runCommand(installer, ['-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', 'none'], options);
  }
  await runCommand(rustup, ['set', 'auto-self-update', 'disable'], { ...options, quiet: true });
  const installed = await runCommand(rustup, ['toolchain', 'list'], { ...options, quiet: true });
  let ready = installed.stdout.split('\n').some(line => line.startsWith(version + '-'));
  if (ready) {
    const present = await runCommand(rustup, ['component', 'list', '--toolchain', version, '--installed'], { ...options, quiet: true });
    ready = components.every(component => present.stdout.split('\n').some(line => line.startsWith(component + '-')));
  }
  if (!ready) {
    await fetchDependencies(rustup, ['toolchain', 'install', version, '--profile', 'minimal', ...components.flatMap(component => ['--component', component])], options);
  }
  // Warm up read-only entry points before compiling or opening the user's database.
  for (const command of ['cargo', 'rustc', 'rustdoc', 'rustfmt']) {
    await runCommand(join(cargoHome, 'bin', command), ['--version'], options);
  }
  await runCommand(join(cargoHome, 'bin/cargo'), ['clippy', '--version'], options);
  return localEnv;
}
