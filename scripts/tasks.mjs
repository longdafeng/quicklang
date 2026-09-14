#!/usr/bin/env node
// Cross-platform task runner. Make stays a thin, stable interface.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, lstatSync } from "node:fs";
import { resolve, join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const env = { ...process.env };
const localNpm = join(root, "deps/cache/npm/node_modules/.bin");
if (existsSync(join(localNpm, "npm"))) env.PATH = localNpm + delimiter + env.PATH;
if (env.QUICKLANG_DATA_DIR) env.QUICKLANG_DATA_DIR = resolve(root, env.QUICKLANG_DATA_DIR);
const localCargo = join(root, "deps/cache/cargo");
if (existsSync(join(localCargo, "bin/cargo"))) {
  env.CARGO_HOME = localCargo; env.RUSTUP_HOME = join(root, "deps/cache/rustup");
  env.PATH = join(localCargo, "bin") + delimiter + env.PATH;
}
function run(command, args, cwd = root) {
  console.log("> " + command + " " + args.join(" "));
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" && command === "npm" });
  if (result.error?.code === "ENOENT") {
    const guidance = command === "cargo"
      ? "Run make init to automatically install project-local Rust 1.93.1 (including rustfmt and clippy). See README.md for prerequisites."
      : `Install ${command} and ensure it is available on PATH.`;
    throw new Error(`Required command not found: ${command}. ${guidance}`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " failed (" + result.status + ")");
}
const npm = (...args) => run("npm", args);
const cargo = (...args) => run("cargo", args);
const tauri = (...args) => run(process.execPath, [join(root, "node_modules/@tauri-apps/cli/tauri.js"), ...args], join(root, "src/shell"));
function checkLicense() { run(process.execPath, ["scripts/compliance/check.mjs"]); }
function help() {
  console.log("QuickLang: make init / doctor / dev / build / release / install / test / test-db / test-coverage / test-coverage-db / docs / license-check / content / review");
  console.log("seekdb 1.4.0 embedded runtime: macOS ARM64. build creates an unsigned desktop application.");
  console.log("Alternative on Windows: node scripts/tasks.mjs <target>");
}
function doctor() { run(process.execPath, ["--version"]); npm("--version"); cargo("--version"); }
/** Build desktop artifacts, retrying only compiler startup kills at most twice. */
async function build() {
  const { runCommand } = await import("./bootstrap/process.mjs");
  run(process.execPath, ["scripts/bootstrap/seekdb.mjs", "--offline-check"]);
  checkLicense();
  run(process.execPath, ["scripts/content/generate-word-library.mjs"]);
  npm("run", "build");
  await runCommand("cargo", ["build", "--locked", "--offline", "--release", "-p", "quicklang-server"], { cwd: root, env, retryKilled: true });
  if (!["darwin", "win32"].includes(process.platform)) throw new Error("Desktop packaging is currently configured for macOS/Windows only");
  const args = ["build", "--no-sign", "--bundles", process.platform === "darwin" ? "app" : "nsis"];
  if (process.platform === "win32") args.push("--config", "tauri.windows.conf.json");
  await runCommand(process.execPath, [join(root, "node_modules/@tauri-apps/cli/tauri.js"), ...args, "--", "--locked", "--offline"], { cwd: join(root, "src/shell"), env, retryKilled: true });
  const source = join(root, "build/cargo/release/bundle");
  const destination = join(root, "dist", process.platform + "-" + process.arch);
  mkdirSync(destination, { recursive: true }); cpSync(source, destination, { recursive: true });
  cpSync(join(root, "version"), join(root, "build/cargo/release/version"));
  cpSync(join(root, "version"), join(destination, "version"));
  cpSync(join(root, "version"), join(destination, process.platform === "darwin" ? "macos" : "nsis", "version"));
}
/** Build and install the application without overwriting an existing installation. */
async function install() {
  if (process.platform !== "darwin") throw new Error("Run the generated Windows installer from dist; automatic install is macOS-only");
  await build();
  const application = join(root, "dist/darwin-" + process.arch, "macos/QuickLang.app");
  const applications = process.env.INSTALL_DIR || join(process.env.HOME, "Applications");
  const destination = resolve(applications, "QuickLang.app");
  if (existsSync(destination)) throw new Error("Installation target already exists; move the old app aside before installing");
  mkdirSync(applications, { recursive: true });
  if (lstatSync(applications).isSymbolicLink()) throw new Error("Refusing a symlink install directory");
  cpSync(application, destination, { recursive: true, errorOnExist: true, force: false });
  console.log("Installed " + destination);
}
try {
  switch (process.argv[2] || "help") {
    case "--help": case "help": help(); break;
    case "doctor": doctor(); break;
    case "init": {
      const { initialize } = await import("./bootstrap/init.mjs");
      await initialize(root, env); break;
    }
    case "dev":
      run(process.execPath, ["scripts/content/generate-word-library.mjs"]);
      tauri("dev"); break;
    case "build": await build(); break;
    case "release": {
      if (process.platform !== "darwin" || process.arch !== "arm64") {
        throw new Error("All-in-one releases currently require macOS 15+ Apple Silicon");
      }
      await build();
      const { createRelease } = await import("./release/package.mjs");
      await createRelease(root);
      break;
    }
    case "install": await install(); break;
    case "test":
      checkLicense(); cargo("fmt", "--all", "--", "--check");
      cargo("clippy", "--locked", "--offline", "--workspace", "--all-targets", "--", "-D", "warnings");
      cargo("test", "--locked", "--offline", "--workspace"); npm("run", "typecheck");
      npm("test"); npm("run", "test:scripts"); break;
    case "test-coverage":
      npm("run", "test:coverage"); npm("run", "test:scripts:coverage");
      cargo("llvm-cov", "--workspace", "--locked", "--offline", "--lcov", "--output-path", "build/coverage/rust-unit.lcov");
      run(process.execPath, ["scripts/testing/rust-coverage.mjs", "build/coverage/rust-unit.lcov", "build/coverage/rust-unit-summary.json", "55"]); break;
    case "test-coverage-db":
      run(process.execPath, ["scripts/content/generate-word-library.mjs"]);
      run(process.execPath, ["scripts/bootstrap/seekdb.mjs", "--offline-check"]);
      cargo("llvm-cov", "clean", "--workspace");
      cargo("llvm-cov", "--workspace", "--locked", "--offline", "--no-report");
      cargo("llvm-cov", "--workspace", "--locked", "--offline", "--no-report", "--", "--ignored", "--test-threads=1");
      cargo("llvm-cov", "report", "--lcov", "--output-path", "build/coverage/rust-db.lcov");
      run(process.execPath, ["scripts/testing/rust-coverage.mjs", "build/coverage/rust-db.lcov", "build/coverage/rust-db-summary.json", "75"]); break;
    case "test-db":
      run(process.execPath, ["scripts/content/generate-word-library.mjs"]);
      run(process.execPath, ["scripts/bootstrap/seekdb.mjs", "--offline-check"]);
      cargo("test", "--locked", "--offline", "-p", "quicklang-tests", "--test", "seekdb", "--", "--ignored", "--nocapture", "--test-threads=1");
      cargo("test", "--locked", "--offline", "-p", "quicklang-tests", "--test", "word_library_schema", "--", "--ignored", "--nocapture", "--test-threads=1");
      cargo("test", "--locked", "--offline", "-p", "quicklang-storage-seekdb", "--lib", "--", "--ignored", "--nocapture", "--test-threads=1");
      cargo("test", "--locked", "--offline", "-p", "quicklang-shell", "--lib", "--", "--include-ignored", "--test-threads=1"); break;
    case "docs": npm("run", "docs"); break;
    case "license-check": checkLicense(); break;
    case "content":
      run(process.execPath, ["scripts/content/import-ink.mjs"]);
      run(process.execPath, ["scripts/content/generate-word-library.mjs"]); break;
    case "review":
      checkLicense(); run("git", ["diff", "--check"]);
      cargo("clippy", "--locked", "--offline", "--workspace", "--all-targets", "--", "-D", "warnings");
      npm("run", "typecheck"); break;
    default: throw new Error("Unknown target: " + process.argv[2]);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
