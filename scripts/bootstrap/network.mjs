import { runCommand } from './process.mjs';

/** Return an isolated network environment without changing the user's shell configuration. */
export function networkEnvironment(env, mode) {
  if (mode === 'direct') return { ...env, NO_PROXY: '*', no_proxy: '*' };
  return { ...env };
}

/** Compare bounded official-site probes when a proxy exists; honor explicit network choices. */
export async function selectNetwork(env, probeUrl = 'https://static.rust-lang.org/rustup/release-stable.toml') {
  const mode = env.QUICKLANG_NETWORK || 'auto';
  if (!['auto', 'proxy', 'direct'].includes(mode)) throw new Error('QUICKLANG_NETWORK must be auto, proxy or direct');
  if (mode !== 'auto' || !Object.keys(env).some(key => /^(https?|all)_proxy$/i.test(key) && env[key])) {
    return networkEnvironment(env, mode);
  }
  const results = await Promise.all(['proxy', 'direct'].map(async route => {
    try {
      const result = await runCommand('curl', ['-fLsS', '--connect-timeout', '3', '--max-time', '6', '-o', '/dev/null', '-w', '%{time_total}', probeUrl], {
        env: networkEnvironment(env, route), quiet: true,
      });
      return { route, seconds: Number(result.stdout) };
    } catch { return { route, seconds: Infinity }; }
  }));
  const [proxy, direct] = results;
  const route = direct.seconds < proxy.seconds * 0.75 ? 'direct' : 'proxy';
  console.log(`Network: ${route} (automatic probe; override with QUICKLANG_NETWORK=proxy|direct).`);
  return networkEnvironment(env, route);
}

/** Retry dependency downloads once using the other route after a network failure. */
export async function fetchDependencies(command, args, options) {
  try { return await runCommand(command, args, options); }
  catch (error) {
    if ((options.env.QUICKLANG_NETWORK || 'auto') !== 'auto') throw error;
    const direct = options.env.NO_PROXY === '*' || options.env.no_proxy === '*';
    const alternate = direct ? { ...options.env, NO_PROXY: '', no_proxy: '' } : networkEnvironment(options.env, 'direct');
    console.warn(`Dependency fetch failed; retrying once with ${direct ? 'configured proxy' : 'direct connection'}.`);
    return runCommand(command, args, { ...options, env: alternate });
  }
}
