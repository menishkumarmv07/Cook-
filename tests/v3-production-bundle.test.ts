import assert from "node:assert/strict";
import test from "node:test";
import { buildV3ZipForTests, MAX_V3_PRODUCTION_BUNDLE_BYTES } from "../lib/v3-production-bundle";

test("creates a valid local ZIP structure with UTF-8 paths, stored file bytes and CRC32", async () => {
  const zip = await buildV3ZipForTests([
    { path: "README.txt", content: "hello" },
    { path: "script/scene-script.md", content: "# Recipe\nScene 1" },
  ]);
  assert.equal(zip.type, "application/zip");
  assert.ok(zip.size > 100);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual(Array.from(bytes.slice(-22, -18)), [0x50, 0x4b, 0x05, 0x06]);
  const decoded = new TextDecoder().decode(bytes);
  assert.ok(decoded.includes("README.txt"));
  assert.ok(decoded.includes("script/scene-script.md"));
  assert.ok(decoded.includes("Scene 1"));
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(header.getUint32(14, true), 0x3610a686); // CRC32("hello")
  assert.equal(header.getUint32(18, true), 5); // uncompressed/stored size
  assert.equal(header.getUint32(22, true), 5);
});

test("rejects path traversal and duplicate ZIP paths", async () => {
  await assert.rejects(
    () => buildV3ZipForTests([{ path: "../secret.txt", content: "no" }]),
    /unsafe file path/i,
  );
  await assert.rejects(
    () => buildV3ZipForTests([
      { path: "same.txt", content: "one" },
      { path: "same.txt", content: "two" },
    ]),
    /duplicate bundle file path/i,
  );
});

test("bundle size safety limit is positive and bounded below ZIP32 maximum", () => {
  assert.ok(MAX_V3_PRODUCTION_BUNDLE_BYTES > 0);
  assert.ok(MAX_V3_PRODUCTION_BUNDLE_BYTES < 0xffffffff);
});
