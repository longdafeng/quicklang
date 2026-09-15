import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { clean } from "../../../scripts/clean.mjs";

/** Create a fixture file and its parents under the supplied root. */
function fixture(root, path) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), "fixture");
}

test("make clean removes outputs, preserves dependencies and data, and is repeatable", () => {
  const root = mkdtempSync(join(tmpdir(), "quicklang-clean-"));
  const removed = [
    "build/cargo/debug/app", "build/test-databases/test/data", "build/coverage/ui/index.html",
    "dist/releases/app.zip", "target/debug/app", "src/shell/gen/schemas/desktop.json",
    "deps/cache/seekdb-driver-build/libseekdb.dylib", "docs/.vitepress/cache/page.js",
    "docs/.vitepress/dist/index.html", "node_modules/.vite/results.json",
    "src/mac_ui/node_modules/.vite-temp/config.js", "docs/node_modules/.cache/data",
    "src/mac_ui/tsconfig.tsbuildinfo", ".DS_Store",
  ];
  const retained = [
    "src/mac_ui/src/main.tsx", "Cargo.lock", "package-lock.json", ".env",
    "deps/cache/cargo/bin/cargo", "deps/cache/seekdb-runtime/libseekdb.dylib",
    "deps/cache/seekdb-bindings-src/local-edit.c", "node_modules/vite/package.json",
    "data/seekdb/database", "repos/source.c",
  ];
  try {
    for (const path of [...removed, ...retained]) fixture(root, path);
    mkdirSync(join(root, "scripts"));
    for (const path of ["Makefile", "scripts/tasks.mjs", "scripts/clean.mjs"]) {
      copyFileSync(path, join(root, path));
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync("make", ["clean"], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      for (const path of removed) assert.equal(existsSync(join(root, path)), false, path);
      for (const path of retained) assert.equal(existsSync(join(root, path)), true, path);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("clean never traverses symlinked outputs or parent directories", () => {
  const root = mkdtempSync(join(tmpdir(), "quicklang-clean-links-"));
  const outside = mkdtempSync(join(tmpdir(), "quicklang-clean-outside-"));
  try {
    fixture(outside, ".vite/cache");
    fixture(outside, "keep.tsbuildinfo");
    symlinkSync(outside, join(root, "build"), "dir");
    symlinkSync(outside, join(root, "node_modules"), "dir");
    symlinkSync(outside, join(root, "linked-source"), "dir");
    clean(root);
    assert.equal(existsSync(join(root, "build")), false);
    assert.equal(existsSync(join(outside, ".vite/cache")), true);
    assert.equal(existsSync(join(outside, "keep.tsbuildinfo")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
