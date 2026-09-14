import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("desktop CSP permits bundled wordbook fetches and native IPC", () => {
  const config = JSON.parse(readFileSync(new URL("../../../src/shell/tauri.conf.json", import.meta.url), "utf8"));
  const directives = Object.fromEntries(config.app.security.csp.split(";").map(value => value.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
  assert.ok(directives["connect-src"].includes("'self'"), "packaged wordbooks must be fetchable from the application origin");
  assert.ok(directives["connect-src"].includes("ipc:"));
  assert.ok(directives["connect-src"].includes("http://ipc.localhost"));
  assert.ok(!directives["connect-src"].includes("*"));
});
