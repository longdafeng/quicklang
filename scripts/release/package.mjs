import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { accessSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verify } from "../bootstrap/seekdb.mjs";

/** Execute a packaging tool and return stdout, rejecting failed or missing tools. */
function output(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`${command} failed (${result.signal || result.status}): ${result.stderr}`);
  }
  return result.stdout;
}

/** Reject native dependencies outside macOS or the colocated runtime directory. */
export function verifyLinks(listing, binaryDirectory) {
  for (const line of listing.split("\n").slice(1)) {
    const dependency = line.trim().split(" (compatibility")[0];
    if (!dependency || dependency.startsWith("/usr/lib/") || dependency.startsWith("/System/Library/")) continue;
    const local = dependency.match(/^@loader_path\/([^/]+)$/);
    if (local && existsSync(join(binaryDirectory, local[1]))) continue;
    throw new Error(`Non-portable native dependency: ${dependency}`);
  }
}

/** Verify the complete offline library before publishing a release archive. */
export function verifyLibrary(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  const names = ["words.jsonl", "wordbooks.jsonl", "legacy-map.jsonl", "merge-conflicts.jsonl", "LICENSE", "ATTRIBUTION.md", "source-manifest.json"];
  if (manifest.schema_version !== 3 || manifest.format !== "quicklang-word-library-v1" ||
      !Number.isInteger(manifest.words) || manifest.words <= 0 || manifest.wordbooks !== 11 ||
      !manifest.files || Object.keys(manifest.files).length !== names.length) {
    throw new Error("Invalid bundled word library manifest");
  }
  for (const name of names) {
    const bytes = readFileSync(join(directory, name));
    if (createHash("sha256").update(bytes).digest("hex") !== manifest.files[name]) {
      throw new Error(`Bundled word library checksum mismatch: ${name}`);
    }
  }
}

/** Validate bundled runtime hashes, executable permissions, architecture and native links. */
export function verifyApplication(application, root) {
  const resources = join(application, "Contents/Resources");
  const runtime = join(resources, "seekdb");
  verifyLibrary(join(resources, "word-library"));
  verify(runtime, join(root, "deps/seekdb/runtime.lock.json"));
  for (const name of ["LICENSE", "NOTICE.md", "licenses"]) accessSync(join(resources, name));
  for (const name of ["licenses/seekdb-LICENSE", "licenses/bindings-LICENSE", "licenses/mariadb-COPYING.LIB", "licenses/openssl-LICENSE.txt", "sources/seekdb-bindings.tar.gz", "sources/mariadb-connector-c.tar.gz", "sources/REBUILD.md"]) {
    accessSync(join(runtime, name));
  }
  const executable = output("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", join(application, "Contents/Info.plist")]).trim();
  const binaries = [join(application, "Contents/MacOS", executable), ...["seekdb", "libseekdb.dylib", "libssl.3.dylib", "libcrypto.3.dylib"].map(name => join(runtime, name))];
  accessSync(binaries[0], constants.X_OK);
  accessSync(join(runtime, "seekdb"), constants.X_OK);
  for (const binary of binaries) {
    output("lipo", [binary, "-verify_arch", "arm64"]);
    verifyLinks(output("otool", ["-L", binary]), join(binary, ".."));
  }
}

/** Stream a file into SHA-256 without loading a large release archive into memory. */
async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** Build and verify a relocatable ZIP from the fresh app bundle; publish only after validation. */
export async function createRelease(root) {
  const config = JSON.parse(readFileSync(join(root, "src/shell/tauri.conf.json"), "utf8"));
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/.test(config.version)) throw new Error("Invalid release version");
  const name = `QuickLang-${config.version}-macos-arm64`;
  const destination = join(root, "dist/releases");
  mkdirSync(destination, { recursive: true });
  const temporary = mkdtempSync(join(destination, ".release-"));
  try {
    const staging = join(temporary, name);
    mkdirSync(staging);
    cpSync(join(root, "version"), join(staging, "version"));
    const app = join(staging, "QuickLang.app");
    output("ditto", [join(root, "build/cargo/release/bundle/macos/QuickLang.app"), app]);
    verifyApplication(app, root);
    writeFileSync(join(staging, "使用说明.txt"), `QuickLang ${config.version}\n\n适用系统：macOS 15+，Apple Silicon（M 系列芯片）。\n解压后将 QuickLang.app 拖到“应用程序”，双击启动。\n无需安装 Node.js、Rust、Homebrew、seekdb，也无需执行 make init。\n应用包含前端、seekdb 1.4.0、C 驱动、OpenSSL、第三方许可和驱动重建源码。\n首次启动自动创建本地数据库并加载全部内置单词和 11 本单词书，可能需要稍候。每次启动检查并补齐缺失数据，保留已有修改。用户数据保存在：\n~/Library/Application Support/io.github.longdafeng.quicklang/seekdb-1.4.0/\n不会包含发布者的个人数据库。AI 等在线功能仍需网络及相应服务配置。\n\n此包未做 Apple Developer ID 签名和公证。从互联网下载时 macOS 可能阻止打开；\n确认来源可信后，可在“系统设置 → 隐私与安全性”中允许打开。\n面向公开发行的无提示安装体验仍需发布者完成签名和公证。\n`);
    const archive = join(temporary, `${name}.zip`);
    output("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", staging, archive]);
    const extracted = join(temporary, "extracted");
    output("ditto", ["-x", "-k", archive, extracted]);
    verifyApplication(join(extracted, name, "QuickLang.app"), root);
    if (!readFileSync(join(extracted, name, "version")).equals(readFileSync(join(root, "version")))) {
      throw new Error("Release version file does not match the project version file");
    }
    const checksum = `${await sha256(archive)}  ${name}.zip\n`;
    writeFileSync(join(temporary, "SHA256SUMS"), checksum);
    renameSync(archive, join(destination, `${name}.zip`));
    renameSync(join(temporary, "SHA256SUMS"), join(destination, `${name}.zip.sha256`));
    cpSync(join(staging, "version"), join(destination, "version"));
    console.log(`All-in-one release: ${join(destination, `${name}.zip`)}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
