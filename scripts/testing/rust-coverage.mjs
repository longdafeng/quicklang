// LLVM counts inline Rust test bodies too. Report production lines separately.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function testLines(source) {
  const lines = source.split('\n'), excluded = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!/^#\[cfg\(.*\btest\b/.test(lines[i])) continue;
    const start = i;
    while (i < lines.length && !/^mod \w+\s*\{/.test(lines[i])) i++;
    if (i === lines.length) throw new Error('Unsupported test module layout');
    while (++i < lines.length && lines[i] !== '}') { /* top-level module closes at column zero */ }
    if (i === lines.length) throw new Error('Unterminated test module');
    for (let line = start; line <= i; line++) excluded.add(line + 1);
  }
  return excluded;
}
export function summarize(lcov, readSource = path => readFileSync(path, 'utf8')) {
  const files = [];
  for (const record of lcov.split('end_of_record')) {
    const filename = record.match(/^SF:(.+)$/m)?.[1]; if (!filename) continue;
    const excluded = testLines(readSource(filename));
    const counts = new Map();
    for (const match of record.matchAll(/^DA:(\d+),(\d+)/gm)) {
      const line = Number(match[1]); if (!excluded.has(line)) counts.set(line, Math.max(counts.get(line) ?? 0, Number(match[2])));
    }
    const covered = [...counts.values()].filter(n => n > 0).length, total = counts.size;
    files.push({ file: filename, covered, total, percent: total ? covered / total * 100 : 100 });
  }
  if (!files.length) throw new Error('No source coverage records');
  const covered = files.reduce((n, f) => n + f.covered, 0), total = files.reduce((n, f) => n + f.total, 0);
  return { metric: 'Rust production line coverage (inline cfg(test) modules excluded)', covered, total, percent: total ? covered / total * 100 : 100, files };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, minimum = '0'] = process.argv.slice(2);
  if (!input || !output || !Number.isFinite(Number(minimum))) throw new Error('Usage: rust-coverage.mjs <lcov> <summary.json> [minimum-lines-percent]');
  const report = summarize(readFileSync(input, 'utf8')); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.metric}: ${report.percent.toFixed(2)}% (${report.covered}/${report.total})`);
  if (report.percent < Number(minimum)) { console.error(`Coverage is below ${minimum}%`); process.exitCode = 1; }
}
