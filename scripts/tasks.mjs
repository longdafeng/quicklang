#!/usr/bin/env node
// Cross-platform task runner. Make stays a thin, stable interface.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, lstatSync } from "node:fs";
import { resolve, join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const env = { ...process.env };
const localCargo = join(root, "deps/cache/cargo");
if (existsSync(join(localCargo, "bin/cargo"))) {
  env.CARGO_HOME = localCargo; env.RUSTUP_HOME = join(root, "deps/cache/rustup");
  env.PATH = join(localCargo, "bin") + delimiter + env.PATH;
}
function run(command, args, cwd = root) {
  console.log("> " + command + " " + args.join(" "));
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" && command === "npm" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " failed (" + result.status + ")");
}
const npm = (...args) => run("npm", args);
const cargo = (...args) => run("cargo", args);
const tauri = (...args) => run(process.execPath, [join(root, "node_modules/@tauri-apps/cli/tauri.js"), ...args], join(root, "src/shell"));
function checkLicense() { run(process.execPath, ["scripts/compliance/check.mjs"]); }
function help() {
  console.log("QuickLang: make init / doctor / dev / build / install / test / docs / license-check / content / review");
  console.log("Framework preview: seekdb integration is pending. build creates an unsigned desktop application.");
  console.log("Alternative on Windows: node scripts/tasks.mjs <target>");
}
function doctor() { run(process.execPath, ["--version"]); npm("--version"); cargo("--version"); }
function build() {
  checkLicense();
  npm("run", "build");
  cargo("build", "--locked", "--offline", "--release", "-p", "quicklang-server");
  if (!["darwin", "win32"].includes(process.platform)) throw new Error("Desktop packaging is currently configured for macOS/Windows only");
  const args = ["build", "--no-sign", "--bundles", process.platform === "darwin" ? "app" : "nsis"];
  if (process.platform === "win32") args.push("--config", "tauri.windows.conf.json");
  tauri(...args, "--", "--locked", "--offline");
  const source = join(root, "build/cargo/release/bundle");
  const destination = join(root, "dist", process.platform + "-" + process.arch);
  mkdirSync(destination, { recursive: true }); cpSync(source, destination, { recursive: true });
}
function install() {
  if (process.platform !== "darwin") throw new Error("Run the generated Windows installer from dist; automatic install is macOS-only");
  build();
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
    case "init":
      doctor(); npm("ci"); cargo("fetch", "--locked");
      console.log("Dependencies ready. seekdb runtime is pending; see deps/seekdb/README.md."); break;
    case "dev":
      tauri("dev"); break;
    case "build": build(); break;
    case "install": install(); break;
    case "test":
      checkLicense(); cargo("fmt", "--all", "--", "--check");
      cargo("clippy", "--locked", "--offline", "--all-targets", "--", "-D", "warnings");
      cargo("test", "--locked", "--offline"); npm("run", "typecheck");
      npm("test"); npm("run", "test:scripts"); break;
    case "docs": npm("run", "docs"); break;
    case "license-check": checkLicense(); break;
    case "content": run(process.execPath, ["scripts/content/import-ink.mjs"]); break;
    case "review":
      checkLicense(); run("git", ["diff", "--check"]);
      cargo("clippy", "--locked", "--offline", "--workspace", "--all-targets", "--", "-D", "warnings");
      npm("run", "typecheck"); break;
    default: throw new Error("Unknown target: " + process.argv[2]);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
