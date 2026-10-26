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

/**
 * Present a safe, actionable explanation when IndexedDB refuses a write because
 * the browser's origin storage is full. This does not retry, delete, or overwrite
 * any user data; callers should preserve their existing project and back it up
 * before freeing browser storage.
 */
export function getV3StorageQuotaErrorMessage(error: unknown): string | null {
  if (!error || (typeof error !== "object" && typeof error !== "function")) return null;
  const details = error as { name?: unknown; message?: unknown };
  const name = typeof details.name === "string" ? details.name : "";
  const message = typeof details.message === "string" ? details.message : "";
  if (
    name === "QuotaExceededError" ||
    /quota(?:exceeded| exceeded)|storage(?: space)? is full/i.test(name + " " + message)
  ) {
    return "This browser's local storage is full, so the change was not saved. Keep the current project open, export its JSON backup and a production-bundle ZIP, then free browser storage only after verifying your backups. V3 does not delete stored projects automatically.";
  }
  return null;
}

/** Keep existing validation errors intact while making quota failures actionable. */
export function formatV3StorageErrorMessage(error: unknown, fallback: string): string {
  return getV3StorageQuotaErrorMessage(error) ??
    (error instanceof Error ? error.message : fallback);
}

