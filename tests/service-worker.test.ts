import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync("public/sw.js", "utf8");

test("service worker does not precache or store private HTML navigations", () => {
  assert.match(worker, /const PRECACHE_URLS = \[OFFLINE_URL, "\/icon\.svg", "\/manifest\.webmanifest"\]/);
  assert.doesNotMatch(worker, /cache\.put\("\/",\s*copy\)/);
  assert.match(worker, /if \(request\.mode === "navigate"\)[\s\S]*?fetch\(request\)\.catch/);
  assert.match(worker, /Network-only for HTML/);
});

test("service worker keeps a generic offline fallback without workspace HTML", () => {
  assert.match(worker, /const OFFLINE_URL = "\/offline\.html"/);
  assert.match(worker, /You are offline\. Reconnect to sign in securely\./);
  assert.doesNotMatch(worker, /caches\.match\("\/"\)/);
});
