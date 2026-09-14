import { spawn } from 'node:child_process';

/** Run a command with streamed output; retry launch kills only when explicitly safe. */
export async function runCommand(command, args, { cwd, env = process.env, quiet = false, retryKilled = false, allowedStatuses = [0] } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (!quiet) console.log(`> ${command} ${args.join(' ')}`);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => {
        stdout = (stdout + data).slice(-65536);
        if (!quiet) process.stdout.write(data);
      });
      child.stderr.on('data', data => {
        stderr = (stderr + data).slice(-65536);
        if (!quiet) process.stderr.write(data);
      });
      child.on('error', reject);
      child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    });
    if (allowedStatuses.includes(result.status)) return result;
    const killed = result.signal === 'SIGKILL' || /signal: 9, SIGKILL/.test(result.stderr);
    if (retryKilled && killed && attempt < 2) {
      console.warn(`${command} was killed during startup; retrying (${attempt + 1}/2).`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    throw new Error(`${command} failed (${result.signal || result.status})${quiet ? ': ' + result.stderr.trim() : ''}`);
  }
}
