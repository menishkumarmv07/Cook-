import assert from "node:assert/strict";
import test from "node:test";
import {
  assessV3StorageQuota,
  formatV3StorageBytes,
  V3_STORAGE_CRITICAL_PERCENT,
  V3_STORAGE_WARNING_PERCENT,
} from "../lib/v3-storage-quota";

test("does not warn below the configured browser storage threshold", () => {
  assert.equal(assessV3StorageQuota(79, 100), null);
  assert.equal(V3_STORAGE_WARNING_PERCENT, 80);
  assert.equal(V3_STORAGE_CRITICAL_PERCENT, 90);
});

test("warns at 80 percent and marks 90 percent as critical", () => {
  assert.deepEqual(assessV3StorageQuota(80, 100), {
    severity: "warning",
    usageBytes: 80,
    quotaBytes: 100,
    usedPercent: 80,
  });
  assert.equal(assessV3StorageQuota(89, 100)?.severity, "warning");
  assert.equal(assessV3StorageQuota(90, 100)?.severity, "critical");
});

test("caps the displayed percent when a browser reports usage above its estimate", () => {
  const status = assessV3StorageQuota(120, 100);
  assert.equal(status?.severity, "critical");
  assert.equal(status?.usedPercent, 100);
});

test("does not trust missing, non-finite, negative or zero-quota estimates", () => {
  assert.equal(assessV3StorageQuota(undefined, 100), null);
  assert.equal(assessV3StorageQuota(80, undefined), null);
  assert.equal(assessV3StorageQuota(Number.NaN, 100), null);
  assert.equal(assessV3StorageQuota(80, Number.POSITIVE_INFINITY), null);
  assert.equal(assessV3StorageQuota(-1, 100), null);
  assert.equal(assessV3StorageQuota(80, 0), null);
});

test("formats byte estimates with binary storage units", () => {
  assert.equal(formatV3StorageBytes(0), "0 B");
  assert.equal(formatV3StorageBytes(1_023), "1023 B");
  assert.equal(formatV3StorageBytes(1_024), "1.0 KiB");
  assert.equal(formatV3StorageBytes(1_048_576), "1.0 MiB");
  assert.equal(formatV3StorageBytes(-1), "Unknown");
  assert.equal(formatV3StorageBytes(Number.NaN), "Unknown");
});
