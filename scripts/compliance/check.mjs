#!/usr/bin/env node
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
if (process.argv.includes("--help")) { console.log("Checks source boundaries and dependency declarations; writes build/compliance report."); process.exit(0); }
const root = fileURLToPath(new URL("../../", import.meta.url));
const policy = JSON.parse(readFileSync(join(root, "deps/manifest.lock.json"), "utf8"));
if (policy.license_profile !== "clean-room") throw new Error("Only the audited clean-room framework profile is currently supported");
for (const required of ["LICENSE", "NOTICE.md", "LICENSE_POLICY.md", "Cargo.lock", "package-lock.json"])
  if (!existsSync(join(root, required))) throw new Error("Missing " + required);
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", "gen"].includes(entry.name)) return [];
    const full = join(path, entry.name);
    return entry.isDirectory() ? walk(full) : entry.isFile() ? [full] : [];
  });
}
const checked = [];
for (const path of walk(join(root, "src"))) {
  if (!/\.(rs|ts|tsx|json|toml)$/.test(path)) continue;
  const text = readFileSync(path, "utf8");
  if (/GNU (?:AFFERO )?GENERAL PUBLIC LICENSE|SPDX-License-Identifier:\s*(?:A?GPL)/i.test(text))
    throw new Error("Copyleft source found: " + path);
  if (/from\s+["'][^"']*repos\/|path\s*=\s*["'][^"']*repos\//.test(text))
    throw new Error("Reference repository dependency found: " + path);
  checked.push(path.slice(root.length));
}
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const dependencies = Object.entries(lock.packages).filter(([path, pkg]) => path.includes("node_modules/") && !pkg.link)
  .map(([path, pkg]) => ({ path, version: pkg.version, license: pkg.license || "UNKNOWN" }));
if (dependencies.some(x => /AGPL|GPL-2|GPL-3|sqlite/i.test(x.license + " " + x.path)))
  throw new Error("Unexpected copyleft or SQLite npm dependency; inspect lockfile");
const cargoLock = readFileSync(join(root, "Cargo.lock"), "utf8");
if (/name = "(?:rusqlite|libsqlite3-sys|sqlx-sqlite)"/.test(cargoLock))
  throw new Error("SQLite Rust dependency is prohibited");
const report = { profile: policy.license_profile, checked_source_files: checked.length, npm_dependencies: dependencies,
  native_runtime: policy.runtime,
  limitations: ["Rust and engine transitive licenses require release auditing", "Source fingerprint checks do not prove legal independence", "Native hashes are verified by scripts/bootstrap/seekdb.mjs"] };
mkdirSync(join(root, "build/compliance"), { recursive: true });
writeFileSync(join(root, "build/compliance/dependencies.json"), JSON.stringify(report, null, 2) + "\n");
console.log("License/layout checks passed (" + checked.length + " source files). Release audit limitations are recorded.");
