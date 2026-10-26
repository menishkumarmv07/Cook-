export const V3_STORAGE_WARNING_PERCENT = 80;
export const V3_STORAGE_CRITICAL_PERCENT = 90;

export type V3StorageQuotaStatus = {
  severity: "warning" | "critical";
  usageBytes: number;
  quotaBytes: number;
  usedPercent: number;
};

/**
 * Interpret the browser's origin-storage estimate without assuming that every
 * browser exposes a quota. This is a warning only; V3 never deletes user data.
 */
export function assessV3StorageQuota(
  usage: unknown,
  quota: unknown,
): V3StorageQuotaStatus | null {
  if (typeof usage !== "number" || !Number.isFinite(usage) || usage < 0) return null;
  if (typeof quota !== "number" || !Number.isFinite(quota) || quota <= 0) return null;

  const rawPercent = (usage / quota) * 100;
  if (!Number.isFinite(rawPercent) || rawPercent < V3_STORAGE_WARNING_PERCENT) return null;

  return {
    severity: rawPercent >= V3_STORAGE_CRITICAL_PERCENT ? "critical" : "warning",
    usageBytes: Math.round(usage),
    quotaBytes: Math.round(quota),
    usedPercent: Math.min(100, Math.round(rawPercent)),
  };
}

export function formatV3StorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1_024) return Math.round(bytes) + " B";

  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes;
  let index = -1;
  while (value >= 1_024 && index < units.length - 1) {
    value /= 1_024;
    index += 1;
  }
  return value.toFixed(value >= 10 ? 0 : 1) + " " + units[index];
}
