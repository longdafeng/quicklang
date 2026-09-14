import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyLibrary, verifyLinks } from "../../../scripts/release/package.mjs";

test("release allows system libraries and bundled colocated dependencies", () => {
  const directory = mkdtempSync(join(tmpdir(), "quicklang-release-"));
  try {
    writeFileSync(join(directory, "libssl.3.dylib"), "fixture");
    assert.doesNotThrow(() => verifyLinks("binary:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n\t/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit (compatibility version 1.0.0)\n\t@loader_path/libssl.3.dylib (compatibility version 3.0.0)\n", directory));
    for (const dependency of ["/opt/homebrew/lib/libssl.3.dylib", "/Users/developer/libseekdb.dylib", "@rpath/libssl.3.dylib", "@loader_path/missing.dylib", "@loader_path/../outside.dylib"]) {
      assert.throws(() => verifyLinks(`binary:\n\t${dependency} (compatibility version 1.0.0)`, directory), /Non-portable native dependency/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Exercise release validation with a complete seed and damaged or missing resources. */
test("release rejects incomplete or corrupted bundled libraries", () => {
  const directory = mkdtempSync(join(tmpdir(), "quicklang-library-release-"));
  try {
    const files = {};
    for (const name of ["words.jsonl", "wordbooks.jsonl", "legacy-map.jsonl", "merge-conflicts.jsonl", "LICENSE", "ATTRIBUTION.md", "source-manifest.json"]) {
      writeFileSync(join(directory, name), "fixture");
      files[name] = createHash("sha256").update("fixture").digest("hex");
    }
    writeFileSync(join(directory, "manifest.json"), JSON.stringify({
      schema_version: 3, format: "quicklang-word-library-v1", words: 17844, wordbooks: 11, files,
    }));
    assert.doesNotThrow(() => verifyLibrary(directory));
    writeFileSync(join(directory, "words.jsonl"), "corrupt");
    assert.throws(() => verifyLibrary(directory), /checksum mismatch/);
    rmSync(join(directory, "words.jsonl"));
    assert.throws(() => verifyLibrary(directory), /ENOENT/);
    writeFileSync(join(directory, "manifest.json"), "{}");
    assert.throws(() => verifyLibrary(directory), /Invalid bundled/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
