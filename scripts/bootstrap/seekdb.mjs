#!/usr/bin/env node
// Pinned, repository-local runtime; never runs the macOS package installer.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, chmodSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const pinPath = join(root, "deps/seekdb/runtime.lock.json");
const pin = JSON.parse(readFileSync(pinPath, "utf8"));
const cache = join(root, "deps/cache");
const downloads = join(cache, "seekdb-downloads");
const runtime = join(cache, "seekdb-runtime");
const source = join(cache, "seekdb-bindings-src");
const driverBuild = join(cache, "seekdb-driver-build");
const sslSource = join(downloads, `openssl-${pin.openssl_version}`);
const sslPrefix = join(cache, `openssl-${pin.openssl_version}`);
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed (${result.status})`);
}
function output(command, args, cwd = root, includeStderr = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  return (result.stdout + (includeStderr ? result.stderr : "")).trim();
}
function download(url, path, digest) {
  if (!existsSync(path)) run("curl", ["-fLsS", "--retry", "2", url, "-o", path]);
  if (hash(path) !== digest) throw new Error(`Checksum mismatch: ${path}. Move the incomplete file aside and retry.`);
}
function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${name}`);
    return entry.isDirectory() ? files(join(dir, entry.name), name + "/") : [name];
  });
}
export function verify(runtimeDirectory = runtime, pinFile = pinPath) {
  const manifest = JSON.parse(readFileSync(join(runtimeDirectory, "manifest.json"), "utf8"));
  if (manifest.pin_sha256 !== hash(pinFile)) throw new Error("Runtime pin changed; run make init");
  for (const name of ["seekdb", "libseekdb.dylib", "libssl.3.dylib", "libcrypto.3.dylib"])
    if (!manifest.files[name]) throw new Error(`Incomplete runtime: ${name}`);
  const names = files(runtimeDirectory).filter(name => name !== "manifest.json");
  if (names.length !== Object.keys(manifest.files).length) throw new Error("Unexpected runtime files");
  for (const name of names) if (hash(join(runtimeDirectory, name)) !== manifest.files[name]) throw new Error(`Runtime checksum mismatch: ${name}`);
  console.log(`Verified seekdb ${pin.version} runtime (${names.length} files)`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
try {
  if (process.argv.includes("--help")) {
    console.log("Prepare pinned seekdb ARM64 runtime, C driver and OpenSSL in deps/cache. --offline-check verifies cached artifacts only.");
    process.exit(0);
  }
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Embedded seekdb packaging currently requires macOS 15+ ARM64");
  if (process.argv.includes("--offline-check")) { verify(); process.exit(0); }
  if (existsSync(join(runtime, "manifest.json"))) { verify(); process.exit(0); }
  mkdirSync(downloads, { recursive: true }); mkdirSync(runtime, { recursive: true });
  const pkg = join(downloads, "seekdb-1.4.0-macos-arm64.pkg");
  download(pin.engine_url, pkg, pin.engine_sha256);
  const expanded = join(downloads, "pkg");
  if (!existsSync(expanded)) run("pkgutil", ["--expand-full", pkg, expanded]);
  const engine = join(expanded, "_pkg_component.pkg/Payload/opt/seekdb/bin/seekdb");
  if (!output(engine, ["-V"], root, true).includes(`seekdb ${pin.version}.0`)) throw new Error("Unexpected engine version");
  const sslArchive = join(downloads, `openssl-${pin.openssl_version}.tar.gz`);
  download(pin.openssl_url, sslArchive, pin.openssl_sha256);
  if (!existsSync(sslSource)) run("tar", ["-xzf", sslArchive, "-C", downloads]);
  if (!existsSync(join(sslPrefix, "lib/libcrypto.3.dylib"))) {
    run("perl", ["Configure", "darwin64-arm64-cc", "shared", "no-tests", "no-apps", "no-docs", `--prefix=${sslPrefix}`, "--libdir=lib", "-mmacosx-version-min=15.0"], sslSource);
    run("make", ["-s", "-j4"], sslSource); run("make", ["-s", "install_sw"], sslSource);
  }
  if (!existsSync(source)) run("git", ["clone", "--no-checkout", pin.bindings_repository, source]);
  if (output("git", ["status", "--porcelain"], source)) throw new Error("Driver source is modified; preserve changes and rebuild in a separate checkout");
  run("git", ["checkout", "--detach", pin.bindings_commit], source);
  run("git", ["submodule", "update", "--init", "--recursive", "--", "deps/mariadb-connector-c"], source);
  const connector = join(source, "deps/mariadb-connector-c");
  if (output("git", ["rev-parse", "HEAD"], connector) !== pin.connector_commit) throw new Error("Connector pin mismatch");
  run("cmake", ["-S", source, "-B", driverBuild, "-DSEEKDB_BUILD_PYTHON=OFF", "-DBUILD_TESTING=OFF", "-DWITH_EXTERNAL_ZLIB=YES", "-DWITH_SQLITE=OFF", "-DWITH_SSL=OPENSSL", "-DCMAKE_DISABLE_FIND_PACKAGE_OpenSSL=FALSE", `-DOPENSSL_ROOT_DIR=${sslPrefix}`, `-DOPENSSL_INCLUDE_DIR=${sslPrefix}/include`, `-DOPENSSL_SSL_LIBRARY=${sslPrefix}/lib/libssl.3.dylib`, `-DOPENSSL_CRYPTO_LIBRARY=${sslPrefix}/lib/libcrypto.3.dylib`, "-DCMAKE_OSX_DEPLOYMENT_TARGET=15.0", "-DCMAKE_BUILD_TYPE=Release"]);
  run("cmake", ["--build", driverBuild, "--target", "seekdb", "--parallel", "4"]);
  copyFileSync(engine, join(runtime, "seekdb")); chmodSync(join(runtime, "seekdb"), 0o755);
  copyFileSync(join(driverBuild, "libseekdb.dylib"), join(runtime, "libseekdb.dylib"));
  for (const name of ["libssl.3.dylib", "libcrypto.3.dylib"]) copyFileSync(join(sslPrefix, "lib", name), join(runtime, name));
  for (const name of ["libseekdb.dylib", "libssl.3.dylib", "libcrypto.3.dylib"]) {
    const path = join(runtime, name);
    const links = output("otool", ["-L", path]).split("\n").slice(1).map(line => line.trim().split(" (compatibility")[0]);
    for (const link of links) {
      if (link.startsWith("/usr/lib/") || link.startsWith("/System/Library/")) continue;
      if (!["libseekdb.dylib", "libssl.3.dylib", "libcrypto.3.dylib"].includes(basename(link))) throw new Error(`Unexpected native dependency: ${link}`);
      run("install_name_tool", ["-change", link, "@loader_path/" + basename(link), path]);
    }
    run("install_name_tool", ["-id", "@loader_path/" + name, path]);
    run("codesign", ["--force", "--sign", "-", path]);
  }
  mkdirSync(join(runtime, "licenses"), { recursive: true });
  for (const [from, to] of [[join(expanded, "Resources/LICENSE"), "seekdb-LICENSE"], [join(source, "LICENSE"), "bindings-LICENSE"], [join(connector, "COPYING.LIB"), "mariadb-COPYING.LIB"], [join(sslSource, "LICENSE.txt"), "openssl-LICENSE.txt"]])
    copyFileSync(from, join(runtime, "licenses", to));
  mkdirSync(join(runtime, "sources"), { recursive: true });
  run("git", ["archive", "--format=tar.gz", `--output=${join(runtime, "sources/seekdb-bindings.tar.gz")}`, pin.bindings_commit], source);
  run("git", ["archive", "--format=tar.gz", `--output=${join(runtime, "sources/mariadb-connector-c.tar.gz")}`, pin.connector_commit], connector);
  copyFileSync(join(root, "deps/seekdb/README.md"), join(runtime, "sources/REBUILD.md"));
  const manifest = { version: pin.version, pin_sha256: hash(pinPath), files: Object.fromEntries(files(runtime).map(name => [name, hash(join(runtime, name))])) };
  writeFileSync(join(runtime, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  verify();
} catch (error) { console.error(error.message); process.exitCode = 1; }

}
